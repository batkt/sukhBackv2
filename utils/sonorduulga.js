/**
 * Push мэдэгдлийг оршин суугч / харилцагчид руу тарааж илгээх нэгдсэн логик.
 *
 * Өмнө нь энэ фан-аут зөвхөн санал асуулгын route дотор inline байсан тул
 * нийтлэл, аппын шинэчлэлт нэмэхэд ижил кодыг дахин хуулах шаардлага
 * гарч байв. Иймд нэг эх сурвалж болгов.
 *
 * ХЭЗЭЭ Ч throw ХИЙХГҮЙ: мэдэгдэл илгээх нь үндсэн үйлдлийн (нийтлэл
 * үүсгэх, хувилбар шинэчлэх) хажуугийн ажил. Firebase унасан ч нийтлэл
 * үүссэн хэвээр байх ёстой.
 */

const {
  orshinSuugchidSonorduulgaIlgeeye,
} = require("../controller/appNotification");

/** Нэг дор хэдэн token руу зэрэг илгээх вэ (Firebase-ийг дүүргэхгүйн тулд). */
const ZERGTSEE = 20;

/**
 * Token-уудыг хэсэгчлэн, зэрэгцээ илгээнэ.
 *
 * Дараалан `await` хийвэл 1000 оршин суугчтай байранд хүсэлт нь минут
 * шаталдаг. Хэсэгчилсэн зэрэгцээ илгээлт нь ажиллагааг олон дахин хурдасгана.
 *
 * @returns {Promise<{ilgeesen: number, aldaatai: number}>}
 */
async function tokenuudRuuIlgeeye(tokenuud, medeelel) {
  let ilgeesen = 0;
  let aldaatai = 0;

  for (let i = 0; i < tokenuud.length; i += ZERGTSEE) {
    const khesag = tokenuud.slice(i, i + ZERGTSEE);

    const uruud = await Promise.allSettled(
      khesag.map(
        (token) =>
          new Promise((resolve) => {
            // `orshinSuugchidSonorduulgaIlgeeye` нь callback-аар хариу
            // мэдэгддэг; алдаа гарсан ч callback дуудагдана.
            orshinSuugchidSonorduulgaIlgeeye(
              token,
              medeelel,
              (khariu, aldaa) => resolve(!aldaa && !!khariu),
            ).catch(() => resolve(false));
          }),
      ),
    );

    for (const ur of uruud) {
      if (ur.status === "fulfilled" && ur.value) ilgeesen++;
      else aldaatai++;
    }
  }

  return { ilgeesen, aldaatai };
}

/**
 * Байгууллагын (эсвэл бүх байгууллагын) хэрэглэгчид руу мэдэгдэл тараана.
 *
 * @param {object} p
 * @param {object} p.erunkhiiKholbolt Төв баазын холболт (`db.erunkhiiKholbolt`)
 * @param {string} [p.baiguullagiinId] Хоосон бол БҮХ байгууллага (жишээ нь
 *        аппын шинэчлэлт — платформын хэмжээнд зарлагддаг)
 * @param {string[]} [p.barilguud] Зөвхөн эдгээр барилгын хэрэглэгчид
 * @param {string} p.title Мэдэгдлийн гарчиг
 * @param {string} p.body Мэдэгдлийн бие
 * @param {string} p.turul `data.type` — апп дээр ямар дэлгэц нээхийг шийднэ
 * @param {object} [p.dataNemelt] `data`-д нэмэх талбарууд
 * @param {boolean} [p.khariltsagchidCh] Харилцагчид ч илгээх эсэх
 * @param {object} [p.io] socket.io — зэрэг realtime эвент явуулна
 * @param {string} [p.socketEvent] socket эвентийн `type`
 * @param {object} [p.socketData] socket эвентийн `data`
 * @returns {Promise<{ilgeesen: number, aldaatai: number, tokenToo: number}>}
 */
async function sonorduulgaTaraaya({
  erunkhiiKholbolt,
  baiguullagiinId,
  barilguud,
  title,
  body,
  turul,
  dataNemelt,
  khariltsagchidCh = true,
  io,
  socketEvent,
  socketData,
}) {
  const khariu = { ilgeesen: 0, aldaatai: 0, tokenToo: 0 };

  try {
    const OrshinSuugch = require("../models/orshinSuugch");
    const Khariltsagch = require("../models/khariltsagch");

    const shuult = {
      firebaseToken: { $exists: true, $nin: [null, ""] },
    };
    if (baiguullagiinId) shuult.baiguullagiinId = String(baiguullagiinId);
    if (Array.isArray(barilguud) && barilguud.length > 0) {
      shuult.barilgiinId = { $in: barilguud.map(String) };
    }

    const modeluud = [OrshinSuugch];
    if (khariltsagchidCh) modeluud.push(Khariltsagch);

    /** Нэг хүн хоёр цуглуулгад байвал хоёр мэдэгдэл авахгүй байх. */
    const tokenuud = new Set();

    for (const Model of modeluud) {
      try {
        const bichleguud = await Model(erunkhiiKholbolt)
          .find(shuult)
          .select("firebaseToken")
          .lean();

        for (const b of bichleguud) {
          const token = String(b.firebaseToken || "").trim();
          if (token) tokenuud.add(token);
        }
      } catch (aldaa) {
        // Нэг цуглуулга унасан ч нөгөөгөөр үргэлжилнэ
        console.error(
          "⚠️ [SONORDUULGA] Token уншихад алдаа:",
          aldaa.message,
        );
      }
    }

    const jagsaalt = Array.from(tokenuud);
    khariu.tokenToo = jagsaalt.length;

    if (jagsaalt.length > 0) {
      const ur = await tokenuudRuuIlgeeye(jagsaalt, {
        title,
        body,
        type: turul,
        data: {
          type: turul,
          ...(dataNemelt || {}),
        },
      });
      khariu.ilgeesen = ur.ilgeesen;
      khariu.aldaatai = ur.aldaatai;
    }

    if (io && socketEvent) {
      try {
        if (baiguullagiinId) {
          io.emit("baiguullagiin" + baiguullagiinId, {
            type: socketEvent,
            data: socketData || {},
          });
        } else {
          io.emit(socketEvent, socketData || {});
        }
      } catch (socketAldaa) {
        console.error("⚠️ [SONORDUULGA] Socket алдаа:", socketAldaa.message);
      }
    }

    console.log(
      `✅ [SONORDUULGA] "${title}" — ${khariu.ilgeesen}/${khariu.tokenToo} илгээгдэв` +
        (khariu.aldaatai ? ` (${khariu.aldaatai} алдаатай)` : ""),
    );
  } catch (aldaa) {
    console.error("⚠️ [SONORDUULGA] Тараахад алдаа:", aldaa.message);
  }

  return khariu;
}

/**
 * Мэдэгдлийг ХҮЛЭЭЛГҮЙ (fire-and-forget) тараана.
 *
 * Нийтлэл үүсгэх зэрэг үйлдэл нь мянган push илгээх хугацаагаар
 * хэрэглэгчийг хүлээлгэх ёсгүй.
 */
function sonorduulgaKhuleelguiTaraaya(tokhirgoo) {
  sonorduulgaTaraaya(tokhirgoo).catch((aldaa) => {
    console.error("⚠️ [SONORDUULGA] Хүлээлгүй тараалт унав:", aldaa.message);
  });
}

module.exports = {
  sonorduulgaTaraaya,
  sonorduulgaKhuleelguiTaraaya,
};
