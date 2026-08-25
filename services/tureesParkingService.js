const axios = require("axios");
const { tokhirgooAvya } = require("../tokhirgoo/tureesKalituud");

/**
 * Түрээсийн зогсоолын систем (tureesBack) руу залгах клиент.
 *
 * АмарСүх дээр зочин уригдахад тухайн машиныг түрээсийн зогсоолын системд
 * бүртгүүлнэ. Түрээс тал үүнийг parking-v2-ийн ezenUrisanMashin болгон
 * хадгалж, машин хаалган дээр ирэхэд өөрөө танин "Зочин" төрлөөр session
 * үүсгэж үнэгүй минутыг хасна.
 *
 * Түлхүүр нь БАЙГУУЛЛАГА ТУС БҮРЭЭР tokhirgoo/tureesKalituud.js дээр байна.
 * Тиймээс бүх функц baiguullagiinId шаарддаг - тухайн байгууллагын түлхүүрээр
 * л залгана.
 */
const TIMEOUT = 10000;

/** Тухайн байгууллагад интеграц тохируулагдсан эсэх */
function idevkhiteiEsekh(baiguullagiinId) {
  return !!tokhirgooAvya(baiguullagiinId);
}

async function khuseltIlgeeye(baiguullagiinId, method, path, data) {
  const tokhirgoo = tokhirgooAvya(baiguullagiinId);
  if (!tokhirgoo) {
    return {
      success: false,
      message:
        "Түрээсийн зогсоолын интеграц энэ байгууллагад тохируулаагүй байна",
      tokhirgoogui: true,
    };
  }

  try {
    const response = await axios({
      method,
      url: `${tokhirgoo.tureesServer}${path}`,
      data,
      timeout: TIMEOUT,
      headers: {
        Authorization: `Bearer ${tokhirgoo.kalit}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (err) {
    const status = err.response && err.response.status;
    const message =
      (err.response && err.response.data && err.response.data.message) ||
      err.message;
    console.error(
      `❌ [TUREES] ${method} ${path} алдаа:`,
      status || "",
      message,
    );
    // status-ийг гаргаж өгнө - дуудагч тал 409 (машин зогсоол дээр) гэх мэт
    // тохиолдлыг сүлжээний алдаанаас салгаж боловсруулах шаардлагатай.
    return { success: false, status, message };
  }
}

/**
 * Зочны урилгыг түрээсийн зогсоолд бүртгэх.
 * amarSukhUrilgiinId нь АмарСүх дээрх ezenUrisanMashin._id - idempotency
 * түлхүүр тул ижил урилгыг дахин илгээхэд давхардахгүй.
 */
async function urilgaIlgeeye({
  amarSukhUrilgiinId,
  amarSukhBaiguullagiinId,
  amarSukhBarilgiinId,
  amarSukhOrshinSuugchId,
  amarSukhGereeniiId,
  amarSukhToot,
  urisanMashiniiDugaar,
  tusBurUneguiMinut,
  davtamjiinTurul,
  ezemshigchiinNer,
  ezemshigchiinUtas,
  ezemshigchiinRegister,
  tulburiinTurul,
  duusakhOgnoo,
}) {
  return khuseltIlgeeye(amarSukhBaiguullagiinId, "post", "/v1/zochin/urilga", {
    amarSukhUrilgiinId: String(amarSukhUrilgiinId),
    amarSukhBaiguullagiinId: String(amarSukhBaiguullagiinId),
    amarSukhBarilgiinId: amarSukhBarilgiinId
      ? String(amarSukhBarilgiinId)
      : undefined,
    amarSukhOrshinSuugchId: amarSukhOrshinSuugchId
      ? String(amarSukhOrshinSuugchId)
      : undefined,
    amarSukhGereeniiId: amarSukhGereeniiId
      ? String(amarSukhGereeniiId)
      : undefined,
    amarSukhToot,
    urisanMashiniiDugaar,
    tusBurUneguiMinut,
    davtamjiinTurul,
    ezemshigchiinNer,
    ezemshigchiinUtas,
    ezemshigchiinRegister,
    tulburiinTurul: tulburiinTurul || "zochin",
    duusakhOgnoo,
  });
}

/** Урилгыг түрээсийн зогсоол дээр цуцлах */
async function urilgaTsutslaya({
  amarSukhBaiguullagiinId,
  amarSukhUrilgiinId,
}) {
  return khuseltIlgeeye(
    amarSukhBaiguullagiinId,
    "post",
    "/v1/zochin/urilga/tsutslakh",
    {
      amarSukhBaiguullagiinId: String(amarSukhBaiguullagiinId),
      amarSukhUrilgiinId: String(amarSukhUrilgiinId),
    },
  );
}

/** Урилгын одоогийн байдал + зогсоолын session-ууд */
async function urilgaAvya({ amarSukhBaiguullagiinId, amarSukhUrilgiinId }) {
  return khuseltIlgeeye(
    amarSukhBaiguullagiinId,
    "get",
    `/v1/zochin/urilga/${amarSukhBaiguullagiinId}/${amarSukhUrilgiinId}`,
  );
}

/** Тухайн байгууллагад холбогдсон түрээсийн барилгуудын жагсаалт */
async function barilgaMapAvya(amarSukhBaiguullagiinId) {
  return khuseltIlgeeye(
    amarSukhBaiguullagiinId,
    "get",
    `/v1/zochin/barilga/${amarSukhBaiguullagiinId}`,
  );
}

/**
 * Түрээсийн байгууллага -> барилга -> зогсоолын бүтэц.
 * Админ вэб дээр "аль түрээсийн барилгатай холбох"-ыг сонгуулахад хэрэглэнэ.
 */
async function tureesBaiguullagaJagsaalt(amarSukhBaiguullagiinId) {
  return khuseltIlgeeye(
    amarSukhBaiguullagiinId,
    "get",
    "/v1/zochin/tureesBaiguullaga",
  );
}

module.exports = {
  idevkhiteiEsekh,
  urilgaIlgeeye,
  urilgaTsutslaya,
  urilgaAvya,
  barilgaMapAvya,
  tureesBaiguullagaJagsaalt,
};
