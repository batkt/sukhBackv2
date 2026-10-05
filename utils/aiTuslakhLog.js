/**
 * AI туслахын харилцааг systemiinUdirdlaga руу log болгон илгээнэ.
 *   AI_LOG_KEY — server хоорондын түлхүүр (tokhirgoo/local.env-д, git-д БҮҮ оруул).
 *                Тохируулаагүй бол log-ийг чимээгүй алгасна.
 *   AI_LOG_URL — systemiinUdirdlaga-ийн хаяг (анхдагч http://103.236.194.68:8282).
 * Log нь чатыг хэзээ ч эвдэх/удаашруулах ёсгүй: fire-and-forget, 5 секундын хугацаа.
 */
const KHUGATSAA_MS = 5000;

function tokhirgoo() {
  const key = process.env.AI_LOG_KEY;
  if (!key) return null;
  const url = String(process.env.AI_LOG_URL || "http://103.236.194.68:8282").replace(/\/+$/, "");
  return { key, url };
}

async function ilgeekh(t, zam, body) {
  const resp = await fetch(`${t.url}${zam}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ai-log-key": t.key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(KHUGATSAA_MS),
  });
  if (!resp.ok) {
    const err = new Error(`${resp.status} ${(await resp.text().catch(() => "")).slice(0, 200)}`);
    err.status = resp.status;
    throw err;
  }
  return resp;
}

/** Log илгээнэ (хүлээхгүй, алдааг зөвхөн console.warn). */
function logIlgeekh(doc) {
  const t = tokhirgoo();
  if (!t) return;
  ilgeekh(t, "/aiTuslakhLog", doc).catch((err) => {
    console.warn("AI туслах log илгээж чадсангүй:", String(err?.message || err).slice(0, 200));
  });
}

/**
 * Үнэлгээг дамжуулна. AI_LOG_KEY тохируулаагүй бол { tokhirgoogui: true } буцаана,
 * дамжуулахад алдаа гарвал throw хийнэ.
 */
async function unelgeeIlgeekh({ logId, khereglegchiinId, unelgee, tailbar }) {
  const t = tokhirgoo();
  if (!t) return { tokhirgoogui: true };
  await ilgeekh(t, "/aiTuslakhLog/unelgee", { logId, khereglegchiinId, unelgee, tailbar });
  return { ok: true };
}

module.exports = { logIlgeekh, unelgeeIlgeekh };
