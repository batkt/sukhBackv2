/**
 * Барилгын групп чат — гишүүнчлэл, хадгалалт, бодит цагийн илгээлт.
 *
 * ГИШҮҮНЧЛЭЛ (хадгалахгүй, хүсэлт бүрт тооцно):
 *   • Ажилтан (токенд `erkh`-тэй): өөрийн байгууллагын барилгууд. Админ эсвэл
 *     оноосон барилгагүй бол бүх барилга, үгүй бол ajiltan.barilguud-аар
 *     хязгаарлагдана (utils/aiTuslakhKheregsel.js-ийн хандлагатай адил).
 *   • Оршин суугч: toots[] дахь OWN_ORG тоотуудын (baiguullagiinId, barilgiinId)
 *     хос + хуучин дээд түвшний baiguullagiinId/barilgiinId. Гэр бүлийн гишүүн
 *     (undsenId) бол үндсэн эзэмшигчийн хаягаар гишүүн болно, илгээгч нь
 *     өөрөө хэвээр.
 *   Барилга нь тухайн байгууллагын barilguud-д байх ёстой.
 *
 * ЧАТЫН ТӨРӨЛ (`barilgiinId` талбар нь чатын түлхүүр):
 *   • "barilga" — барилга бүрт нэг («Миний байр»), түлхүүр = барилгын id.
 *   • "buh"     — байгууллага бүрт нэг («Бүх байр»), түлхүүр = `buh_<baiguullagiinId>`.
 *     Байгууллагын бүх ажилтан, тэр байгууллагад тоот бүхий бүх оршин суугч.
 *
 * НЭР: оршин суугч чатад нэрээрээ биш тоотоороо харагдана («12 тоот»,
 * «Бүх байр»-д «А байр 12 тоот»). Ажилтан нэрээрээ.
 *
 * ХАМГААЛАЛТ: мессеж зөвхөн `chat:<barilgiinId>` room руу явна; room-д зөвхөн
 * гишүүнчлэл шалгасан socket нэгдэнэ. Мессеж тухайн байгууллагын өөрийн баазад.
 */
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { db } = require("zevbackv2");
const Ajiltan = require("../models/ajiltan");
const OrshinSuugch = require("../models/orshinSuugch");
const Baiguullaga = require("../models/baiguullaga");
const BarilgiinChat = require("../models/barilgiinChat");
const BarilgiinChatMessej = require("../models/barilgiinChatMessej");

const MAX_URT = 2000;
const KHUUDAS_DEFAULT = 30;
const KHUUDAS_MAX = 100;
const KHADGALAKH_MS = 30 * 1000; // гишүүнчлэлийн кэш
const KHYAZGAAR = 20; // хэрэглэгч бүрд...
const KHYAZGAAR_MS = 10 * 1000; // ...10 секундэд
const EVENT = "barilgiinChat:messej";
const MAX_KHAVSRALT = 10;

/* ── Хавсралт (зураг, видео) ────────────────────────────────────────────
 * Файл: <root>/<baiguullagiinId>/<chatTulkhuur>/<32 hex>.<ext>
 * Нэр нь 128 бит санамсаргүй тул URL нь таамаглах боломжгүй (medegdel-ийн
 * файлуудын адил нээлттэй serve хийгдэнэ — <img>/<video> Authorization толгой
 * явуулж чаддаггүй). Мессеж илгээхэд клиент зөвхөн файлын НЭРийг өгнө; сервер
 * нь тухайн чатын хавтаст байгаа эсэхийг шалгаад turul/zam-ыг өөрөө бүрдүүлнэ.
 */
const ZURAG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v", ".3gp"]);
const FAIL_NER = /^[a-f0-9]{32}\.[a-z0-9]{2,5}$/;
const CHAT_TULKHUUR = /^[A-Za-z0-9_]{1,64}$/;

function chatFailRoot() {
  return process.env.BARILGIIN_CHAT_UPLOAD_ROOT
    ? path.resolve(process.env.BARILGIIN_CHAT_UPLOAD_ROOT)
    : path.join(process.cwd(), "public", "barilgiinChat");
}
exports.chatFailRoot = chatFailRoot;

/** Тухайн чатын файлын хавтас (id-уудыг шалгасны дараа л) */
function chatFailKhavtas(baiguullagiinId, chatTulkhuur) {
  if (!mongoose.Types.ObjectId.isValid(String(baiguullagiinId)) || !CHAT_TULKHUUR.test(String(chatTulkhuur))) {
    throw aldaa(400, "Буруу зам");
  }
  return path.join(chatFailRoot(), String(baiguullagiinId), String(chatTulkhuur));
}
exports.chatFailKhavtas = chatFailKhavtas;

function failTurul(ner) {
  const ext = path.extname(String(ner)).toLowerCase();
  if (ZURAG_EXT.has(ext)) return "zurag";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}
exports.failTurul = failTurul;
exports.FAIL_NER = FAIL_NER;

const failZam = (chat, ner) => `barilgiinChat/file/${chat.baiguullagiinId}/${chat.barilgiinId}/${ner}`;

/** Клиентийн өгсөн файлын нэрсээс хавсралтыг сервер дээр шалгаж бүрдүүлнэ */
function khavsraltBeldekh(chat, irsen) {
  if (!Array.isArray(irsen) || !irsen.length) return [];
  if (irsen.length > MAX_KHAVSRALT) throw aldaa(400, `Нэг мессежинд ${MAX_KHAVSRALT}-аас олон файл хавсаргах боломжгүй`);
  const khavtas = chatFailKhavtas(chat.baiguullagiinId, chat.barilgiinId);
  return irsen.map((x) => {
    const ner = String((x && typeof x === "object" ? x.ner : x) || "");
    const turul = failTurul(ner);
    if (!FAIL_NER.test(ner) || !turul) throw aldaa(400, "Хавсралтын нэр буруу");
    let khemjee = 0;
    try {
      khemjee = fs.statSync(path.join(khavtas, ner)).size;
    } catch (_) {
      throw aldaa(400, "Хавсралт олдсонгүй. Дахин upload хийнэ үү.");
    }
    return { ner, turul, zam: failZam(chat, ner), khemjee };
  });
}

const urdchilsanText = (text, khavsralt) => {
  if (text) return text.slice(0, 200);
  if ((khavsralt || []).some((k) => k.turul === "video")) return "🎥 Видео";
  if ((khavsralt || []).length) return "📷 Зураг";
  return "";
};

let io = null;
exports.setIo = (socketIo) => {
  io = socketIo;
};

const roomNer = (barilgiinId) => `chat:${barilgiinId}`;
exports.roomNer = roomNer;

function aldaa(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

const BUH = "buh_";
const buhTulkhuur = (baiguullagiinId) => `${BUH}${baiguullagiinId}`;

/** Байгууллага бүрт нэг «Бүх байр» чатын мөр */
function buhChatuud(chatuud, nerAvya) {
  const ur = [];
  const kharsan = new Set();
  for (const c of chatuud) {
    if (kharsan.has(c.baiguullagiinId)) continue;
    kharsan.add(c.baiguullagiinId);
    ur.push({
      turul: "buh",
      baiguullagiinId: c.baiguullagiinId,
      baiguullagiinNer: c.baiguullagiinNer,
      barilgiinId: buhTulkhuur(c.baiguullagiinId),
      barilgiinNer: "Бүх байр",
      ilgeegchNer: nerAvya(c),
    });
  }
  return ur;
}

const kholboltOlyo = (baiguullagiinId) =>
  db.kholboltuud.find((k) => String(k.baiguullagiinId) === String(baiguullagiinId));

/* ── Гишүүнчлэл ─────────────────────────────────────────────────────── */

const kesh = new Map(); // tokenId → { ognoo, ur dun }

async function baiguullaguudAvya(idnuud) {
  const valid = [...new Set(idnuud.map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!valid.length) return new Map();
  const rows = await Baiguullaga(db.erunkhiiKholbolt)
    .find({ _id: { $in: valid } })
    .select("ner barilguud._id barilguud.ner")
    .lean();
  return new Map(rows.map((b) => [String(b._id), b]));
}

/**
 * Токеноос хэрэглэгч, түүний гишүүн байх чатуудыг тодорхойлно.
 * Буцаах: { turul, id, ner, tailbar, chatuud: [{ baiguullagiinId, baiguullagiinNer,
 *           barilgiinId, barilgiinNer, toot? }] }
 */
async function khereglegchTodorkhoiloh(token) {
  if (!token || !token.id || token.id === "zochin") throw aldaa(403, "Эрх байхгүй");
  const tulkhuur = `${token.id}|${token.baiguullagiinId || ""}|${token.erkh ? 1 : 0}`;
  const kh = kesh.get(tulkhuur);
  if (kh && Date.now() - kh.ognoo < KHADGALAKH_MS) return kh.ur;

  let ur = null;
  if (!token.erkh) ur = await orshinSuugchTodorkhoiloh(token);
  if (!ur) ur = await ajiltanTodorkhoiloh(token);
  if (!ur) throw aldaa(403, "Хэрэглэгч олдсонгүй");

  kesh.set(tulkhuur, { ognoo: Date.now(), ur });
  if (kesh.size > 5000) kesh.delete(kesh.keys().next().value);
  return ur;
}
exports.khereglegchTodorkhoiloh = khereglegchTodorkhoiloh;

async function ajiltanTodorkhoiloh(token) {
  if (!mongoose.Types.ObjectId.isValid(String(token.id))) return null;
  const ajiltan = await Ajiltan(db.erunkhiiKholbolt)
    .findById(String(token.id))
    .select("ner ovog erkh barilguud baiguullagiinId albanTushaal")
    .lean();
  if (!ajiltan || !ajiltan.baiguullagiinId) return null;
  // Токены байгууллага ажилтны байгууллагатай таарах ёстой
  if (token.baiguullagiinId && String(token.baiguullagiinId) !== String(ajiltan.baiguullagiinId)) return null;

  const baiguullagiinId = String(ajiltan.baiguullagiinId);
  const baiguullaga = (await baiguullaguudAvya([baiguullagiinId])).get(baiguullagiinId);
  const buhBarilga = (baiguullaga?.barilguud || []).map((b) => ({ id: String(b._id), ner: b.ner || "" }));
  const admin = String(ajiltan.erkh || "").toLowerCase() === "admin";
  const onooson = new Set((ajiltan.barilguud || []).map(String));
  const barilguud = admin || onooson.size === 0 ? buhBarilga : buhBarilga.filter((b) => onooson.has(b.id));

  const ner = String(token.ner || ajiltan.ner || "Ажилтан");
  const barilgaChat = barilguud.map((b) => ({
    turul: "barilga",
    baiguullagiinId,
    baiguullagiinNer: baiguullaga?.ner || "",
    barilgiinId: b.id,
    barilgiinNer: b.ner,
    ilgeegchNer: ner,
  }));
  // «Бүх байр» — байгууллагын бүх ажилтан (оноосон барилгаас үл хамааран)
  const buh = baiguullaga
    ? buhChatuud([{ baiguullagiinId, baiguullagiinNer: baiguullaga.ner || "" }], () => ner)
    : [];

  return {
    turul: "ajiltan",
    id: String(ajiltan._id),
    ner,
    tailbar: ajiltan.albanTushaal || "Ажилтан",
    chatuud: [...buh, ...barilgaChat],
  };
}

async function orshinSuugchTodorkhoiloh(token) {
  if (!mongoose.Types.ObjectId.isValid(String(token.id))) return null;
  const OS = OrshinSuugch(db.erunkhiiKholbolt);
  const uuruu = await OS.findById(String(token.id)).select("ner ovog undsenId baiguullagiinId barilgiinId toot toots").lean();
  if (!uuruu) return null;
  // Гэр бүлийн гишүүн бол хаягаа үндсэн эзэмшигчээс авна
  let ezen = uuruu;
  if (uuruu.undsenId && mongoose.Types.ObjectId.isValid(String(uuruu.undsenId))) {
    ezen = (await OS.findById(String(uuruu.undsenId)).select("baiguullagiinId barilgiinId toot toots").lean()) || uuruu;
  }

  const khosuud = new Map(); // "baiguullagiinId|barilgiinId" → toot[]
  const nemye = (baId, bId, toot) => {
    if (!baId || !bId) return;
    const k = `${baId}|${bId}`;
    if (!khosuud.has(k)) khosuud.set(k, []);
    if (toot && !khosuud.get(k).includes(String(toot))) khosuud.get(k).push(String(toot));
  };
  const garaazhEsvelAguulakh = (t) => {
    const turul = String(t?.turul || "").trim().toLowerCase();
    if (turul.includes("гараж") || turul.includes("зогсоол") || turul.includes("агуулах")) {
      return true;
    }
    const dav = String(t?.davkhar || "").trim();
    if ((!turul || turul === "орон сууц" || turul === "тоот") && /^[bв]\d+$/i.test(dav)) {
      return true;
    }
    return false;
  };
  nemye(ezen.baiguullagiinId, ezen.barilgiinId, ezen.toot);
  for (const t of Array.isArray(ezen.toots) ? ezen.toots : []) {
    if (t?.source && t.source !== "OWN_ORG") continue;
    nemye(t?.baiguullagiinId, t?.barilgiinId, garaazhEsvelAguulakh(t) ? "" : t?.toot);
  }

  const baiguullaguud = await baiguullaguudAvya([...khosuud.keys()].map((k) => k.split("|")[0]));
  const chatuud = [];
  for (const [k, tootuud] of khosuud) {
    const [baId, bId] = k.split("|");
    const baiguullaga = baiguullaguud.get(String(baId));
    const barilga = (baiguullaga?.barilguud || []).find((b) => String(b._id) === String(bId));
    if (!barilga || !kholboltOlyo(baId)) continue;
    const toot = tootuud.join(", ");
    chatuud.push({
      turul: "barilga",
      baiguullagiinId: String(baId),
      baiguullagiinNer: baiguullaga.ner || "",
      barilgiinId: String(bId),
      barilgiinNer: barilga.ner || "",
      toot,
      ilgeegchNer: toot ? `${toot} тоот` : "",
    });
  }

  const ner = String(uuruu.ner || token.ner || "Оршин суугч");
  // Нэр нь тоот; тоотгүй (ховор) бол нэрээр
  for (const c of chatuud) if (!c.ilgeegchNer) c.ilgeegchNer = ner;
  const buh = buhChatuud(chatuud, (c) =>
    c.toot ? `${c.barilgiinNer ? `${c.barilgiinNer} ` : ""}${c.toot} тоот` : ner,
  );

  return {
    turul: "orshinSuugch",
    id: String(uuruu._id),
    ner,
    tailbar: "",
    chatuud: [...buh, ...chatuud],
  };
}

/** Хэрэглэгч тухайн барилгын чатын гишүүн бол чатын мэдээлэл, үгүй бол алдаа. */
async function gishuunShalgakh(token, barilgiinId) {
  const kh = await khereglegchTodorkhoiloh(token);
  const chat = kh.chatuud.find((c) => c.barilgiinId === String(barilgiinId || ""));
  if (!chat) throw aldaa(403, "Энэ барилгын чатад хандах эрх байхгүй");
  return { kh, chat };
}
exports.gishuunShalgakh = gishuunShalgakh;

/* ── Чат ба мессеж ──────────────────────────────────────────────────── */

async function chatBatalgaajuulakh(chat) {
  const kholbolt = kholboltOlyo(chat.baiguullagiinId);
  if (!kholbolt) throw aldaa(404, "Байгууллагын холболт олдсонгүй");
  const doc = await BarilgiinChat(kholbolt)
    .findOneAndUpdate(
      { baiguullagiinId: chat.baiguullagiinId, barilgiinId: chat.barilgiinId },
      { $setOnInsert: { baiguullagiinId: chat.baiguullagiinId, barilgiinId: chat.barilgiinId }, $set: { ner: chat.barilgiinNer } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    .lean();
  return { kholbolt, doc };
}

/** Миний чатууд (lazy үүсгэнэ). */
exports.miniiChatuud = async (token) => {
  const kh = await khereglegchTodorkhoiloh(token);
  const jagsaalt = await Promise.all(
    kh.chatuud.map(async (c) => {
      try {
        const { doc } = await chatBatalgaajuulakh(c);
        return {
          _id: String(doc._id),
          baiguullagiinId: c.baiguullagiinId,
          baiguullagiinNer: c.baiguullagiinNer,
          barilgiinId: c.barilgiinId,
          turul: c.turul,
          ner: c.barilgiinNer,
          toot: c.toot || "",
          miniiNer: c.ilgeegchNer,
          suuliinMessej: doc.suuliinMessej || null,
        };
      } catch (e) {
        console.error("[barilgiinChat] чат үүсгэхэд:", e.message);
        return null;
      }
    }),
  );
  return {
    khereglegch: { id: kh.id, turul: kh.turul, ner: kh.ner },
    chatuud: jagsaalt
      .filter(Boolean)
      .sort((a, b) => new Date(b.suuliinMessej?.ognoo || 0) - new Date(a.suuliinMessej?.ognoo || 0)),
  };
};

/** Мессежийн түүх — шинээс хуучин руу cursor-оор (umnukh = мессежийн _id). */
exports.messejuud = async (token, barilgiinId, { umnukh, khemjee } = {}) => {
  const { chat } = await gishuunShalgakh(token, barilgiinId);
  const kholbolt = kholboltOlyo(chat.baiguullagiinId);
  if (!kholbolt) throw aldaa(404, "Байгууллагын холболт олдсонгүй");
  const limit = Math.min(Math.max(parseInt(khemjee, 10) || KHUUDAS_DEFAULT, 1), KHUUDAS_MAX);
  const query = { baiguullagiinId: chat.baiguullagiinId, barilgiinId: chat.barilgiinId };
  if (umnukh) {
    if (!mongoose.Types.ObjectId.isValid(String(umnukh))) throw aldaa(400, "umnukh буруу");
    query._id = { $lt: new mongoose.Types.ObjectId(String(umnukh)) };
  }
  const rows = await BarilgiinChatMessej(kholbolt)
    .find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .select("-__v")
    .lean();
  const dakhiadBii = rows.length > limit;
  return { messejuud: rows.slice(0, limit).reverse(), dakhiadBii };
};

/**
 * Чатын дэлгэрэнгүй: илгээгдсэн зураг, видеонууд (шинээс хуучин руу).
 * umnukh = мессежийн _id cursor.
 */
exports.media = async (token, barilgiinId, { umnukh, khemjee } = {}) => {
  const { chat } = await gishuunShalgakh(token, barilgiinId);
  const kholbolt = kholboltOlyo(chat.baiguullagiinId);
  if (!kholbolt) throw aldaa(404, "Байгууллагын холболт олдсонгүй");
  const limit = Math.min(Math.max(parseInt(khemjee, 10) || KHUUDAS_DEFAULT, 1), KHUUDAS_MAX);
  const query = {
    baiguullagiinId: chat.baiguullagiinId,
    barilgiinId: chat.barilgiinId,
    "khavsralt.0": { $exists: true },
  };
  if (umnukh) {
    if (!mongoose.Types.ObjectId.isValid(String(umnukh))) throw aldaa(400, "umnukh буруу");
    query._id = { $lt: new mongoose.Types.ObjectId(String(umnukh)) };
  }
  const rows = await BarilgiinChatMessej(kholbolt)
    .find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .select("khavsralt ilgeegchNer ilgeegchId createdAt")
    .lean();
  const dakhiadBii = rows.length > limit;
  const khuudas = rows.slice(0, limit);
  const media = [];
  for (const m of khuudas) {
    for (const k of m.khavsralt || []) {
      media.push({
        messejId: String(m._id),
        ilgeegchNer: m.ilgeegchNer || "",
        createdAt: m.createdAt,
        turul: k.turul,
        zam: k.zam,
        ner: k.ner,
      });
    }
  }
  return {
    media,
    dakhiadBii,
    umnukh: khuudas.length ? String(khuudas[khuudas.length - 1]._id) : null,
  };
};

const khereglee = new Map();
function khyazgaarShalgaya(id) {
  const odoo = Date.now();
  const jagsaalt = (khereglee.get(id) || []).filter((t) => odoo - t < KHYAZGAAR_MS);
  if (jagsaalt.length >= KHYAZGAAR) throw aldaa(429, "Хэт олон мессеж илгээлээ. Түр хүлээнэ үү.");
  jagsaalt.push(odoo);
  khereglee.set(id, jagsaalt);
  if (khereglee.size > 5000) khereglee.delete(khereglee.keys().next().value);
}

/** Мессеж илгээх: хадгалаад `chat:<barilgiinId>` room руу цацна. */
exports.messejIlgeekh = async (token, barilgiinId, { text, clientId, khariuId, khavsralt: irsenKhavsralt } = {}) => {
  const tsever = String(text || "").replace(/\r\n/g, "\n").trim();
  if (tsever.length > MAX_URT) throw aldaa(400, `Мессеж ${MAX_URT} тэмдэгтээс хэтэрсэн байна`);

  const { kh, chat } = await gishuunShalgakh(token, barilgiinId);
  const khavsralt = khavsraltBeldekh(chat, irsenKhavsralt);
  if (!tsever && !khavsralt.length) throw aldaa(400, "Мессеж хоосон байна");
  khyazgaarShalgaya(kh.id);
  const { kholbolt, doc: chatDoc } = await chatBatalgaajuulakh(chat);

  const Messej = BarilgiinChatMessej(kholbolt);
  const cId = clientId ? String(clientId).slice(0, 64) : undefined;
  if (cId) {
    // Сүлжээ тасарч дахин илгээсэн бол давхар хадгалахгүй
    const umnukh = await Messej.findOne({ barilgiinId: chat.barilgiinId, ilgeegchId: kh.id, clientId: cId }).lean();
    if (umnukh) return umnukh;
  }

  let khariu;
  if (khariuId) {
    if (!mongoose.Types.ObjectId.isValid(String(khariuId))) throw aldaa(400, "khariuId буруу");
    // Зөвхөн ИЖИЛ чатын мессежид хариулна (өөр чатын агуулга алдагдахгүй)
    const ekh = await Messej.findOne({
      _id: String(khariuId),
      baiguullagiinId: chat.baiguullagiinId,
      barilgiinId: chat.barilgiinId,
    }).lean();
    if (!ekh) throw aldaa(404, "Хариулах мессеж олдсонгүй");
    khariu = {
      messejId: String(ekh._id),
      ilgeegchNer: ekh.ilgeegchNer || "",
      text: urdchilsanText(String(ekh.text || ""), ekh.khavsralt),
    };
  }

  const messej = (
    await Messej.create({
      baiguullagiinId: chat.baiguullagiinId,
      barilgiinId: chat.barilgiinId,
      chatId: String(chatDoc._id),
      ilgeegchId: kh.id,
      ilgeegchTurul: kh.turul,
      ilgeegchNer: chat.ilgeegchNer || kh.ner,
      ilgeegchTailbar: kh.turul === "orshinSuugch" ? "" : kh.tailbar,
      text: tsever,
      clientId: cId,
      ...(khavsralt.length ? { khavsralt } : {}),
      ...(khariu ? { khariu } : {}),
    })
  ).toObject();
  delete messej.__v;

  await BarilgiinChat(kholbolt).updateOne(
    { _id: chatDoc._id },
    {
      $set: {
        suuliinMessej: {
          text: urdchilsanText(tsever, khavsralt),
          ilgeegchNer: messej.ilgeegchNer,
          ilgeegchTurul: kh.turul,
          ognoo: messej.createdAt,
        },
      },
    },
  );

  if (io) {
    try {
      io.to(roomNer(chat.barilgiinId)).emit(EVENT, messej);
    } catch (e) {
      console.error("[barilgiinChat] emit:", e.message);
    }
  }
  return messej;
};

/** Мессеж засах — зөвхөн илгээгч өөрөө. Засвар "barilgiinChat:zasvar" event-ээр цацагдана. */
exports.messejZasakh = async (token, barilgiinId, messejId, { text } = {}) => {
  const tsever = String(text || "").replace(/\r\n/g, "\n").trim();
  if (tsever.length > MAX_URT) throw aldaa(400, `Мессеж ${MAX_URT} тэмдэгтээс хэтэрсэн байна`);
  if (!mongoose.Types.ObjectId.isValid(String(messejId))) throw aldaa(400, "Мессежийн id буруу");

  const { kh, chat } = await gishuunShalgakh(token, barilgiinId);
  khyazgaarShalgaya(kh.id);
  const kholbolt = kholboltOlyo(chat.baiguullagiinId);
  if (!kholbolt) throw aldaa(404, "Байгууллагын холболт олдсонгүй");

  const Messej = BarilgiinChatMessej(kholbolt);
  const olson = await Messej.findOne({
    _id: String(messejId),
    baiguullagiinId: chat.baiguullagiinId,
    barilgiinId: chat.barilgiinId,
  }).lean();
  if (!olson) throw aldaa(404, "Мессеж олдсонгүй");
  if (String(olson.ilgeegchId) !== kh.id) throw aldaa(403, "Зөвхөн өөрийн мессежээ засах боломжтой");
  if (!tsever && !(olson.khavsralt || []).length) throw aldaa(400, "Мессеж хоосон байна");
  if (olson.text === tsever) return olson;

  const messej = await Messej.findOneAndUpdate(
    { _id: olson._id },
    { $set: { text: tsever, zassanEsekh: true, zassanOgnoo: new Date() } },
    { new: true },
  )
    .select("-__v")
    .lean();

  // Хамгийн сүүлийн мессеж засагдсан бол жагсаалтын урьдчилсан харагдацыг шинэчилнэ
  await BarilgiinChat(kholbolt).updateOne(
    {
      baiguullagiinId: chat.baiguullagiinId,
      barilgiinId: chat.barilgiinId,
      "suuliinMessej.ognoo": olson.createdAt,
    },
    { $set: { "suuliinMessej.text": urdchilsanText(tsever, olson.khavsralt) } },
  );

  if (io) {
    try {
      io.to(roomNer(chat.barilgiinId)).emit("barilgiinChat:zasvar", messej);
    } catch (e) {
      console.error("[barilgiinChat] emit:", e.message);
    }
  }
  return messej;
};

/* ── Socket ─────────────────────────────────────────────────────────── */

/**
 * Socket бүрт:
 *   "barilgiinChat:join"  { token, barilgiinId }, ack({ success, message? })
 *   "barilgiinChat:leave" { barilgiinId }
 * Токеныг APP_SECRET-ээр шалгаж, гишүүнчлэлийг тооцоод л room-д оруулна.
 */
exports.socketHolbokh = (socket) => {
  socket.on("barilgiinChat:join", async (data, ack) => {
    const khariu = typeof ack === "function" ? ack : () => {};
    try {
      const barilgiinId = String(data?.barilgiinId || "");
      if (!barilgiinId) throw aldaa(400, "barilgiinId шаардлагатай");
      let token;
      try {
        token = jwt.verify(String(data?.token || ""), process.env.APP_SECRET);
      } catch (_) {
        throw aldaa(401, "Токен хүчингүй");
      }
      await gishuunShalgakh(token, barilgiinId);
      socket.join(roomNer(barilgiinId));
      khariu({ success: true, room: roomNer(barilgiinId) });
    } catch (e) {
      khariu({ success: false, message: e.message });
    }
  });
  socket.on("barilgiinChat:leave", (data) => {
    const barilgiinId = String(data?.barilgiinId || "");
    if (barilgiinId) socket.leave(roomNer(barilgiinId));
  });
};
