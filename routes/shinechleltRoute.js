/**
 * АЛСЫН ШИНЭЧЛЭЛТ — удирдлагын самбар (admin.zevtabs.mn) энд хандаж
 * СӨХ-ийн фронт/бэкийг шинэчилнэ.
 *
 * ЯАГААД ТУСДАА ТӨГСГӨЛӨГ ВЭ: удирдлагын сервер нь бусад системийг
 * `cd ../<хавтас> && yarn update` гэж ЛОКАЛ ажиллуулдаг
 * (udirdlagaBack/routes/systemRoute.js). Гэтэл СӨХ нь ӨӨР сервер дээр
 * (amarhome) байрладаг тул тэр арга хүрэхгүй. E-Pharma-тай адил HTTP-ээр
 * дуудаж, шинэчлэлтийг ЭНД гүйцэтгэнэ.
 *
 * АЮУЛГҮЙ БАЙДАЛ: энэ төгсгөлөг нь КОД татаж, үйлчилгээг ДАХИН АСААДАГ.
 * Иймд:
 *   • `SHINECHLELT_NUUTS` орчны хувьсагч ЗААВАЛ тохируулсан байх ёстой.
 *     Тохируулаагүй бол төгсгөлөг нь БҮРЭН хаалттай (503) — анхдагч нууц
 *     үг ОГТ байхгүй, учир нь тогтмол утга нь порт нээлттэй хэн бүхэнд
 *     прод серверийг дахин байрлуулах эрх өгнө.
 *   • Гүйцэтгэх ТУШААЛ нь мөн орчноос уншигдана. Код дотор `git pull`,
 *     `pm2 restart` гэж бичиж тогтоовол дев/прод хоёрын ялгаатай алхмыг
 *     таах болно.
 *
 * Тохиргоо (tokhirgoo/tokhirgoo.env):
 *   SHINECHLELT_NUUTS=<урт санамсаргүй мөр>
 *   SHINECHLELT_BACK_TUSHAAL=cd /root/sukhBackv2 && git pull && npm i && pm2 restart amarSukhBack
 *   SHINECHLELT_FRONT_TUSHAAL=cd /root/sukhWeb && git pull && npm i && npm run build && pm2 restart sukhWeb
 */
const express = require("express");
const router = express.Router();
const util = require("util");
const exec = util.promisify(require("child_process").exec);

// Шинэчлэлт нь татах + суулгах + дахин асаах тул удаан. Гэхдээ хязгааргүй
// биш — гацсан тушаал процессыг үүрд барьж байх ёсгүй.
const KHUGATSAA_MS = 10 * 60 * 1000;
const KHAMGIIN_IKH_GARALT = 20000;

/** Гаралтыг таслаж, нууц утгыг задруулахгүй байхаар бэлтгэнэ. */
function garaltBelge(utga) {
  const text = String(utga || "").trim();
  if (text.length <= KHAMGIIN_IKH_GARALT) return text;
  return text.slice(0, KHAMGIIN_IKH_GARALT) + "\n…(таслав)";
}

router.post("/shinechlelt", async (req, res) => {
  const nuuts = process.env.SHINECHLELT_NUUTS;

  // Тохируулаагүй бол ХААЛТТАЙ. Анхдагч нууц үг БАЙХГҮЙ.
  if (!nuuts) {
    console.warn(
      "⛔ [SHINECHLELT] SHINECHLELT_NUUTS тохируулаагүй тул төгсгөлөг хаалттай.",
    );
    return res.status(503).json({
      success: false,
      aldaa: "Шинэчлэлтийн төгсгөлөг идэвхжээгүй байна.",
    });
  }

  const irsen = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (irsen !== nuuts) {
    console.warn(
      `⛔ [SHINECHLELT] буруу нууцаар хандлаа: ip=${req.ip} ua="${req.headers["user-agent"] || "-"}"`,
    );
    return res.status(401).json({ success: false, aldaa: "Эрх хүрэхгүй." });
  }

  const zoriult = String(req.body?.zoriult || "back").toLowerCase();
  const tushaal =
    zoriult === "front"
      ? process.env.SHINECHLELT_FRONT_TUSHAAL
      : process.env.SHINECHLELT_BACK_TUSHAAL;

  if (!tushaal) {
    return res.status(503).json({
      success: false,
      aldaa: `"${zoriult}" зориултын тушаал (SHINECHLELT_${zoriult.toUpperCase()}_TUSHAAL) тохируулаагүй байна.`,
    });
  }

  console.log(`🚀 [SHINECHLELT] ${zoriult} эхэллээ: ${tushaal}`);

  try {
    const { stdout, stderr } = await exec(tushaal, {
      timeout: KHUGATSAA_MS,
      maxBuffer: 1024 * 1024 * 10,
      shell: "/bin/bash",
    });

    const garalt = garaltBelge(stdout);
    const aldaaGaralt = garaltBelge(stderr);

    // `git pull` нь "Already up to date." гэж ХЭВИЙН гардаг — амжилтгүй биш.
    console.log(`✅ [SHINECHLELT] ${zoriult} дууслаа.\n${garalt}`);
    if (aldaaGaralt) console.warn(`⚠️ [SHINECHLELT] stderr:\n${aldaaGaralt}`);

    return res.json({
      success: true,
      zoriult,
      stdout: garalt,
      stderr: aldaaGaralt,
    });
  } catch (aldaa) {
    // Унасан тушаалыг АМЖИЛТТАЙ гэж харуулахгүй — удирдлагын самбарт
    // яг юу болсныг харуулахын тулд гаралтыг нь буцаана.
    console.error(
      `❌ [SHINECHLELT] ${zoriult} амжилтгүй: ${aldaa.message}\n${garaltBelge(aldaa.stdout)}\n${garaltBelge(aldaa.stderr)}`,
    );
    return res.status(500).json({
      success: false,
      zoriult,
      aldaa: aldaa.killed
        ? `Шинэчлэлт ${KHUGATSAA_MS / 60000} минутад багтаж дуусаагүй тул зогсоов.`
        : aldaa.message,
      stdout: garaltBelge(aldaa.stdout),
      stderr: garaltBelge(aldaa.stderr),
    });
  }
});

module.exports = router;
