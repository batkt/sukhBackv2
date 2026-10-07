/**
 * Үүссэн НЭХЭМЖЛЭХүүдийн зардлын мөрүүдийг одоогийн «Ашиглалтын зардал»
 * жагсаалттай ТЭНЦҮҮЛНЭ.
 *
 *   • жагсаалтад байгаа ч нэхэмжлэхэд байхгүй зардлыг НЭМНЭ
 *   • дүн нь зөрсөн мөрийг ЗАСНА
 *   • жагсаалтад БАЙХГҮЙ зардлын мөрийг УСТГАНА
 *
 * SMS ИЛГЭЭХГҮЙ — `invoiceSendService`-ийг огт дууддаггүй.
 *
 * ХЭЗЭЭ Ч ХӨНДӨХГҮЙ мөрүүд (зориуд хамгаалсан):
 *   • Эхний үлдэгдэл            (`ekhniiUldegdelEsekh: true`)
 *   • Төлөлт, хөнгөлөлт         (`dun < 0`)
 *   • Гараар нэмсэн авлага      (`source`: gar / avlaga / zogsool / khungulult)
 *     — зогсоол, гараж, торгууль зэрэг нь ашиглалтын зардлын жагсаалтад
 *     байдаггүй тул «жагсаалтад байхгүй» гэж үзэж устгавал айл бүрийн
 *     гаражийн төлбөр алга болно.
 *
 * ЗААЛТТАЙ (`zaalt: true`) ЗАРДАЛ:
 *   Эдгээр нь тоолуурын заалтаар бодогддог тул сарын автомат нэхэмжлэхэд
 *   заалтгүйгээр ОРДОГГҮЙ. Энэ скрипт тэдгээрийг ТОГТМОЛ дүнгээр (tariff,
 *   эсвэл tariff=0 бол suuriKhuraamj) бичнэ — учир нь хэрэглэгч «нэхэмжлэхэд
 *   нэм» гэж хүссэн. Гэхдээ ДАРАА САРЫН автомат ажиллагаа тэднийг дахин
 *   оруулахгүй: тэгэхийн тулд зардлын тохиргооноос `zaalt`-ыг унтраах
 *   шаардлагатай. Дууссаны дараа скрипт үүнийг сануулна.
 *
 * ХЭРЭГЛЭЭ (анхдагчаар ЗӨВХӨН ТУРШИНА):
 *
 *   node scripts/nekhemjlekhZardalSync.js \
 *     --org 6a97d3afaf2ad1911035e063 \
 *     --barilga 6aa768d0999234623454ad8e \
 *     --sar 2026-09 --sar 2026-10
 *
 * Бодитоор бичихдээ `--apply`. Нэг айлыг шалгахад `--geree <gereeniiId>`.
 */

const path = require("path");
const dotenv = require("dotenv");

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);
dotenv.config({ path: "./tokhirgoo/local.env" });
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });
process.env.TZ = process.env.TZ || "Asia/Ulaanbaatar";
process.setMaxListeners(0);

const { db } = require("zevbackv2");
const { getKholboltByBaiguullagiinId } = require("../utils/dbConnection");
const { gereeniiShuult } = require("../utils/gereeniiZardalTseverlegee");
const {
  gereeniiTootTurul,
  zardluudShuuye,
  zardalAngilal,
  OR_SUUTS,
} = require("../utils/zardalAngilal");

const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const Geree = require("../models/geree");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const guilgeeService = require("../services/guilgeeService");

/* ─── Тушаалын мөр ──────────────────────────────────────────────────────── */

const argAvya = (ner) => {
  const i = process.argv.indexOf(`--${ner}`);
  return i === -1 ? null : process.argv[i + 1];
};
const argOlon = (ner) =>
  process.argv.reduce((ur, a, i) => (a === `--${ner}` ? [...ur, process.argv[i + 1]] : ur), []);

const ORG = argAvya("org");
const BARILGA = argAvya("barilga");
const SARUUD = argOlon("sar");            // "2026-09" хэлбэртэй
const GEREE_SHUULT = argAvya("geree");
const APPLY = process.argv.includes("--apply");

if (!ORG || SARUUD.length === 0) {
  console.error(
    "Хэрэглээ: node scripts/nekhemjlekhZardalSync.js --org <id> [--barilga <id>] " +
      "--sar 2026-09 [--sar 2026-10] [--geree <id>] [--apply]",
  );
  process.exit(1);
}

/** Гараар бүртгэсэн мөрийг ашиглалтын зардлын синкээс хасна. */
const GARAAR = new Set(["gar", "avlaga", "zogsool", "khungulult"]);

const mun = (n) => `${Number(n || 0).toLocaleString("mn-MN")}₮`;
/**
 * Нэрийг жишихэд бэлтгэнэ.
 *
 * ДОТООД зайг нь ч хураана: нэг барилгад «Ажилчдын цалин 4 хүн», нөгөөд нь
 * «Ажилчдын  цалин 4 хүн» (хоёр зайтай) гэж бичигдсэн байдаг. Зөвхөн захыг
 * нь тайрвал эдгээр нь ӨӨР зардал мэт уншигдаж, нэгийг нь устгаад нөгөөг нь
 * нэмэх дэмий эргэлт үүсгэдэг.
 */
const jishiye = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
/** УБ цагаар YYYY-MM */
const sarKey = (d) => {
  const t = new Date(new Date(d).getTime() + 8 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Зардлын нэхэмжлэх дээр бичигдэх дүн. */
function zardliinDun(z) {
  if (Number(z.tariff) > 0) return Number(z.tariff);
  if (Number(z.suuriKhuraamj) > 0) return Number(z.suuriKhuraamj);
  return Number(z.dun || 0);
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(APPLY ? "  БОДИТООР БИЧНЭ (--apply)" : "  ЗӨВХӨН ТУРШИЛТ — юу ч бичихгүй");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  байгууллага:", ORG, "| барилга:", BARILGA || "(бүгд)");
  console.log("  сарууд     :", SARUUD.join(", "));
  if (GEREE_SHUULT) console.log("  зөвхөн гэрээ:", GEREE_SHUULT);
  console.log("");

  const kholbolt = getKholboltByBaiguullagiinId(ORG);
  if (!kholbolt) throw new Error("Баазын холболт олдсонгүй: " + ORG);

  const ZardalModel = AshiglaltiinZardluud(kholbolt);
  const GereeModel = Geree(kholbolt);
  const LedgerModel = GuilgeeAvlaguud(kholbolt);
  const NekhModel = NekhemjlekhiinTuukh(kholbolt);

  /* ── 1. Мастер жагсаалт — БАРИЛГА ТУС БҮРЭЭР ──
   *
   * Байгууллагын хэмжээнд ажиллуулахад барилга бүр ӨӨРИЙН зардлын
   * жагсаалттай. Бүгдийг нэг овоолго болговол А барилгын айлд Б барилгын
   * зардал бичигдэнэ — тиймээс гэрээ бүрт нь ТҮҮНИЙ барилгын жагсаалтыг
   * (+ барилга заагаагүй, байгууллагын нийтийн зардлууд) тааруулна.
   */
  const zardliinShuult = { baiguullagiinId: String(ORG) };
  if (BARILGA) {
    zardliinShuult.$or = [
      { barilgiinId: String(BARILGA) },
      { barilgiinId: { $exists: false } },
      { barilgiinId: null },
      { barilgiinId: "" },
    ];
  }
  const master = await ZardalModel.find(zardliinShuult).lean();

  const niitiinZardal = master.filter((z) => !z.barilgiinId);
  const barilgaarZardal = new Map();
  master
    .filter((z) => z.barilgiinId)
    .forEach((z) => {
      const k = String(z.barilgiinId);
      if (!barilgaarZardal.has(k)) barilgaarZardal.set(k, []);
      barilgaarZardal.get(k).push(z);
    });

  /** Тухайн гэрээнд хамаарах зардлын жагсаалт. */
  const gereeniiZardal = (geree) => [
    ...(barilgaarZardal.get(String(geree.barilgiinId || "")) || []),
    ...niitiinZardal,
  ];

  console.log(`Ашиглалтын зардал: ${master.length} (барилга: ${barilgaarZardal.size}, нийтийн: ${niitiinZardal.length})`);
  for (const [bId, jagsaalt] of barilgaarZardal) {
    console.log(`\n   ▸ барилга ${bId} — ${jagsaalt.length} зардал`);
    jagsaalt.forEach((z) =>
      console.log(
        `       ${String(z.ner).replace(/\s+$/, "").padEnd(34)} ${mun(zardliinDun(z)).padStart(12)}` +
          (z.zaalt ? "  ⚠ заалттай" : ""),
      ),
    );
  }
  if (niitiinZardal.length) {
    console.log(`\n   ▸ бүх барилгад (барилга заагаагүй) — ${niitiinZardal.length}`);
    niitiinZardal.forEach((z) =>
      console.log(`       ${String(z.ner).replace(/\s+$/, "").padEnd(34)} ${mun(zardliinDun(z)).padStart(12)}`));
  }
  const zaalttai = master.filter((z) => z.zaalt);
  console.log("");

  /* ── 2. Гэрээ, нэхэмжлэх ── */
  const gereeShuult = gereeniiShuult(ORG, BARILGA);
  if (GEREE_SHUULT) gereeShuult._id = GEREE_SHUULT;
  const gereenuud = await GereeModel.find(gereeShuult)
    .select({ gereeniiDugaar: 1, toot: 1, tootTurul: 1, barilgiinId: 1, khariltsagchId: 1, orshinSuugchId: 1 })
    .lean();
  const gereeMap = new Map(gereenuud.map((g) => [String(g._id), g]));

  const nekhuud = await NekhModel.find({ gereeniiId: { $in: [...gereeMap.keys()] } })
    .select({ gereeniiId: 1, nekhemjlekhiinDugaar: 1, tuluv: 1, niitTulbur: 1, ognoo: 1, toot: 1 })
    .lean();
  const khamragdakh = nekhuud.filter((n) => SARUUD.includes(sarKey(n.ognoo)));
  console.log(`Гэрээ: ${gereenuud.length} | сонгосон сарын нэхэмжлэх: ${khamragdakh.length}`);

  const murnuud = await LedgerModel.find({
    nekhemjlekhId: { $in: khamragdakh.map((n) => String(n._id)) },
  }).lean();
  const murByNekh = new Map();
  murnuud.forEach((m) => {
    const k = String(m.nekhemjlekhId);
    if (!murByNekh.has(k)) murByNekh.set(k, []);
    murByNekh.get(k).push(m);
  });

  /* ── 3. Төлөвлөгөө ── */
  const nemekh = [];
  const zasakh = [];
  const ustgakh = [];
  const alagssanNekh = [];   // төлбөрийн баримт г.м. — хөндөөгүй
  let khuuchinNiit = 0;
  let shineNiit = 0;
  let khamgaalsan = 0;

  for (const nekh of khamragdakh) {
    const geree = gereeMap.get(String(nekh.gereeniiId));
    if (!geree) continue;

    // Энэ гэрээний БАРИЛГЫН зардал, дээр нь зогсоол/агуулахын гэрээнд
    // зөвхөн өөрийн ангиллынх нь үлдэнэ.
    const tootTurul = await gereeniiTootTurul(geree);
    const zorikh = zardluudShuuye(gereeniiZardal(geree), tootTurul);
    const zorikhByNer = new Map(zorikh.map((z) => [jishiye(z.ner), z]));

    // Энэ барилгын ашиглалтын зардлууд ямар `zardliinTurul`-тэй вэ.
    // Үүнээс ӨӨР төрлийн мөр бол ашиглалтын зардал БИШ — хөндөхгүй.
    const zorikhTurluud = new Set(zorikh.map((z) => jishiye(z.zardliinTurul || "Энгийн")));

    /**
     * Жагсаалтад ТААРААГҮЙ мөрийг устгаж болох уу.
     *
     * Зогсоол, гараж, агуулахын төлбөр нь нэхэмжлэх үүсгэх үед ашиглалтын
     * зардалтай ЯГ адилхан `source: "nekhemjlekh"`-ээр бичигддэг тул зөвхөн
     * `source`-оор ялгаж болохгүй — зогсоолынх `turul: "Авлага"`,
     * `zardliinTurul: "Зогсоол"` байдаг, нэр нь ч «зогсоол/гараж/агуулах»
     * агуулдаг.
     *
     * ЗӨВХӨН жагсаалтад таараагүй мөрд хэрэглэнэ. Нэр нь жагсаалттай
     * таарсан бол энэ шалгалт хэрэггүй — «Зогсоолын хаалт» нь бодит
     * ашиглалтын зардал атлаа нэрэндээ «зогсоол» агуулдаг тул энд
     * хамгаалагдвал дүн нь хэзээ ч засагдахгүй, бүр давхар нэмэгдэнэ.
     */
    const ustgajBolokhUu = (m) => {
      const ner = m.zardliinNer || m.tailbar;
      if (zardalAngilal({ ner, zardliinTurul: m.zardliinTurul }) !== OR_SUUTS) return false;
      if (jishiye(m.turul) === "авлага") return false;
      return zorikhTurluud.has(jishiye(m.zardliinTurul || "Энгийн"));
    };

    const mur = murByNekh.get(String(nekh._id)) || [];

    /* ── ТӨЛБӨРИЙН БАРИМТЫГ АЛГАСАНА ──────────────────────────────────
     *
     * Төлөлт бүртгэхэд түүнийг барих жижиг нэхэмжлэх үүсдэг — зардлын
     * мөргүй, зөвхөн төлөлт агуулсан баримт. Мөн эхний үлдэгдлийн баримт ч
     * ийм. Ийм баримтыг «бүх зардал нь дутуу» гэж үзвэл 11 зардлыг бүтнээр
     * нь нэмж, айлыг нэг сар ИЛҮҮ нэхэмжилнэ.
     *
     * Жинхэнэ сарын нэхэмжлэх дээр ашиглалтын зардлын мөр АЛЬ ХЭДИЙН
     * байдаг. Нэг ч байхгүй бол энэ нь үйлчилгээний нэхэмжлэх БИШ —
     * хөндөхгүй өнгөрнө.
     */
    const ashiglaltiinMurTei = mur.some(
      (m) =>
        (m.dun || 0) > 0 &&
        !m.ekhniiUldegdelEsekh &&
        !GARAAR.has(m.source) &&
        zorikhByNer.has(jishiye(m.zardliinNer || m.tailbar)),
    );
    if (!ashiglaltiinMurTei) {
      alagssanNekh.push({ nekh, geree, murToo: mur.length });
      mur.forEach((m) => {
        khamgaalsan++;
        khuuchinNiit += Math.max(0, m.dun || 0);
        shineNiit += Math.max(0, m.dun || 0);
      });
      continue;
    }

    for (const m of mur) {
      if ((m.dun || 0) < 0 || m.ekhniiUldegdelEsekh || GARAAR.has(m.source)) {
        khamgaalsan++;
        khuuchinNiit += Math.max(0, m.dun || 0);
        shineNiit += Math.max(0, m.dun || 0);
        continue;
      }
      const ner = jishiye(m.zardliinNer || m.tailbar);
      const zorilt = zorikhByNer.get(ner);

      // Жагсаалтад таараагүй бөгөөд ашиглалтын зардал мэт БИШ бол бүрэн
      // хөндөхгүй — мөн дахин нэмэгдэхээс сэргийлж нэрийг нь ч хасахгүй.
      if (!zorilt && !ustgajBolokhUu(m)) {
        khamgaalsan++;
        khuuchinNiit += Math.max(0, m.dun || 0);
        shineNiit += Math.max(0, m.dun || 0);
        continue;
      }

      khuuchinNiit += m.dun || 0;
      if (!zorilt) {
        ustgakh.push({ m, nekh, geree });
      } else {
        const shine = zardliinDun(zorilt);
        shineNiit += shine;
        // ЗӨВХӨН дүнг нь тэнцүүлнэ. Мөрийн НЭРийг хөндөхгүй — «Ажилчдын
        // цалин» гэх мэт хоёр янзаар бичигдсэн нэр хэвээр үлдэнэ, гэхдээ
        // тааруулалт нь дотоод зайг хурааж харьцуулдаг тул дүн нь зөв
        // засагдана.
        if (Math.round(shine) !== Math.round(m.dun || 0))
          zasakh.push({ m, nekh, geree, shine });
        zorikhByNer.delete(ner);
      }
    }
    // Үлдсэн нь нэхэмжлэхэд огт байхгүй зардлууд
    for (const z of zorikhByNer.values()) {
      const dun = zardliinDun(z);
      if (dun <= 0) continue;
      shineNiit += dun;
      nemekh.push({ z, nekh, geree, dun });
    }
  }

  console.log("");
  console.log("── ТӨЛӨВЛӨГӨӨ ──");
  console.log(`  НЭМЭХ  : ${nemekh.length} мөр  (+${mun(nemekh.reduce((s, x) => s + x.dun, 0))})`);
  console.log(`  ЗАСАХ  : ${zasakh.length} мөр  (${mun(zasakh.reduce((s, x) => s + (x.shine - (x.m.dun || 0)), 0))})`);
  console.log(`  УСТГАХ : ${ustgakh.length} мөр  (−${mun(ustgakh.reduce((s, x) => s + (x.m.dun || 0), 0))})`);
  console.log(`  хөндөхгүй (эхний үлдэгдэл / төлөлт / гараар нэмсэн): ${khamgaalsan} мөр`);
  console.log(`  АЛГАССАН нэхэмжлэх (ашиглалтын зардлын мөргүй — төлбөрийн баримт г.м.): ${alagssanNekh.length}`);
  alagssanNekh.slice(0, 10).forEach((a) =>
    console.log(`     ∅ ${String(a.nekh.nekhemjlekhiinDugaar || a.nekh._id).padEnd(22)} ${new Date(a.nekh.ognoo).toISOString().slice(0,10)}  ${a.murToo} мөр`));
  if (alagssanNekh.length > 10) console.log(`     … бусад ${alagssanNekh.length - 10}`);
  console.log(`  НИЙТ ДҮН: ${mun(khuuchinNiit)} → ${mun(shineNiit)}  (${shineNiit - khuuchinNiit >= 0 ? "+" : ""}${mun(shineNiit - khuuchinNiit)})`);

  // Барилгаар задалсан — байгууллагын хэмжээнд ажиллуулахад аль барилгад
  // хэр их өөрчлөлт орохыг урьдчилж харуулна.
  if (!BARILGA) {
    const barilgaar = new Map();
    const nem = (bId, talbar, utga) => {
      const k = String(bId || "(барилгагүй)");
      const b = barilgaar.get(k) || { nemekh: 0, zasakh: 0, ustgakh: 0, zuruu: 0 };
      b[talbar] += 1;
      b.zuruu += utga;
      barilgaar.set(k, b);
    };
    nemekh.forEach((x) => nem(x.geree.barilgiinId, "nemekh", x.dun));
    zasakh.forEach((x) => nem(x.geree.barilgiinId, "zasakh", x.shine - (x.m.dun || 0)));
    ustgakh.forEach((x) => nem(x.geree.barilgiinId, "ustgakh", -(x.m.dun || 0)));

    console.log("\n  Барилгаар:");
    console.log("     барилга                     нэмэх  засах  устгах          зөрүү");
    for (const [bId, b] of barilgaar) {
      console.log(
        `     ${bId.padEnd(26)} ${String(b.nemekh).padStart(5)} ${String(b.zasakh).padStart(6)} ${String(b.ustgakh).padStart(7)} ${mun(b.zuruu).padStart(14)}`,
      );
    }
  }

  const neruudeer = (jagsaalt, dunAvya) => {
    const bulgeg = new Map();
    jagsaalt.forEach((x) => {
      const ner = String(x.z?.ner || x.m?.zardliinNer || x.m?.tailbar).replace(/\s+$/, "");
      const b = bulgeg.get(ner) || { too: 0, dun: 0 };
      b.too++; b.dun += dunAvya(x);
      bulgeg.set(ner, b);
    });
    return [...bulgeg.entries()].sort((a, b) => b[1].too - a[1].too);
  };

  if (nemekh.length) {
    console.log("\n  Нэмэгдэх зардлууд:");
    neruudeer(nemekh, (x) => x.dun).forEach(([n, b]) =>
      console.log(`     + ${n.padEnd(36)} ${String(b.too).padStart(4)} нэхэмжлэхэд  ${mun(b.dun).padStart(14)}`));
  }
  if (zasakh.length) {
    console.log("\n  Засагдах зардлууд:");
    neruudeer(zasakh, (x) => x.shine - (x.m.dun || 0)).forEach(([n, b]) =>
      console.log(`     ~ ${n.padEnd(36)} ${String(b.too).padStart(4)} мөр          ${mun(b.dun).padStart(14)}`));
  }
  if (ustgakh.length) {
    console.log("\n  УСТГАГДАХ зардлууд (жагсаалтад байхгүй):");
    neruudeer(ustgakh, (x) => -(x.m.dun || 0)).forEach(([n, b]) =>
      console.log(`     − ${n.padEnd(36)} ${String(b.too).padStart(4)} мөр          ${mun(b.dun).padStart(14)}`));
  }

  if (GEREE_SHUULT && khamragdakh.length) {
    console.log("\n  (нэг гэрээний дэлгэрэнгүй дээр харагдаж байна)");
  }

  if (!APPLY) {
    console.log("\n──────────────────────────────────────────────────────────────");
    console.log("ТУРШИЛТ ДУУСЛАА — юу ч бичигдээгүй.  Гүйцэтгэхдээ `--apply` нэмнэ.");
    console.log("──────────────────────────────────────────────────────────────");
    return;
  }

  /* ── 4. Бичих ── */
  console.log("\n── Бичиж эхэллээ ──");

  if (ustgakh.length) {
    const r = await LedgerModel.deleteMany({ _id: { $in: ustgakh.map((x) => x.m._id) } });
    console.log(`✅ ${r.deletedCount} мөр устгав`);
  }
  if (zasakh.length) {
    await LedgerModel.bulkWrite(
      zasakh.map((x) => ({
        updateOne: {
          filter: { _id: x.m._id },
          update: { $set: { dun: x.shine, undsenDun: x.shine, tulukhDun: x.shine } },
        },
      })),
      { ordered: false },
    );
    console.log(`✅ ${zasakh.length} мөрийн дүнг зассан`);
  }
  if (nemekh.length) {
    await LedgerModel.insertMany(
      nemekh.map(({ z, nekh, geree, dun }) => ({
        baiguullagiinId: String(ORG),
        barilgiinId: geree.barilgiinId || BARILGA || "",
        gereeniiId: String(geree._id),
        gereeniiDugaar: geree.gereeniiDugaar,
        orshinSuugchId: geree.orshinSuugchId,
        nekhemjlekhId: String(nekh._id),
        toot: geree.toot || nekh.toot,
        ognoo: nekh.ognoo,
        dun,
        undsenDun: dun,
        tulukhDun: dun,
        tulsunDun: 0,
        turul: z.turul || "Тогтмол",
        zardliinTurul: z.zardliinTurul || "Энгийн",
        zardliinNer: z.ner,
        tailbar: z.ner,
        source: "nekhemjlekh",
        nekhemjlekhDeerKharagdakh: true,
        ekhniiUldegdelEsekh: false,
        // Ердийн нэхэмжлэх үүсгэлттэй ЯГ ижил — `invoiceService`-ийн
        // зардлын давталт ч мөн адил бичдэг. Ингэснээр синкээр нэмэгдсэн
        // мөр нь жагсаалт дээр бусдаасаа ялгарахгүй.
        guilgeeKhiisenAjiltniiNer: "Систем",
        guilgeeKhiisenAjiltniiId: geree.orshinSuugchId,
      })),
      { ordered: false },
    );
    console.log(`✅ ${nemekh.length} мөр нэмсэн`);
  }

  // Нэхэмжлэхийн толгой + задаргаа, дараа нь гэрээний төлөв
  const khundsunNekh = new Set(
    [...nemekh, ...zasakh, ...ustgakh].map((x) => String(x.nekh._id)),
  );
  for (const nekhId of khundsunNekh) {
    const mur = await LedgerModel.find({ nekhemjlekhId: nekhId, dun: { $gt: 0 } })
      .select({ zardliinNer: 1, tailbar: 1, dun: 1, zardliinTurul: 1, turul: 1 })
      .lean();
    await NekhModel.updateOne(
      { _id: nekhId },
      {
        $set: {
          niitTulbur: mur.reduce((s, m) => s + (m.dun || 0), 0),
          "medeelel.zardluud": mur.map((m) => ({
            ner: m.zardliinNer || m.tailbar,
            dun: m.dun,
            turul: m.turul,
            zardliinTurul: m.zardliinTurul,
          })),
        },
      },
    );
  }
  console.log(`✅ ${khundsunNekh.size} нэхэмжлэхийн дүн, задаргааг шинэчлэв`);

  const khundsunGeree = new Set(
    [...nemekh, ...zasakh, ...ustgakh].map((x) => String(x.geree._id)),
  );
  for (const gid of khundsunGeree) await guilgeeService.syncInvoicesStatus(kholbolt, gid);
  console.log(`✅ ${khundsunGeree.size} гэрээний төлөв, үлдэгдлийг дахин бодов`);

  console.log("\n── Дууслаа. SMS ИЛГЭЭГДСЭНГҮЙ. ──");
  if (zaalttai.length) {
    console.log("\n⚠ АНХААРУУЛГА — заалттай зардал:");
    zaalttai.forEach((z) => console.log(`   • ${String(z.ner).trim()}`));
    console.log("   Эдгээр нь `zaalt: true` тул ДАРААГИЙН сарын автомат нэхэмжлэхэд");
    console.log("   заалт оруулаагүй бол ОРОХГҮЙ. Тогтмол төлбөр болгох бол зардлын");
    console.log("   тохиргооноос «заалттай»-г унтрааж, дүнг `tariff`-д бичнэ үү.");
  }
}

(async () => {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  db.kholboltUusgey(require("express")(), MONGODB_URI);
  for (let i = 0; i < 60; i++) {
    if (getKholboltByBaiguullagiinId(ORG)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  try {
    await main();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ АЛДАА:", err.message, "\n", err.stack);
    process.exit(1);
  }
})();
