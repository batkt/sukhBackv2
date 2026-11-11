/**
 * Индексийн аудит — ЗӨВХӨН УНШИНА. DB-д юу ч бичихгүй, индекс үүсгэхгүй/устгахгүй.
 *
 * Байгууллага бүрийн DB-ийн цуглуулга бүрээр:
 *   • байгаа индексүүд (listIndexes)
 *   • индекс бүр хэдэн удаа ашиглагдсан ($indexStats — mongod сүүлд асаснаас хойш)
 *   • мөрийн тоо, өгөгдөл ба индексийн хэмжээ ($collStats)
 * Дараа нь дүгнэнэ:
 *   • АШИГЛАГДААГҮЙ индекс (ops = 0; _id, unique, TTL-ийг тооцохгүй)
 *   • ИЛҮҮДЭЛ индекс (түлхүүр нь өөр индексийн эхлэл — тэр нь хангалттай)
 *   • ДУТУУ байж болох индекс (кодын query-нээс гаргасан саналууд, EXPECTED)
 *
 * zevbackv2-ийн `db.kholboltUusgey`-г ашиглахгүй: тэр нь Mongoose model
 * үүсгэж autoIndex ажиллуулдаг тул «зөвхөн унших» биш болно. Оронд нь
 * mongodb driver-ээр шууд холбогдож, `baaziinmedeels`-ээс DB-үүдийн жагсаалтыг уншина.
 *
 * Ажиллуулах (сервер дээр, ачаалал багатай цагт):
 *   node scripts/indexAudit.js
 *   node scripts/indexAudit.js --db=amarSukh_123      # нэрэнд агуулсан DB-үүд л
 *   node scripts/indexAudit.js --collections=geree,uilchluulegch
 *   node scripts/indexAudit.js --out=./index-audit.json
 *
 * MONGODB_URI-г tokhirgoo/tokhirgoo.env (эсвэл орчны хувьсагч)-аас авна.
 * Нууц үг, холболтын хаягийг хэвлэхгүй.
 *
 * Анхаар: $indexStats-ийн тоо mongod restart хийснээс хойш л тоологдоно —
 * «since» огноо саяхных бол «ашиглагдаагүй» дүгнэлтэд бүү итгэ.
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "tokhirgoo", "tokhirgoo.env") });
const { MongoClient } = require("mongodb");

// ── Тохиргоо ────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  }),
);
const DB_SHUULT = typeof args.db === "string" ? args.db.toLowerCase() : null;
const TSUGLUULGA_SHUULT =
  typeof args.collections === "string"
    ? args.collections.split(",").map((s) => normalize(s.trim()))
    : null;
const GARALT =
  typeof args.out === "string"
    ? args.out
    : `index-audit-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;

/**
 * Кодын query-нээс гаргасан, байх ёстой мэт индексүүд (санал).
 * Түлхүүр нь цуглуулгын нэрийн «үндэс» (жижиг үсэг, төгсгөлийн s/es-гүй).
 * Талбаруудын дарааллаар эхэлдэг индекс байвал хангалттай гэж үзнэ.
 */
const EXPECTED = {
  uilchluulegch: [
    { fields: ["mashiniiDugaar", "tuukh.zogsooliinId"], shaltgaan: "Камерын үйл явдал бүрт машины дугаараар хайдаг" },
    { fields: ["baiguullagiinId", "createdAt"], shaltgaan: "Тайлан/жагсаалт огноогоор" },
  ],
  ezenurisanmashin: [
    { fields: ["urisanMashiniiDugaar", "tuluv"], shaltgaan: "Урьсан машиныг дугаар+төлвөөр хайдаг" },
  ],
  mashin: [{ fields: ["orshinSuugchiinId"], shaltgaan: "6 газар orshinSuugchiinId-аар хайдаг" }],
  geree: [{ fields: ["gereeniiDugaar"], shaltgaan: "baiguullagiinId-гүйгээр gereeniiDugaar-аар хайдаг" }],
  nekhemjlekhiintuukh: [{ fields: ["gereeniiId"], shaltgaan: "Гэрээний нэхэмжлэх" }],
  guilgeeavlaguud: [{ fields: ["gereeniiId"], shaltgaan: "Гэрээний гүйлгээ" }],
};

// Энэ хэмжээнээс бага цуглуулгад индексийн санал/анхааруулга хамаагүй
const JIJIG_TSUGLUULGA = 1000;

/**
 * Mongoose цуглуулгын нэрийг олон тоонд оруулдаг («geree» → «gerees»,
 * «uilchluulegch» → «uilchluulegches»). Боломжит үндсүүдийг буцаана.
 */
function undesuud(ner) {
  const n = String(ner || "").toLowerCase();
  return [n, n.replace(/s$/, ""), n.replace(/es$/, "")];
}
const normalize = (ner) => String(ner || "").toLowerCase();

function khemjee(bytes) {
  if (!bytes && bytes !== 0) return "-";
  const n = Number(bytes);
  if (n < 1024) return `${n}B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  return `${(n / 1024 ** 3).toFixed(2)}GB`;
}

const tulkhuurBichvver = (key) =>
  "{ " + Object.entries(key).map(([k, v]) => `${k}: ${v}`).join(", ") + " }";

/** A индексийн түлхүүр B-ийн эхлэл мөн эсэх (дараалал, чиглэл ижил) */
function ekhlelMun(a, b) {
  const ak = Object.entries(a);
  const bk = Object.entries(b);
  if (ak.length >= bk.length) return false;
  return ak.every(([k, v], i) => bk[i][0] === k && String(bk[i][1]) === String(v));
}

/** Онцгой шинжтэй индекс — илүүдэл/ашиглагдаагүй гэж санал болгохгүй */
function tusgaiIndeks(ix) {
  return (
    ix.name === "_id_" ||
    ix.unique ||
    ix.sparse ||
    ix.partialFilterExpression ||
    ix.expireAfterSeconds !== undefined ||
    ix.collation ||
    Object.values(ix.key).some((v) => typeof v === "string") // text/2dsphere/hashed
  );
}

// ── Нэг DB-ийг шалгах ───────────────────────────────────────────────────
async function dbShalgakh(db, label) {
  const ur = { db: label, tsugluulguud: [] };
  const tsugluulguud = (await db.listCollections({}, { nameOnly: false }).toArray()).filter(
    (c) => c.type !== "view" && !c.name.startsWith("system."),
  );

  for (const c of tsugluulguud) {
    const ner = c.name;
    const undes = undesuud(ner);
    if (TSUGLUULGA_SHUULT && !TSUGLUULGA_SHUULT.some((t) => undes.includes(t))) continue;
    const expKey = Object.keys(EXPECTED).find((k) => undes.includes(k));
    const coll = db.collection(ner);
    const mur = { ner, too: 0, ugugdul: null, indeksiinKhemjee: null, indeksuud: [], ashiglagdaagui: [], iluudel: [], dutuu: [] };

    try {
      mur.too = await coll.estimatedDocumentCount();
    } catch (e) {
      mur.aldaa = `count: ${e.message}`;
    }

    try {
      const [st] = await coll.aggregate([{ $collStats: { storageStats: {} } }]).toArray();
      mur.ugugdul = st?.storageStats?.size ?? null;
      mur.indeksiinKhemjee = st?.storageStats?.totalIndexSize ?? null;
      mur.indeksKhemjeeNereer = st?.storageStats?.indexSizes || {};
    } catch {
      /* эрх хүрэхгүй бол алгасна */
    }

    let indeksuud = [];
    try {
      indeksuud = await coll.listIndexes().toArray();
    } catch (e) {
      mur.aldaa = `listIndexes: ${e.message}`;
    }

    const stats = {};
    try {
      const rows = await coll.aggregate([{ $indexStats: {} }]).toArray();
      rows.forEach((r) => {
        stats[r.name] = { ops: Number(r.accesses?.ops ?? 0), since: r.accesses?.since };
      });
    } catch {
      /* $indexStats эрхгүй бол ашиглалтгүйгээр үргэлжилнэ */
    }

    mur.indeksuud = indeksuud.map((ix) => ({
      ner: ix.name,
      tulkhuur: ix.key,
      unique: !!ix.unique,
      sparse: !!ix.sparse,
      ttl: ix.expireAfterSeconds,
      partial: !!ix.partialFilterExpression,
      ops: stats[ix.name]?.ops ?? null,
      since: stats[ix.name]?.since ?? null,
      khemjee: mur.indeksKhemjeeNereer?.[ix.name] ?? null,
    }));
    delete mur.indeksKhemjeeNereer;

    if (mur.too >= JIJIG_TSUGLUULGA) {
      // Ашиглагдаагүй
      indeksuud.forEach((ix) => {
        const s = stats[ix.name];
        if (!tusgaiIndeks(ix) && s && s.ops === 0) {
          mur.ashiglagdaagui.push({ ner: ix.name, tulkhuur: ix.key, since: s.since });
        }
      });
      // Илүүдэл (өөр индексийн эхлэл)
      indeksuud.forEach((a) => {
        if (tusgaiIndeks(a)) return;
        const tom = indeksuud.find((b) => b !== a && !b.partialFilterExpression && ekhlelMun(a.key, b.key));
        if (tom) mur.iluudel.push({ ner: a.name, tulkhuur: a.key, khangalttai: tom.name });
      });
    }

    // Дутуу байж болох (санал)
    (expKey ? EXPECTED[expKey] : []).forEach((exp) => {
      const baigaa = indeksuud.some((ix) => {
        const keys = Object.keys(ix.key);
        return exp.fields.every((f, i) => keys[i] === f);
      });
      if (!baigaa) mur.dutuu.push(exp);
    });

    ur.tsugluulguud.push(mur);
  }
  return ur;
}

// ── Үндсэн ──────────────────────────────────────────────────────────────
async function main() {
  const URI = process.env.MONGODB_URI;
  if (!URI) {
    console.error("MONGODB_URI олдсонгүй (tokhirgoo/tokhirgoo.env эсвэл орчны хувьсагч).");
    process.exit(1);
  }

  const opts = { readPreference: "secondaryPreferred", serverSelectionTimeoutMS: 15000 };
  const client = new MongoClient(URI, opts);
  await client.connect();
  const undsen = client.db(); // URI дахь DB (undsenBaaz)
  const neeltuud = [client];

  // Байгууллагуудын DB-ийн жагсаалт
  const medeelelColl = (await undsen.listCollections({}, { nameOnly: true }).toArray()).find((c) =>
    /^baaziinmedeel/i.test(c.name),
  );
  const baazuud = medeelelColl ? await undsen.collection(medeelelColl.name).find({}).toArray() : [];

  const zorilt = [{ label: `${undsen.databaseName} (undsen)`, db: undsen }];
  for (const b of baazuud) {
    if (!b.baaz) continue;
    if (DB_SHUULT && !String(b.baaz).toLowerCase().includes(DB_SHUULT)) continue;
    let db;
    if (b.cloudMongoDBEsekh) {
      // Тусдаа cloud кластер — тухайн бичлэгийн хэрэглэгчээр (хэвлэхгүй)
      const url =
        (b.appName ? "mongodb+srv://" : "mongodb://") +
        encodeURIComponent(b.userName) +
        ":" +
        encodeURIComponent(b.password) +
        "@" +
        b.clusterUrl +
        "/" +
        b.baaz +
        (b.appName ? `?retryWrites=true&w=majority&appName=${b.appName}` : "?authSource=admin");
      try {
        const c = new MongoClient(url, opts);
        await c.connect();
        neeltuud.push(c);
        db = c.db(b.baaz);
      } catch (e) {
        console.warn(`⚠️  ${b.baaz}: cloud холболт амжилтгүй (${e.message})`);
        continue;
      }
    } else {
      // Үндсэн сервер дээрх DB — ижил (admin) холболтоор
      db = client.db(b.baaz);
    }
    zorilt.push({ label: b.baaz, db });
  }
  if (DB_SHUULT) zorilt.splice(0, 1); // шүүлттэй үед үндсэн DB-г алгасна

  console.log(`🔎 ${zorilt.length} DB шалгана (зөвхөн уншина)…\n`);
  const ur = [];
  for (const z of zorilt) {
    try {
      ur.push(await dbShalgakh(z.db, z.label));
      process.stdout.write(".");
    } catch (e) {
      console.warn(`\n⚠️  ${z.label}: ${e.message}`);
    }
  }
  console.log("\n");

  // ── Нэгтгэл: цуглуулгын нэрээр ─────────────────────────────────────
  const negtgel = {};
  ur.forEach((d) =>
    d.tsugluulguud.forEach((c) => {
      const k = normalize(c.ner); // жижиг үсгээр — ижил нэртэй цуглуулгууд нэгтгэгдэнэ
      const n = (negtgel[k] ||= { ner: c.ner, db: 0, too: 0, ugugdul: 0, indeks: 0, dutuu: {}, ashiglagdaagui: {}, iluudel: {} });
      n.db++;
      n.too += c.too || 0;
      n.ugugdul += c.ugugdul || 0;
      n.indeks += c.indeksiinKhemjee || 0;
      c.dutuu.forEach((x) => (n.dutuu[x.fields.join("+")] = (n.dutuu[x.fields.join("+")] || 0) + 1));
      c.ashiglagdaagui.forEach((x) => (n.ashiglagdaagui[x.ner] = (n.ashiglagdaagui[x.ner] || 0) + 1));
      c.iluudel.forEach((x) => (n.iluudel[`${x.ner} → ${x.khangalttai}`] = (n.iluudel[`${x.ner} → ${x.khangalttai}`] || 0) + 1));
    }),
  );

  const erembe = Object.values(negtgel).sort((a, b) => b.too - a.too);
  console.log("ТОМ ЦУГЛУУЛГУУД (бүх DB нийлбэр):");
  console.log("  мөр".padEnd(14) + "өгөгдөл".padEnd(10) + "индекс".padEnd(10) + "DB".padEnd(5) + "цуглуулга");
  erembe.slice(0, 25).forEach((n) =>
    console.log(
      "  " +
        String(n.too).padEnd(12) +
        khemjee(n.ugugdul).padEnd(10) +
        khemjee(n.indeks).padEnd(10) +
        String(n.db).padEnd(5) +
        n.ner,
    ),
  );

  const khevlekh = (garchig, talbar, tailbar) => {
    const muruud = erembe.filter((n) => Object.keys(n[talbar]).length > 0);
    console.log(`\n${garchig}`);
    if (!muruud.length) return console.log("  — алга");
    muruud.forEach((n) =>
      Object.entries(n[talbar]).forEach(([k, too]) => console.log(`  ${n.ner}: ${k}  (${too}/${n.db} DB)${tailbar ? "  " + tailbar : ""}`)),
    );
  };
  khevlekh("🔴 ДУТУУ БАЙЖ БОЛОХ ИНДЕКС (кодын query-нээс гаргасан санал):", "dutuu");
  khevlekh("🟠 ИЛҮҮДЭЛ ИНДЕКС (өөр индексийн эхлэл — устгахад аюулгүй байж болно):", "iluudel");
  khevlekh("🟡 АШИГЛАГДААГҮЙ ИНДЕКС (mongod restart-аас хойш ops = 0):", "ashiglagdaagui");

  const since = ur
    .flatMap((d) => d.tsugluulguud.flatMap((c) => c.indeksuud.map((i) => i.since)))
    .filter(Boolean)
    .sort()[0];
  if (since) console.log(`\nℹ️  $indexStats тоолж эхэлсэн: ${new Date(since).toISOString()} (үүнээс хойших ашиглалт)`);

  fs.writeFileSync(GARALT, JSON.stringify({ ognoo: new Date(), dbuud: ur, negtgel: erembe }, null, 2));
  console.log(`\n💾 Дэлгэрэнгүй: ${path.resolve(GARALT)}`);
  console.log("Юу ч өөрчлөөгүй. Санал бүрийг шалгаж, schema-д нэмэх/устгахаар шийднэ үү.");

  await Promise.all(neeltuud.map((c) => c.close().catch(() => {})));
}

main().catch((e) => {
  console.error("❌ Аудит амжилтгүй:", e.message);
  process.exit(1);
});
