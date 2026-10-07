/**
 * Нэг байгууллага/барилгын ашиглалтын зардлыг БАГЦААР засах.
 *
 *   • нэг зардлыг БҮРМӨСӨН устгах
 *   • нэг зардлын ҮНИЙГ солих
 *   • (сонголтоор) тухайн сарын НЭХЭМЖЛЭХүүдэд нь тусгах — төлсөн нь ч орно
 *
 * SMS ИЛГЭЭХГҮЙ. Энэ скрипт `invoiceSendService`-ийг огт дууддаггүй —
 * мессеж илгээх цорын ганц зам тэр модуль дотор байдаг тул оршин суугчид
 * ямар ч мэдэгдэл очихгүй.
 *
 * ЯАГААД НЭХЭМЖЛЭХИЙГ УСТГААД ДАХИН ҮҮСГЭДЭГГҮЙ ВЭ:
 *
 *   1. `invoiceDeletionService.deleteInvoice` нь ТӨЛӨЛТТЭЙ нэхэмжлэхийг
 *      зориуд устгуулдаггүй ("Cannot delete invoice with existing payments").
 *      Устгавал төлөлтийн мөрүүд нь хамт устах тул мөнгө орсон баримт
 *      алга болно.
 *   2. `createInvoiceForContract(..., {override:true})` нь ХУУЧИН зардлын
 *      мөрүүдийг цэвэрлэдэггүй — байгаа нэхэмжлэх дээр 11 мөр ДАХИН нэмдэг
 *      тул давхар нэхэмжлэл үүснэ.
 *
 * Тиймээс энд нэхэмжлэхийг ХӨНДӨХГҮЙ, зөвхөн авлагын дэвтрийн холбогдох
 * МӨРийг нь засна: устгасан зардлын мөрийг хасаад, үнэ өөрчлөгдсөн мөрийн
 * дүнг шинэчилнэ. Төлөлт, и-баримтын холбоос бүрэн хэвээр үлдэнэ. Дараа нь
 * `syncInvoicesStatus` төлөв, үлдэгдлийг дахин бодно — нэхэмжлэх хямдарсан
 * бол илүү төлөлт (урьдчилгаа), үнэтэй болсон бол дутуу төлөлт болж гарна.
 *
 * ХЭРЭГЛЭЭ (анхдагчаар ЗӨВХӨН ТУРШИНА, юу ч бичихгүй):
 *
 *   node scripts/zardalBulkZasvar.js \
 *     --org 6a97d3afaf2ad1911035e063 \
 *     --barilga 6aa768d0999234623454ad8e \
 *     --ustgakh "Домофоны төлбөр" \
 *     --une "Лифт=7000" \
 *     --sar
 *
 * Бодитоор бичихдээ `--apply` нэмнэ. `--sar` байхгүй бол зөвхөн зардлын
 * жагсаалт засагдаж, ДАРАА САРААС эхлэн хүчин төгөлдөр болно.
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
const { calculateBillingCycleBounds } = require("../utils/dateUtils");
const {
  zardalAdilUu,
  zardlaasGereenuudiigTseverleye,
  gereeniiShuult,
  gereeniiZardluudBichye,
} = require("../utils/gereeniiZardalTseverlegee");

const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const Geree = require("../models/geree");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const NekhemjlekhCron = require("../models/cronSchedule");
const guilgeeService = require("../services/guilgeeService");

/* ─── Тушаалын мөр ──────────────────────────────────────────────────────── */

function argAvya(ner) {
  const i = process.argv.indexOf(`--${ner}`);
  return i === -1 ? null : process.argv[i + 1];
}
const TUG = (ner) => process.argv.includes(`--${ner}`);

const ORG = argAvya("org");
const BARILGA = argAvya("barilga");
const USTGAKH = argAvya("ustgakh");
const UNE_ARG = argAvya("une");
const SAR = TUG("sar");
const APPLY = TUG("apply");

if (!ORG || (!USTGAKH && !UNE_ARG)) {
  console.error(
    "Хэрэглээ: node scripts/zardalBulkZasvar.js --org <id> [--barilga <id>] " +
      '[--ustgakh "<нэр>"] [--une "<нэр>=<дүн>"] [--sar] [--apply]',
  );
  process.exit(1);
}

let UNE_NER = null;
let UNE_DUN = null;
if (UNE_ARG) {
  const salgasan = UNE_ARG.lastIndexOf("=");
  if (salgasan === -1) {
    console.error('--une нь "<нэр>=<дүн>" хэлбэртэй байна. Жишээ: --une "Лифт=7000"');
    process.exit(1);
  }
  UNE_NER = UNE_ARG.slice(0, salgasan).trim();
  UNE_DUN = Number(UNE_ARG.slice(salgasan + 1));
  if (!Number.isFinite(UNE_DUN) || UNE_DUN < 0) {
    console.error("Шинэ үнэ буруу байна:", UNE_ARG.slice(salgasan + 1));
    process.exit(1);
  }
}

const mun = (n) => `${Number(n || 0).toLocaleString("mn-MN")}₮`;
const jishiye = (s) => String(s || "").trim().toLowerCase();

/* ─── Үндсэн ажиллагаа ──────────────────────────────────────────────────── */

async function main() {
  console.log("══════════════════════════════════════════════════════════");
  console.log(APPLY ? "  БОДИТООР БИЧНЭ (--apply)" : "  ЗӨВХӨН ТУРШИЛТ — юу ч бичихгүй");
  console.log("══════════════════════════════════════════════════════════");
  console.log("  байгууллага :", ORG);
  console.log("  барилга     :", BARILGA || "(бүгд)");
  if (USTGAKH) console.log("  устгах      :", USTGAKH);
  if (UNE_NER) console.log("  үнэ солих   :", `${UNE_NER} → ${mun(UNE_DUN)}`);
  console.log("  нэхэмжлэх   :", SAR ? "ЭНЭ САРЫНХЫГ ЗАСНА (төлсөн нь ч орно)" : "хөндөхгүй (дараа сараас)");
  console.log("");

  const kholbolt = getKholboltByBaiguullagiinId(ORG);
  if (!kholbolt) throw new Error("Байгууллагын баазын холболт олдсонгүй: " + ORG);

  const ZardalModel = AshiglaltiinZardluud(kholbolt);
  const GereeModel = Geree(kholbolt);
  const LedgerModel = GuilgeeAvlaguud(kholbolt);
  const NekhModel = NekhemjlekhiinTuukh(kholbolt);

  /* ── 1. Зардлуудыг олох ── */
  const zardliinShuult = { baiguullagiinId: String(ORG) };
  if (BARILGA) {
    zardliinShuult.$or = [
      { barilgiinId: String(BARILGA) },
      { barilgiinId: { $exists: false } },
      { barilgiinId: null },
      { barilgiinId: "" },
    ];
  }
  const bukhZardal = await ZardalModel.find(zardliinShuult).lean();
  console.log(`Энэ барилгад хамаарах зардал: ${bukhZardal.length}`);
  bukhZardal.forEach((z) =>
    console.log(`   • ${z.ner}  ${mun(z.tariff)}  [${z.zardliinTurul || "—"}]`),
  );
  console.log("");

  const ustgakhZardal = USTGAKH
    ? bukhZardal.find((z) => jishiye(z.ner) === jishiye(USTGAKH))
    : null;
  const uneZardal = UNE_NER
    ? bukhZardal.find((z) => jishiye(z.ner) === jishiye(UNE_NER))
    : null;

  if (USTGAKH && !ustgakhZardal)
    throw new Error(`Устгах зардал олдсонгүй: "${USTGAKH}" — дээрх жагсаалтаас нэрийг нь яг хуулна уу.`);
  if (UNE_NER && !uneZardal)
    throw new Error(`Үнэ солих зардал олдсонгүй: "${UNE_NER}" — дээрх жагсаалтаас нэрийг нь яг хуулна уу.`);

  if (uneZardal)
    console.log(`Үнийн өөрчлөлт: "${uneZardal.ner}" ${mun(uneZardal.tariff)} → ${mun(UNE_DUN)}\n`);

  /* ── 2. Хамрах гэрээнүүд ── */
  const gereeShuult = gereeniiShuult(ORG, BARILGA);
  const gereenuud = await GereeModel.find(gereeShuult)
    .select({ gereeniiDugaar: 1, toot: 1, zardluud: 1, tuluv: 1 })
    .lean();
  console.log(`Хамрах гэрээ: ${gereenuud.length}`);

  const ustgakhTeiGeree = ustgakhZardal
    ? gereenuud.filter((g) => (g.zardluud || []).some((z) => zardalAdilUu(z, ustgakhZardal)))
    : [];
  const uneTeiGeree = uneZardal
    ? gereenuud.filter((g) => (g.zardluud || []).some((z) => zardalAdilUu(z, uneZardal)))
    : [];
  if (ustgakhZardal) console.log(`   • "${ustgakhZardal.ner}" байгаа гэрээ: ${ustgakhTeiGeree.length}`);
  if (uneZardal) console.log(`   • "${uneZardal.ner}" байгаа гэрээ: ${uneTeiGeree.length}`);
  console.log("");

  /* ── 3. Энэ сарын нэхэмжлэхүүд ── */
  let mochlogiinNekh = [];
  let ledgerUstgakh = [];
  let ledgerZasakh = [];

  if (SAR) {
    let cronDay = 1;
    const cron = await NekhemjlekhCron(kholbolt)
      .findOne({ baiguullagiinId: String(ORG), $or: [{ barilgiinId: BARILGA || null }, { barilgiinId: null }] })
      .sort({ barilgiinId: -1 })
      .lean()
      .catch(() => null);
    if (cron?.nekhemjlekhUusgekhOgnoo) cronDay = cron.nekhemjlekhUusgekhOgnoo;
    const { startOfCycle, endOfCycle } = calculateBillingCycleBounds(cronDay, new Date());
    console.log(
      `Мөчлөг: ${startOfCycle.toISOString().slice(0, 10)} — ${endOfCycle.toISOString().slice(0, 10)} (сарын ${cronDay}-нд үүсдэг)`,
    );

    const gereeIduud = gereenuud.map((g) => String(g._id));
    mochlogiinNekh = await NekhModel.find({
      gereeniiId: { $in: gereeIduud },
      ognoo: { $gte: startOfCycle, $lte: endOfCycle },
    })
      .select({ gereeniiId: 1, nekhemjlekhiinDugaar: 1, tuluv: 1, niitTulbur: 1, toot: 1 })
      .lean();

    const tulsun = mochlogiinNekh.filter((n) => n.tuluv === "Төлсөн").length;
    console.log(`Энэ мөчлөгийн нэхэмжлэх: ${mochlogiinNekh.length} (төлсөн ${tulsun}, төлөөгүй ${mochlogiinNekh.length - tulsun})`);

    const nekhIduud = mochlogiinNekh.map((n) => String(n._id));
    const ledgerMur = await LedgerModel.find({
      nekhemjlekhId: { $in: nekhIduud },
      dun: { $gt: 0 },
    })
      .select({ nekhemjlekhId: 1, zardliinNer: 1, tailbar: 1, dun: 1, gereeniiId: 1 })
      .lean();

    const murNer = (m) => jishiye(m.zardliinNer || m.tailbar);
    if (ustgakhZardal) ledgerUstgakh = ledgerMur.filter((m) => murNer(m) === jishiye(ustgakhZardal.ner));
    if (uneZardal) ledgerZasakh = ledgerMur.filter((m) => murNer(m) === jishiye(uneZardal.ner));

    const khasakhDun = ledgerUstgakh.reduce((s, m) => s + (m.dun || 0), 0);
    const zuruu = ledgerZasakh.reduce((s, m) => s + (UNE_DUN - (m.dun || 0)), 0);
    console.log(`   • устгах авлагын мөр : ${ledgerUstgakh.length}  (−${mun(khasakhDun)})`);
    console.log(`   • үнэ засах мөр      : ${ledgerZasakh.length}  (${zuruu >= 0 ? "+" : ""}${mun(zuruu)})`);
    console.log(`   • НИЙТ нөлөө         : ${mun(zuruu - khasakhDun)}`);
    console.log("");
  }

  if (!APPLY) {
    console.log("──────────────────────────────────────────────────────────");
    console.log("ТУРШИЛТ ДУУСЛАА — юу ч бичигдээгүй.");
    console.log("Бодитоор гүйцэтгэхдээ ижил тушаалд `--apply` нэмнэ үү.");
    console.log("──────────────────────────────────────────────────────────");
    return;
  }

  /* ── 4. БИЧИХ ── */
  console.log("── Бичиж эхэллээ ──\n");

  // 4a. Зардал устгах: эхлээд гэрээнээс, дараа нь мастер бичлэг
  if (ustgakhZardal) {
    const ur = await zardlaasGereenuudiigTseverleye(kholbolt, ustgakhZardal);
    await ZardalModel.deleteOne({ _id: ustgakhZardal._id });
    console.log(
      `✅ "${ustgakhZardal.ner}" устгав — ${ur.zassan} гэрээнээс хасагдлаа` +
        (ur.aldaatai.length ? `, ${ur.aldaatai.length} гэрээнд АЛДАА` : ""),
    );
    ur.aldaatai.forEach((a) => console.log(`     ✕ ${a.gereeniiDugaar || a.gereeniiId}: ${a.aldaa}`));
  }

  // 4b. Үнэ солих: мастер бичлэг + гэрээ бүрийн хуулбар
  if (uneZardal) {
    await ZardalModel.updateOne({ _id: uneZardal._id }, { $set: { tariff: UNE_DUN, dun: UNE_DUN } });

    let zassan = 0;
    const aldaatai = [];
    for (const geree of uneTeiGeree) {
      try {
        const shine = (geree.zardluud || []).map((z) =>
          zardalAdilUu(z, uneZardal) ? { ...z, tariff: UNE_DUN, dun: UNE_DUN } : z,
        );
        await gereeniiZardluudBichye(GereeModel, geree._id, shine);
        zassan++;
      } catch (err) {
        aldaatai.push({ geree: geree.gereeniiDugaar || geree._id, aldaa: err.message });
      }
    }
    console.log(
      `✅ "${uneZardal.ner}" үнэ ${mun(UNE_DUN)} боллоо — ${zassan} гэрээнд` +
        (aldaatai.length ? `, ${aldaatai.length} гэрээнд АЛДАА` : ""),
    );
    aldaatai.forEach((a) => console.log(`     ✕ ${a.geree}: ${a.aldaa}`));
  }

  // 4c. Энэ сарын нэхэмжлэхийн авлагын мөрүүд
  if (SAR) {
    if (ledgerUstgakh.length) {
      const r = await LedgerModel.deleteMany({ _id: { $in: ledgerUstgakh.map((m) => m._id) } });
      console.log(`✅ Авлагын дэвтрээс ${r.deletedCount} мөр устгав ("${ustgakhZardal.ner}")`);
    }
    if (ledgerZasakh.length) {
      await LedgerModel.bulkWrite(
        ledgerZasakh.map((m) => ({
          updateOne: {
            filter: { _id: m._id },
            update: { $set: { dun: UNE_DUN, undsenDun: UNE_DUN, tulukhDun: UNE_DUN } },
          },
        })),
        { ordered: false },
      );
      console.log(`✅ Авлагын дэвтрийн ${ledgerZasakh.length} мөрийн дүнг ${mun(UNE_DUN)} болгов`);
    }

    // Нэхэмжлэхийн толгойн дүн + задаргааг үлдсэн мөрүүдээс нь дахин бүрдүүлнэ,
    // дараа нь төлөв/үлдэгдлийг гэрээ тус бүрд НЭГ удаа тэнцүүлнэ.
    const kholdsonGeree = new Set(
      [...ledgerUstgakh, ...ledgerZasakh].map((m) => String(m.gereeniiId)),
    );
    let shinechilsen = 0;
    for (const nekh of mochlogiinNekh) {
      if (!kholdsonGeree.has(String(nekh.gereeniiId))) continue;
      const mur = await LedgerModel.find({ nekhemjlekhId: String(nekh._id), dun: { $gt: 0 } })
        .select({ zardliinNer: 1, tailbar: 1, dun: 1, zardliinTurul: 1, turul: 1 })
        .lean();
      const niit = mur.reduce((s, m) => s + (m.dun || 0), 0);
      await NekhModel.updateOne(
        { _id: nekh._id },
        {
          $set: {
            niitTulbur: niit,
            "medeelel.zardluud": mur.map((m) => ({
              ner: m.zardliinNer || m.tailbar,
              dun: m.dun,
              turul: m.turul,
              zardliinTurul: m.zardliinTurul,
            })),
          },
        },
      );
      shinechilsen++;
    }
    console.log(`✅ ${shinechilsen} нэхэмжлэхийн дүн, задаргааг шинэчлэв`);

    for (const gid of kholdsonGeree) {
      await guilgeeService.syncInvoicesStatus(kholbolt, gid);
    }
    console.log(`✅ ${kholdsonGeree.size} гэрээний төлөв, үлдэгдлийг дахин бодов`);
  }

  console.log("\n── Дууслаа. SMS ИЛГЭЭГДСЭНГҮЙ. ──");
}

/* Баазын холболт бэлэн болтол хүлээнэ (index.js-ийн адил). */
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
    console.error("\n❌ АЛДАА:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
