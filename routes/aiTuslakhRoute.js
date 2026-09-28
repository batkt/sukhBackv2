/**
 * AI туслах — системийн хэрэглээний асуултад хариулна.
 *   POST /aiTuslakh   body: { messages: [{role:"user"|"assistant", content}], khuudas?, khuudasniiNer? }
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

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_MESSEJ = 12; // сүүлийн хэдэн мессежийг л илгээнэ
const MAX_URT = 2000; // нэг мессежийн дээд урт
const KHYAZGAAR = 30; // хэрэглэгч бүрд...
const KHYAZGAAR_MS = 10 * 60 * 1000; // ...10 минутад

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

  const khuudasniiZaavar = khuudas
    ? `Хэрэглэгч одоо «${khuudas}» хуудсан дээр байна. Асуулт тодорхойгүй бол энэ хуудастай холбож хариул.`
    : "";

  const tasalsan = new AbortController();
  // Хэрэглэгч цонхоо хаавал AI руу хийсэн хүсэлтийг ч зогсооно.
  res.on("close", () => tasalsan.abort());

  // Үйлчилгээ бүрийн хүсэлт ба stream-ийн нэг мөрөөс текст салгах арга.
  let khuselt;
  let tekstSalgakh;
  if (geminiKey) {
    const model = process.env.AI_TUSLAKH_MODEL || "gemini-2.5-flash";
    khuselt = {
      url: `${GEMINI_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
      body: {
        systemInstruction: {
          parts: [{ text: [SISTEMIIN_MEDLEG, khuudasniiZaavar].filter(Boolean).join("\n\n") }],
        },
        // Gemini-д туслахын үүрэг "model" гэж нэрлэгдэнэ.
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.4,
          // Flash загварын "бодох" шатыг унтрааж хариуг хурдан болгоно.
          ...(/flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      },
    };
    tekstSalgakh = (event) =>
      (event?.candidates?.[0]?.content?.parts || [])
        .map((p) => (p.thought ? "" : p.text || ""))
        .join("");
  } else {
    const system = [
      { type: "text", text: SISTEMIIN_MEDLEG, cache_control: { type: "ephemeral" } },
    ];
    if (khuudasniiZaavar) system.push({ type: "text", text: khuudasniiZaavar });
    khuselt = {
      url: ANTHROPIC_URL,
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: {
        model: process.env.AI_TUSLAKH_MODEL || "claude-sonnet-5",
        max_tokens: 1024,
        stream: true,
        system,
        messages,
      },
    };
    tekstSalgakh = (event) =>
      event.type === "content_block_delta" && event.delta?.type === "text_delta"
        ? event.delta.text
        : "";
  }

  let upstream;
  try {
    upstream = await fetch(khuselt.url, {
      method: "POST",
      signal: tasalsan.signal,
      headers: khuselt.headers,
      body: JSON.stringify(khuselt.body),
    });
  } catch (err) {
    if (tasalsan.signal.aborted) return;
    console.error("AI туслах холбогдсонгүй:", err.message);
    return res.status(502).json({ message: "AI туслахтай холбогдож чадсангүй." });
  }

  if (!upstream.ok || !upstream.body) {
    const aldaa = await upstream.text().catch(() => "");
    console.error("AI туслах алдаа:", upstream.status, aldaa.slice(0, 300));
    const message =
      upstream.status === 429 || upstream.status === 529 || upstream.status === 503
        ? "AI туслах түр ачаалалтай байна. Түр хүлээгээд дахин оролдоно уу."
        : "AI туслах хариу өгч чадсангүй.";
    return res.status(502).json({ message });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // nginx buffering-ийг унтраана

  // SSE мөрүүдээс зөвхөн текстийн хэсгийг фронт руу дамжуулна.
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const murnuud = buffer.split("\n");
      buffer = murnuud.pop();
      for (const mur of murnuud) {
        if (!mur.startsWith("data:")) continue;
        let event;
        try {
          event = JSON.parse(mur.slice(5).trim());
        } catch {
          continue;
        }
        const tekst = tekstSalgakh(event);
        if (tekst) res.write(tekst);
        if (event.type === "error" || event.error) {
          res.write("\n\n(Хариу тасалдлаа. Дахин оролдоно уу.)");
        }
      }
    }
  } catch (err) {
    if (!tasalsan.signal.aborted) console.error("AI туслах stream алдаа:", err.message);
  }
  res.end();
});

module.exports = router;
