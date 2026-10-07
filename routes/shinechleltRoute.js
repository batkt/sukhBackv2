/**
 * АЛСЫН ШИНЭЧЛЭЛТ — удирдлагын самбар (admin.zevtabs.mn) энд хандаж
 * СӨХ-ийн фронт/бэкийг шинэчилнэ.
 *
 * ЯАГААД ТУСДАА ТӨГСГӨЛӨГ ВЭ: удирдлагын сервер нь бусад системийг
 * `cd ../<хавтас> && yarn update` гэж ЛОКАЛ ажиллуулдаг
 * (udirdlagaBack/routes/systemRoute.js). Гэтэл СӨХ нь ӨӨР сервер дээр
 * (amarhome) байрладаг тул тэр арга хүрэхгүй.
 *
 * ЯАГААД АСИНХРОН ВЭ: `npm i && npm run build` нь хэдэн минут үргэлжилнэ.
 * Хүсэлтийг нээлттэй барьж хүлээвэл nginx-ийн `proxy_read_timeout`
 * (анхдагчаар 60 секунд) таслаад 504 буцаадаг — ажил нь цаана үргэлжилж
 * байхад удирдлагын самбар бүтэлгүйтсэн гэж харуулна. Иймд:
 *   • POST нь ажлыг ЭХЛҮҮЛЭЭД шууд хариулна (202);
 *   • GET нь явцыг хэлнэ — самбар үүнийг асууж байгаад төлвөө харуулна.
 *
 * АЮУЛГҮЙ БАЙДАЛ: энэ төгсгөлөг нь КОД татаж, үйлчилгээг ДАХИН АСААДАГ.
 *   • `SHINECHLELT_NUUTS` тохируулаагүй бол БҮРЭН хаалттай (503).
 *     Анхдагч нууц үг ОГТ байхгүй — тогтмол утга нь порт нээлттэй хэн
 *     бүхэнд прод серверийг дахин байрлуулах эрх өгнө.
 *   • Гүйцэтгэх ТУШААЛ нь мөн орчноос уншигдана (дев/прод ялгаатай).
 *
 * Тохиргоо (tokhirgoo/tokhirgoo.env):
 *   SHINECHLELT_NUUTS=<урт санамсаргүй мөр>
 *   SHINECHLELT_BACK_TUSHAAL=cd /root/... && git pull && (setsid pm2 restart <app> >/dev/null 2>&1 &)
 *   SHINECHLELT_FRONT_TUSHAAL=cd /root/... && git pull && npm i && npm run build && pm2 restart <app>
 */
const express = require("express");
const router = express.Router();
const { exec } = require("child_process");

const KHUGATSAA_MS = 20 * 60 * 1000;
const KHAMGIIN_IKH_GARALT = 20000;

/**
 * Зориулт тус бүрийн СҮҮЛИЙН ажлын төлөв.
 *
 * Санах ойд хадгална — үйлчилгээ дахин асахад цэвэрлэгдэнэ. Энэ нь
 * ЗӨВХӨН явцыг харуулах зориулалттай тул бааз хэрэггүй. (Бэкийг шинэчлэх
 * нь өөрийгөө дахин асаадаг тул төлөв нь алга болно — доорх тайлбарыг үз.)
 */
const tuluvuud = {
  back: null,
  front: null,
};

function garaltBelge(utga) {
  const text = String(utga || "").trim();
  if (text.length <= KHAMGIIN_IKH_GARALT) return text;
  return text.slice(0, KHAMGIIN_IKH_GARALT) + "\n…(таслав)";
}

function nuutsZuvEsekh(req) {
  const nuuts = process.env.SHINECHLELT_NUUTS;
  if (!nuuts) return { zuv: false, kod: 503, aldaa: "Төгсгөлөг идэвхжээгүй." };
  const irsen = String(req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (irsen !== nuuts) return { zuv: false, kod: 401, aldaa: "Эрх хүрэхгүй." };
  return { zuv: true };
}

/** Ажлыг ард нь ажиллуулж, төлвийг шинэчилнэ. */
function ajilEkhluulye(zoriult, tushaal) {
  tuluvuud[zoriult] = {
    zoriult,
    tuluv: "ajillaj",
    tushaal,
    ekhelsen: new Date().toISOString(),
    duussan: null,
    stdout: "",
    stderr: "",
    aldaa: null,
  };

  console.log(`🚀 [SHINECHLELT] ${zoriult} эхэллээ: ${tushaal}`);

  exec(
    tushaal,
    { timeout: KHUGATSAA_MS, maxBuffer: 1024 * 1024 * 10, shell: "/bin/bash" },
    (aldaa, stdout, stderr) => {
      const ur = tuluvuud[zoriult];
      if (!ur) return;
      ur.duussan = new Date().toISOString();
      ur.stdout = garaltBelge(stdout);
      ur.stderr = garaltBelge(stderr);

      if (aldaa) {
        ur.tuluv = "amjiltgui";
        ur.aldaa = aldaa.killed
          ? `${KHUGATSAA_MS / 60000} минутад багтаж дуусаагүй тул зогсоов.`
          : aldaa.message;
        console.error(`❌ [SHINECHLELT] ${zoriult} амжилтгүй: ${ur.aldaa}`);
      } else {
        ur.tuluv = "amjilttai";
        console.log(`✅ [SHINECHLELT] ${zoriult} дууслаа.`);
      }
    },
  );
}

router.post("/shinechlelt", (req, res) => {
  const shalgalt = nuutsZuvEsekh(req);
  if (!shalgalt.zuv) {
    return res
      .status(shalgalt.kod)
      .json({ success: false, aldaa: shalgalt.aldaa });
  }

  const zoriult = String(req.body?.zoriult || "back").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(tuluvuud, zoriult)) {
    return res
      .status(400)
      .json({ success: false, aldaa: `Тодорхойгүй зориулт: ${zoriult}` });
  }

  // Зэрэг хоёр удаа ажиллуулахгүй — хоёр `git pull` зэрэг явбал хагас
  // татагдсан код дээр build хийж мэднэ.
  if (tuluvuud[zoriult]?.tuluv === "ajillaj") {
    return res.status(409).json({
      success: false,
      aldaa: "Энэ шинэчлэлт аль хэдийн ажиллаж байна.",
      tuluv: tuluvuud[zoriult],
    });
  }

  const tushaal =
    zoriult === "front"
      ? process.env.SHINECHLELT_FRONT_TUSHAAL
      : process.env.SHINECHLELT_BACK_TUSHAAL;

  if (!tushaal) {
    return res.status(503).json({
      success: false,
      aldaa: `SHINECHLELT_${zoriult.toUpperCase()}_TUSHAAL тохируулаагүй байна.`,
    });
  }

  ajilEkhluulye(zoriult, tushaal);

  // 202 — хүлээн авсан, ажиллаж байна. Үр дүнг GET-ээр асууна.
  return res.status(202).json({
    success: true,
    ajillaj: true,
    tuluv: tuluvuud[zoriult],
  });
});

router.get("/shinechleltTuluv", (req, res) => {
  const shalgalt = nuutsZuvEsekh(req);
  if (!shalgalt.zuv) {
    return res
      .status(shalgalt.kod)
      .json({ success: false, aldaa: shalgalt.aldaa });
  }
  return res.json({ success: true, tuluvuud });
});

/**
 * НИЙТЭД нээлттэй товч төлөв — amarhome вэб өөрөө «Шинэчилж байна»
 * мэдэгдлээ харуулахдаа үүнийг асууна.
 *
 * Нууц ШААРДАХГҮЙ: энэ нь зөвхөн «одоо шинэчлэл явж байна уу» гэдгийг
 * хэлнэ. Тушаал, гаралт, алдааны мөр ОГТ буцаахгүй — тэдгээр нь серверийн
 * зам, багцын мэдээлэл задруулж мэднэ.
 */
router.get("/shinechleltAjillajBaina", (req, res) => {
  const zoriultuud = {
    back: tuluvuud.back?.tuluv === "ajillaj",
    front: tuluvuud.front?.tuluv === "ajillaj",
  };

  // `ajillaj` нь «САЙТЫГ хаах шаардлагатай юу» гэсэн утгатай — «ямар
  // нэг ажил явж байна уу» гэсэн утгатай БИШ.
  //
  // ФРОНТЫН шинэчлэлт нь build-аа ТУСДАА хавтсанд хийдэг тул тэр 7
  // минутын турш сайт БҮРЭН ХЭВИЙН ажиллана. Хаах цорын ганц агшин нь
  // `pm2 restart`-ын хэдэн секунд бөгөөд тэр үед вэб сервер өөрөө
  // унтарсан байдаг — энэ төгсгөлөг ч хариулахгүй. Тэр хэдэн секундийг
  // nginx-ийн error_page (deploy/shinechlelt.html) хаана.
  //
  // Харин БЭКИЙН шинэчлэлт нь sukhBackv2-ыг өөрийг нь дахин асаадаг тул
  // API үнэхээр алга болно — тэнд л хаах нь зөв.
  const ajillaj = zoriultuud.back;

  // Завсрын кэш энэ хариуг хадгалвал мэдэгдэл гацна.
  res.set("Cache-Control", "no-store");
  res.json({ ajillaj, zoriultuud });
});

module.exports = router;
