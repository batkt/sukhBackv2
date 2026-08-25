/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Түрээсийн зогсоолын интеграцийн ТҮЛХҮҮРҮҮД (байгууллага тус бүрээр)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Байгууллага бүр өөрийн түлхүүртэй. Эдгээр нь tureesBack дээрх
 *  tokhirgoo/zochinKalituud.js дахь бичлэгтэй ЯГ ТААРАХ ёстой:
 *
 *    АмарСүх (энэ файл)            Түрээс (zochinKalituud.js)
 *    ─────────────────────         ──────────────────────────
 *    kalit                    ==   kalit
 *    webhookSecret            ==   webhookSecret
 *    tureesServer             ->   (түрээсийн API хаяг)
 *                                  server -> АмарСүхийн API хаяг
 *
 *  ┌─────────────────────────────────────────────────────────────────────┐
 *  │ АНХААРУУЛГА - энэ файл git дээр хадгалагдана                        │
 *  │                                                                     │
 *  │ Энд бичсэн түлхүүр репозиторийн ТҮҮХЭНД үлдэнэ. Солихдоо ХОЁР талыг │
 *  │ зэрэг шинэчилнэ, эс тэгвэл нэвтрэлт (401) эсвэл webhook (401) унана:│
 *  │   1. tureesBack/tokhirgoo/zochinKalituud.js                         │
 *  │   2. sukhBackv2/tokhirgoo/tureesKalituud.js  (энэ файл)             │
 *  │   3. commit + push + pm2 reload (хоёуланг)                          │
 *  │                                                                     │
 *  │ Deploy хийхгүйгээр солих бол env override:                          │
 *  │   TUREES_KALIT_<baiguullagiinId>=<шинэ түлхүүр>                     │
 *  │   TUREES_WEBHOOK_SECRET_<baiguullagiinId>=<шинэ нууц>               │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  Түлхүүр үүсгэх:
 *    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

const KALITUUD = {
  "69f3f56a2899d5fdc24251d1": {
    ner: "Testiin org",
    // Эхлээд ТЕСТ. Прод руу шилжихдээ: "https://turees.zevtabs.mn/api"
    tureesServer: "https://rently.zevtabs.mn/api",
    kalit: "220c6efb95dce10a822723f09ed46eb81bf07902cdc5b681219c14fdda519069",
    webhookSecret:
      "7ec45a6fd82d05fa0ce8f4322623d1509e71cf3ebc3e87dd2a363a88d5af1ed9",
    idevkhiteiEsekh: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // ЖИШЭЭ БИЧЛЭГ - нэмэхдээ доорхийг хуулж, ЗААВАЛ бүх талбарыг сольно.
  // Түлхүүрийг сольтол интеграц автоматаар унтарсан хэвээр байна.
  // ─────────────────────────────────────────────────────────────────────────
  // "68e4e2bff3ff09acb5705a93": {
  //   ner: "АмарСүх ХХК",
  //   tureesServer: "https://turees.zevtabs.mn/api",   // prod
  //   // тест: "https://rently.zevtabs.mn/api"
  //   kalit: "<ЭНД 64 ТЭМДЭГТ ТҮЛХҮҮР ТАВИНА>",
  //   webhookSecret: "<ЭНД 64 ТЭМДЭГТ НУУЦ ТАВИНА>",
  //   idevkhiteiEsekh: true,
  // },
};

const PLACEHOLDER = /^<.*>$/;
const MIN_URT = 32;

function kalitZuvEsekh(kalit) {
  if (typeof kalit !== "string") return false;
  const k = kalit.trim();
  if (!k) return false;
  if (PLACEHOLDER.test(k)) return false;
  if (k.length < MIN_URT) return false;
  return true;
}

/**
 * Тухайн байгууллагын түрээсийн интеграцийн тохиргоог авах.
 * Бүрэн бус (placeholder/богино/хаагдсан) бол null - интеграц унтарсан гэж
 * үзэж, зочин урих функц хэвийн ажиллана.
 */
function tokhirgooAvya(baiguullagiinId) {
  const id = String(baiguullagiinId || "");
  const suuri = KALITUUD[id];
  if (!suuri) return null;
  if (suuri.idevkhiteiEsekh === false) return null;

  const kalit = process.env[`TUREES_KALIT_${id}`] || suuri.kalit;
  const webhookSecret =
    process.env[`TUREES_WEBHOOK_SECRET_${id}`] || suuri.webhookSecret;
  const tureesServer =
    process.env[`TUREES_SERVER_${id}`] || suuri.tureesServer;

  if (!tureesServer || !kalitZuvEsekh(kalit)) return null;

  return {
    baiguullagiinId: id,
    ner: suuri.ner,
    tureesServer,
    kalit,
    webhookSecret,
  };
}

/** Ямар нэг байгууллагад интеграц тохируулагдсан эсэх */
function yamarNegenTokhirgootoiEsekh() {
  return Object.keys(KALITUUD).some((id) => !!tokhirgooAvya(id));
}

module.exports = {
  KALITUUD,
  tokhirgooAvya,
  yamarNegenTokhirgootoiEsekh,
  kalitZuvEsekh,
  MIN_URT,
};
