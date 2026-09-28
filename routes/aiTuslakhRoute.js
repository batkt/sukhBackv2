/**
 * AI туслах — системийн хэрэглээ, ерөнхий асуулт, байгууллагын өгөгдлийн
 * (эрхийн хүрээнд, зөвхөн унших) асуултад хариулна.
 *   POST /aiTuslakh   body: { messages: [{role:"user"|"assistant", content}], khuudas?, khuudasniiNer?, barilgiinId? }
 * Хариуг text/plain хэлбэрээр stream хийж буцаана (фронт хэсэг хэсгээр нь зурна).
 * Орчны хувьсагч (аль нэг нь заавал):
 *   GEMINI_API_KEY     — Google Gemini (үнэгүй түвшинтэй). Байвал үүнийг ашиглана.
 *   ANTHROPIC_API_KEY  — Claude (төлбөртэй).
 *   AI_TUSLAKH_MODEL   — загварыг өөрчлөх (сонголтоор).
 */
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { tokenShalgakh } = require("zevbackv2");
const { SISTEMIIN_MEDLEG } = require("../utils/aiTuslakhMedleg");
const {
  TODORKHOILOLT,
  khamrakhKhureeBeldekh,
  kheregselAjilluulakh,
  khureeniiTailbar,
} = require("../utils/aiTuslakhKheregsel");

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_MESSEJ = 12; // сүүлийн хэдэн мессежийг л илгээнэ
const MAX_URT = 2000; // нэг мессежийн дээд урт
const KHYAZGAAR = 30; // хэрэглэгч бүрд...
const KHYAZGAAR_MS = 10 * 60 * 1000; // ...10 минутад
const MAX_EELJ = 5; // нэг асуултад хэрэгсэл дуудах дээд давталт
const MAX_UR_DUN = 12000; // хэрэгслийн хариуны дээд урт (тэмдэгт)

// Санах ойд хадгалах энгийн хязгаарлалт (токен бүрээр).
const khereglee = new Map();
function khyazgaarShalgaya(tulkhuur) {
  const odoo = Date.now();
  const jagsaalt = (khereglee.get(tulkhuur) || []).filter((t) => odoo - t < KHYAZGAAR_MS);
  if (jagsaalt.length >= KHYAZGAAR) {
    khereglee.set(tulkhuur, jagsaalt);
    return false;
  }
  jagsaalt.push(odoo);
  khereglee.set(tulkhuur, jagsaalt);
  if (khereglee.size > 5000) khereglee.clear();
  return true;
}

function messejuudTseverlekh(messages) {
  if (!Array.isArray(messages)) return [];
  const tseverkhen = messages
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-MAX_MESSEJ)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_URT) }));
  // Anthropic API эхний мессеж user байхыг шаардана.
  while (tseverkhen.length && tseverkhen[0].role !== "user") tseverkhen.shift();
  return tseverkhen;
}

router.post("/aiTuslakh", tokenShalgakh, async (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) {
    return res.status(503).json({ message: "AI туслах тохируулагдаагүй байна." });
  }

  const messages = messejuudTseverlekh(req.body?.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ message: "Асуултаа бичнэ үү." });
  }

  const tulkhuur = crypto
    .createHash("sha256")
    .update(String(req.headers.authorization || req.ip))
    .digest("hex");
  if (!khyazgaarShalgaya(tulkhuur)) {
    return res
      .status(429)
      .json({ message: "Хэт олон асуулт илгээлээ. Хэдэн минутын дараа дахин оролдоно уу." });
  }

  const khuudas = String(req.body?.khuudasniiNer || req.body?.khuudas || "")
    .slice(0, 120)
    .trim();

  // Өгөгдлийн хэрэгслийн хамрах хүрээ. Олдохгүй бол хэрэгсэлгүй ажиллана.
  const kh = await khamrakhKhureeBeldekh(req).catch((err) => {
    console.error("AI туслах хүрээ тодорхойлоход алдаа:", err.message);
    return null;
  });
  const systemText = [
    SISTEMIIN_MEDLEG,
    khuudas
      ? `Хэрэглэгч одоо «${khuudas}» хуудсан дээр байна. Асуулт тодорхойгүй бол энэ хуудастай холбож хариул.`
      : "",
    kh
      ? khureeniiTailbar(kh)
      : "Өгөгдлийн хэрэгсэл энэ удаа ашиглах боломжгүй — бодит тоо асуувал аль хуудаснаас харахыг заа.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const tasalsan = new AbortController();
  // Хэрэглэгч цонхоо хаавал AI руу хийсэн хүсэлтийг ч зогсооно.
  res.on("close", () => tasalsan.abort());

  // Толгойг анхны текст бичих үед л илгээнэ — түүнээс өмнө алдаа гарвал JSON алдаа буцаана.
  let ekhelsen = false;
  const bichikh = (text) => {
    if (!text) return;
    if (!ekhelsen) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no"); // nginx buffering-ийг унтраана
      ekhelsen = true;
    }
    res.write(text);
  };

  const provider = geminiKey
    ? geminiProvider(geminiKey, systemText, messages, kh ? TODORKHOILOLT : null)
    : anthropicProvider(anthropicKey, systemText, messages, kh ? TODORKHOILOLT : null);

  try {
    for (let eelj = 0; eelj < MAX_EELJ; eelj++) {
      const { duudlaguud } = await provider.duudakh(tasalsan.signal, bichikh);
      if (!duudlaguud.length || !kh) break;
      const khariunuud = [];
      for (const d of duudlaguud) {
        const ur = await kheregselAjilluulakh(kh, d.name, d.args);
        let json = JSON.stringify(ur);
        if (json.length > MAX_UR_DUN) json = JSON.stringify({ aldaa: "Хариу хэт урт байна — асуултыг нарийсгана уу." });
        khariunuud.push({ ...d, json });
      }
      provider.urDunNemekh(khariunuud);
      if (eelj === MAX_EELJ - 1) bichikh("\n\n(Асуулт хэт нарийн байна — илүү тодорхой асууна уу.)");
    }
  } catch (err) {
    if (tasalsan.signal.aborted) return;
    console.error("AI туслах алдаа:", err.status || "", String(err.message || "").slice(0, 300));
    if (!ekhelsen) {
      return res.status(502).json({ message: aldaaniiMedegdel(err), aldaa: boditAldaa(err) });
    }
    bichikh("\n\n(Хариу тасалдлаа. Дахин оролдоно уу.)");
  }
  if (!ekhelsen) bichikh("Уучлаарай, хариу гаргаж чадсангүй. Асуултаа өөрөөр асууна уу.");
  res.end();
});

/** Google/Anthropic-ийн алдааны JSON-оос error объектыг гаргана. */
function aldaaObjekt(err) {
  try {
    const j = JSON.parse(String(err?.message || ""));
    return (Array.isArray(j) ? j[0]?.error : j?.error) || null;
  } catch {
    return null;
  }
}

/**
 * Хэрэглэгчид ойлгомжтой мэдэгдэл. Хязгаар (квот) дууссан бол "ачаалалтай"
 * биш — яг хязгаар дууссаныг, хэзээ сэргэхийг хэлнэ.
 */
function aldaaniiMedegdel(err) {
  const e = aldaaObjekt(err);
  const msg = String(e?.message || "").toLowerCase();
  const tuluv = String(e?.status || "");
  const details = Array.isArray(e?.details) ? e.details : [];
  const khyazgaarDuussan =
    err?.status === 429 ||
    tuluv === "RESOURCE_EXHAUSTED" ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("credit balance");
  if (khyazgaarDuussan) {
    const zurchil = details.flatMap((d) => d?.violations || []);
    const udruur = zurchil.some((v) => /perday/i.test(`${v?.quotaId || ""}${v?.quotaMetric || ""}`)) || msg.includes("per day");
    const retry = details.find((d) => String(d?.["@type"] || "").includes("RetryInfo"))?.retryDelay;
    if (msg.includes("credit balance")) return "AI туслахын төлбөрийн үлдэгдэл (credit) дууссан байна. Админ дансаа цэнэглэнэ үү.";
    if (udruur) return "AI туслахын өнөөдрийн үнэгүй хязгаар (квот) дууссан байна. Маргааш сэргэнэ, эсвэл Google-д төлбөрийн тохиргоо хийнэ үү.";
    return `AI туслахын минутын хязгаар (квот) хэтэрлээ.${retry ? ` ${String(retry).replace("s", "")} секундын дараа` : " Түр хүлээгээд"} дахин оролдоно уу.`;
  }
  if (err?.status === 401 || err?.status === 403 || tuluv === "PERMISSION_DENIED" || tuluv === "UNAUTHENTICATED")
    return "AI туслахын API түлхүүр (token) буруу эсвэл хүчингүй болсон байна. Админ түлхүүрээ шалгана уу.";
  if (err?.status === 400 && msg.includes("api key"))
    return "AI туслахын API түлхүүр (token) буруу байна. Админ түлхүүрээ шалгана уу.";
  if (err?.status === 404) return "AI загвар олдсонгүй (хуучирсан). Админ AI_TUSLAKH_MODEL тохиргоог шалгана уу.";
  if (err?.status === 503 || err?.status === 529 || err?.status === 500)
    return "AI туслахын сервер (Google) түр ачаалалтай байна. Хэдэн минутын дараа дахин оролдоно уу.";
  return err?.status ? "AI туслах хариу өгч чадсангүй." : "AI туслахтай холбогдож чадсангүй.";
}

/**
 * Үйлчилгээ үзүүлэгчийн (Google/Anthropic) жинхэнэ алдааг товчоор гаргана —
 * жишээ "503 UNAVAILABLE: The model is overloaded...". Түлхүүр агуулахгүй.
 */
function boditAldaa(err) {
  const raw = String(err?.message || "");
  let tailbar = raw;
  try {
    const j = JSON.parse(raw);
    const e = Array.isArray(j) ? j[0]?.error : j?.error || j;
    tailbar = [e?.status || e?.type, e?.message].filter(Boolean).join(": ") || raw;
  } catch {
    /* JSON биш — байгаагаар нь */
  }
  tailbar = tailbar.replace(/key=[^&\s"]+/gi, "key=***").slice(0, 300);
  return [err?.status, tailbar || err?.name || "Тодорхойгүй алдаа"].filter(Boolean).join(" ");
}

/** SSE хариуг мөр мөрөөр нь JSON болгон дамжуулна. */
async function* sseUnshikh(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const murnuud = buffer.split("\n");
    buffer = murnuud.pop();
    for (const mur of murnuud) {
      if (!mur.startsWith("data:")) continue;
      try {
        yield JSON.parse(mur.slice(5).trim());
      } catch {
        /* бүтэн бус мөр */
      }
    }
  }
}

async function upstreamDuudakh(url, headers, body, signal) {
  const resp = await fetch(url, { method: "POST", signal, headers, body: JSON.stringify(body) });
  if (!resp.ok || !resp.body) {
    const text = await resp.text().catch(() => "");
    const err = new Error(text);
    err.status = resp.status;
    throw err;
  }
  return resp;
}

/** Google Gemini — function calling + stream. */
function geminiProvider(key, systemText, messages, tools) {
  // "-latest" alias нь Google-ийн одоогийн Flash загвар руу заадаг тул
  // хуучин загвар хаагдахад код өөрчлөх шаардлагагүй.
  const model = process.env.AI_TUSLAKH_MODEL || "gemini-flash-latest";
  // Google ачаалалтай (503) эсвэл хязгаар хэтэрсэн (429) үед дахин оролдоод,
  // дараа нь илүү хөнгөн загвар руу шилжинэ.
  const nuutsZagvar = process.env.AI_TUSLAKH_FALLBACK_MODEL || "gemini-flash-lite-latest";
  const nuuts = nuutsZagvar && nuutsZagvar !== model ? nuutsZagvar : null;
  // Gemini-д туслахын үүрэг "model" гэж нэрлэгдэнэ.
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  let suuliinParts = [];
  return {
    async duudakh(signal, bichikh) {
      const khuselt = (zagvar) => upstreamDuudakh(
        `${GEMINI_URL}/${encodeURIComponent(zagvar)}:streamGenerateContent?alt=sse`,
        { "content-type": "application/json", "x-goog-api-key": key },
        {
          systemInstruction: { parts: [{ text: systemText }] },
          contents,
          ...(tools
            ? { tools: [{ functionDeclarations: tools }], toolConfig: { functionCallingConfig: { mode: "AUTO" } } }
            : {}),
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.3,
            // 2.5 Flash-ийн "бодох" шатыг унтрааж хариуг хурдан болгоно.
            // Gemini 3+ нь thinkingBudget-ийг хүлээж авахгүй байж болох тул зөвхөн 2.5-д.
            ...(/2\.5-flash/i.test(zagvar) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        },
        signal,
      );
      // 503/500 (ачаалал) — ижил загварыг нэг удаа дахин; 429 (квот) — дахин
      // оролдох нь квотыг л шатаана, шууд хөнгөн загвар руу (тусдаа квоттой).
      let resp;
      let suuliinAldaa = null;
      const oroldlogo = [model];
      for (let i = 0; i < oroldlogo.length; i++) {
        try {
          resp = await khuselt(oroldlogo[i]);
          break;
        } catch (err) {
          suuliinAldaa = err;
          if (signal.aborted) throw err;
          const achaalal = err.status === 503 || err.status === 500;
          const kvot = err.status === 429;
          if (achaalal && i === 0) oroldlogo.push(model);
          if ((achaalal || kvot) && nuuts && !oroldlogo.includes(nuuts)) oroldlogo.push(nuuts);
          if (i === oroldlogo.length - 1) throw err;
          console.warn(`AI туслах: ${oroldlogo[i]} ${err.status} — дараагийн оролдлого`);
          if (achaalal) await new Promise((r) => setTimeout(r, 800));
        }
      }
      if (!resp) throw suuliinAldaa || new Error("AI хариу алга");
      // Загварын бүх хэсгийг (thoughtSignature-тай нь) хадгалж дараагийн
      // ээлжид яг хэвээр нь буцааж илгээнэ — Gemini 3 үүнийг шаарддаг.
      const parts = [];
      const duudlaguud = [];
      for await (const event of sseUnshikh(resp.body)) {
        if (event.error) throw Object.assign(new Error(JSON.stringify(event.error)), { status: 502 });
        for (const p of event?.candidates?.[0]?.content?.parts || []) {
          parts.push(p);
          if (p.functionCall) duudlaguud.push({ id: p.functionCall.id, name: p.functionCall.name, args: p.functionCall.args || {} });
          else if (p.text && !p.thought) bichikh(p.text);
        }
      }
      suuliinParts = parts;
      return { duudlaguud };
    },
    urDunNemekh(khariunuud) {
      contents.push({ role: "model", parts: suuliinParts });
      contents.push({
        role: "user",
        parts: khariunuud.map((k) => ({
          functionResponse: {
            ...(k.id ? { id: k.id } : {}),
            name: k.name,
            response: { result: JSON.parse(k.json) },
          },
        })),
      });
    },
  };
}

/** Anthropic Claude — tool use + stream. */
function anthropicProvider(key, systemText, messages, tools) {
  const model = process.env.AI_TUSLAKH_MODEL || "claude-sonnet-5";
  const msgs = messages.map((m) => ({ role: m.role, content: m.content }));
  let suuliinBlokuud = [];
  return {
    async duudakh(signal, bichikh) {
      const resp = await upstreamDuudakh(
        ANTHROPIC_URL,
        { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        {
          model,
          max_tokens: 2048,
          stream: true,
          system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
          ...(tools
            ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
            : {}),
          messages: msgs,
        },
        signal,
      );
      const blokuud = [];
      for await (const event of sseUnshikh(resp.body)) {
        if (event.type === "error") throw Object.assign(new Error(JSON.stringify(event.error)), { status: 502 });
        if (event.type === "content_block_start") {
          const b = event.content_block || {};
          blokuud[event.index] =
            b.type === "tool_use" ? { type: "tool_use", id: b.id, name: b.name, _json: "" } : { type: "text", text: "" };
        } else if (event.type === "content_block_delta") {
          const b = blokuud[event.index];
          if (!b) continue;
          if (event.delta?.type === "text_delta") {
            b.text += event.delta.text;
            bichikh(event.delta.text);
          } else if (event.delta?.type === "input_json_delta") {
            b._json += event.delta.partial_json || "";
          }
        }
      }
      suuliinBlokuud = blokuud.filter(Boolean).map((b) => {
        if (b.type !== "tool_use") return b;
        let input = {};
        try {
          input = b._json ? JSON.parse(b._json) : {};
        } catch {
          /* хоосон оролт */
        }
        return { type: "tool_use", id: b.id, name: b.name, input };
      }).filter((b) => b.type !== "text" || b.text);
      const duudlaguud = suuliinBlokuud
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, args: b.input }));
      return { duudlaguud };
    },
    urDunNemekh(khariunuud) {
      msgs.push({ role: "assistant", content: suuliinBlokuud });
      msgs.push({
        role: "user",
        content: khariunuud.map((k) => ({ type: "tool_result", tool_use_id: k.id, content: k.json })),
      });
    },
  };
}

module.exports = router;
