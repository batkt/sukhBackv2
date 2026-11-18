/**
 * Хархорум — 2026 оны 11-р сарын гаражийн (зогсоолын) авлагыг 50,000 → 38,500 болгох.
 *
 * АНХДАГЧААР DRY-RUN: юу ч бичихгүй, зөвхөн хэвлэнэ.
 * Бодитоор бичих:  --apply
 *
 *   node scratch/garaj_une_zasakh_2026_11.js                       # dry-run
 *   node scratch/garaj_une_zasakh_2026_11.js --apply               # бичнэ
 *
 * Сонголтууд (анхдагч утгатай):
 *   --org  "Хархорум"   байгууллагын нэр (regex) эсвэл _id — яг 1 байгууллага таарах ёстой
 *   --sar  2026-11      засах сар (Улаанбаатарын цагаар)
 *   --khuuchin 50000    зөвхөн яг энэ дүнтэй мөрийг засна
 *   --shine   38500     шинэ дүн
 *
 * Юуг засдаг вэ (нэг мөр бүрт):
 *   1. guilgeeAvlaguud мөр: dun / undsenDun / tulukhDun  (гүйлгээний түүх + үлдэгдэл эндээс бодогдоно)
 *   2. nekhemjlekhiinTuukh.medeelel.zardluud доторх «Зогсоолын төлбөр (тоот N)» мөр + niitTulbur
 *   3. guilgeeService.syncInvoicesStatus(гэрээ) — нэхэмжлэхийн niitTulbur/uldegdel/tuluv-ийг
 *      ledger-ээс дахин тооцно (апп өөрөө мөр бичих бүрт дууддаг тэр л функц).
 *   Гэрээнд тусдаа үлдэгдлийн талбар байхгүй — үлдэгдэл = guilgeeAvlaguud.dun-ийн нийлбэр.
 *
 * ХӨНДӨХГҮЙ (тусад нь жагсаана):
 *   - нэхэмжлэх нь «Төлсөн» төлөвтэй
 *   - нэхэмжлэхэд ebarimtShine (REVERSED биш) гарсан
 *   - дүн нь --khuuchin-тэй тэнцүү биш (хоногоор бодсон г.м.)
 *
 * --apply үед өөрчлөхөөс өмнөх баримтуудыг scratch/backup_garaj_<огноо>.json-д хадгална.
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../tokhirgoo/tokhirgoo.env") });
const fs = require("fs");
const path = require("path");
const { db } = require("zevbackv2");

const args = process.argv.slice(2);
const arg = (ner, anhdagch) => {
  const i = args.indexOf(`--${ner}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : anhdagch;
};
const APPLY = args.includes("--apply");
const ORG = arg("org", "Хархорум");
const SAR = arg("sar", "2026-11");
const KHUUCHIN = Number(arg("khuuchin", "50000"));
const SHINE = Number(arg("shine", "38500"));
const ZORUU = KHUUCHIN - SHINE;

const GARAJ_RE = /зогсоол|гараж|гараш/i;
const AGUULAKH_RE = /агуулах/i;
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const fmt = (v) => r2(v).toLocaleString("en-US", { minimumFractionDigits: 2 });

function tootAvya(r) {
  const m = `${r.zardliinNer || ""} ${r.tailbar || ""}`.match(/тоот\s*([^\s),]+)/i);
  return m ? String(m[1]).trim() : String(r.toot || "").trim();
}

async function main() {
  if (!/^\d{4}-\d{2}$/.test(SAR) || !(KHUUCHIN > 0) || !(SHINE > 0) || ZORUU <= 0) {
    throw new Error("Параметр буруу: --sar YYYY-MM, --khuuchin > --shine > 0");
  }
  const [on, sar] = SAR.split("-").map(Number);
  // Улаанбаатар (UTC+8) — сарын эхлэл/төгсгөл
  const ekh = new Date(`${SAR}-01T00:00:00+08:00`);
  const tug = new Date(`${sar === 12 ? on + 1 : on}-${String(sar === 12 ? 1 : sar + 1).padStart(2, "0")}-01T00:00:00+08:00`);

  console.log(`\n=== ${APPLY ? "APPLY — БОДИТ БИЧИЛТ" : "DRY-RUN — юу ч бичихгүй"} ===`);
  console.log(`Байгууллага: /${ORG}/  Сар: ${SAR} [${ekh.toISOString()} … ${tug.toISOString()})  ${fmt(KHUUCHIN)} → ${fmt(SHINE)}\n`);

  const uri = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log(`MongoDB: ${uri.replace(/:([^:@/]+)@/, ":****@")}`);
  await db.kholboltUusgey(null, uri);

  // ---- 1. Байгууллага ----
  const Baiguullaga = require("../models/baiguullaga")(db.erunkhiiKholbolt);
  const shuult = /^[0-9a-f]{24}$/i.test(ORG) ? { _id: ORG } : { ner: { $regex: ORG, $options: "i" } };
  const orgs = await Baiguullaga.find(shuult).lean();
  if (orgs.length !== 1) {
    console.log(`❌ Байгууллага яг 1 таарах ёстой, ${orgs.length} таарлаа:`);
    orgs.forEach((o) => console.log(`   ${o._id}  ${o.ner}`));
    console.log("   --org <_id> гэж тодорхой зааж өгнө үү.");
    process.exit(1);
  }
  const org = orgs[0];
  const orgId = String(org._id);
  console.log(`Байгууллага: ${org.ner} (${orgId})`);

  // Ирээдүйн саруудын үнэ эндээс ирнэ (invoiceService.js / utils/zogsoolAvlaga.js):
  //   barilga.tokhirgoo.garsiinTolborUtga || baiguullaga.zogsoolUusgekhTulbur
  console.log(`\n--- Гаражийн үнийн тохиргоо (12-р сараас хойш эндээс бодогдоно) ---`);
  console.log(`   baiguullaga.zogsoolUusgekhTulbur = ${org.zogsoolUusgekhTulbur ?? "(байхгүй)"}`);
  console.log(`   baiguullaga.tokhirgoo.garsiinTolborUtga = ${org.tokhirgoo?.garsiinTolborUtga ?? "(байхгүй)"}  (сарын нэхэмжлэх үүнийг УНШДАГГҮЙ)`);
  for (const b of org.barilguud || []) {
    const t = b.tokhirgoo || {};
    const ashiglakh = t.garsiinTolborEnabled === false ? 0 : Number(t.garsiinTolborUtga || org.zogsoolUusgekhTulbur || 0);
    console.log(
      `   барилга «${b.ner}» (${b._id}): garsiinTolborEnabled=${t.garsiinTolborEnabled}, garsiinTolborUtga=${t.garsiinTolborUtga ?? "-"}` +
        `  → ашиглагдах үнэ: ${fmt(ashiglakh)}${ashiglakh === KHUUCHIN ? "  ⚠ ДАРААГИЙН САР ДАХИН " + fmt(KHUUCHIN) + " ГАРНА" : ""}`,
    );
  }

  const kh = db.kholboltuud.find((k) => String(k.baiguullagiinId) === orgId);
  if (!kh) throw new Error(`Байгууллагын холболт олдсонгүй: ${orgId}`);

  const Guilgee = require("../models/guilgeeAvlaguud")(kh);
  const Nekhemjlekh = require("../models/nekhemjlekhiinTuukh")(kh);
  const EbarimtShine = require("../models/ebarimtShine")(kh);
  const guilgeeService = require("../services/guilgeeService");

  // ---- 2. Мөрүүд ----
  const murnuud = await Guilgee.find({
    ognoo: { $gte: ekh, $lt: tug },
    dun: { $gt: 0 },
    ekhniiUldegdelEsekh: { $ne: true },
  }).lean();
  const garajMur = murnuud.filter((r) => {
    const t = `${r.zardliinNer || ""} ${r.tailbar || ""} ${r.zardliinTurul || ""}`;
    return GARAJ_RE.test(t) && !AGUULAKH_RE.test(t) && String(r.turul || "").toLowerCase() !== "төлөлт";
  });

  const invIds = [...new Set(garajMur.map((r) => r.nekhemjlekhId).filter(Boolean))];
  const invoices = await Nekhemjlekh.find({ _id: { $in: invIds } }).lean();
  const invMap = new Map(invoices.map((i) => [String(i._id), i]));
  const ebarimtuud = await EbarimtShine.find({
    nekhemjlekhiinId: { $in: invIds },
    status: { $ne: "REVERSED" },
  }).select({ nekhemjlekhiinId: 1, status: 1, totalAmount: 1 }).lean();
  const ebarimtMap = new Map();
  ebarimtuud.forEach((e) => ebarimtMap.set(String(e.nekhemjlekhiinId), e));

  const zasakh = [];
  const tulsun = [];
  const ebarimttai = [];
  const ondoo = [];
  for (const r of garajMur) {
    const inv = r.nekhemjlekhId ? invMap.get(String(r.nekhemjlekhId)) : null;
    const eb = r.nekhemjlekhId ? ebarimtMap.get(String(r.nekhemjlekhId)) : null;
    const item = { r, inv, eb };
    if (r2(r.dun) !== r2(KHUUCHIN)) ondoo.push(item);
    else if (eb) ebarimttai.push(item);
    else if (inv && inv.tuluv === "Төлсөн") tulsun.push(item);
    else zasakh.push(item);
  }

  const mur = ({ r, inv, eb }) =>
    `${new Date(r.ognoo).toISOString().slice(0, 10)}  гэрээ ${r.gereeniiDugaar || r.gereeniiId}  тоот ${tootAvya(r)}  ` +
    `«${r.zardliinNer || r.tailbar}»  ${fmt(r.dun)}  src=${r.source}  нэх=${inv ? `${inv.nekhemjlekhiinDugaar || inv._id} (${inv.tuluv})` : r.nekhemjlekhId ? "олдсонгүй" : "-"}` +
    (eb ? `  ebarimt=${eb.status} ${fmt(eb.totalAmount)}` : "");

  console.log(`\n--- ЗАСАХ: ${zasakh.length} мөр (${fmt(KHUUCHIN)} → ${fmt(SHINE)}) ---`);
  zasakh.forEach((x) => console.log("   " + mur(x)));
  console.log(`\n--- ХӨНДӨХГҮЙ: нэхэмжлэх «Төлсөн» — ${tulsun.length} мөр ---`);
  tulsun.forEach((x) => console.log("   " + mur(x)));
  console.log(`\n--- ХӨНДӨХГҮЙ: ebarimt гарсан — ${ebarimttai.length} мөр ---`);
  ebarimttai.forEach((x) => console.log("   " + mur(x)));
  console.log(`\n--- ХӨНДӨХГҮЙ: дүн ${fmt(KHUUCHIN)} биш (хоногоор бодсон г.м.) — ${ondoo.length} мөр ---`);
  ondoo.forEach((x) => console.log("   " + mur(x)));

  // ---- 3. Үлдэгдлийн нөлөө (гэрээгээр) ----
  const gereenuud = [...new Set(zasakh.map((x) => String(x.r.gereeniiId)))];
  console.log(`\n--- Үлдэгдлийн нөлөө: ${gereenuud.length} гэрээ ---`);
  let niitBuuralt = 0;
  for (const gid of gereenuud) {
    const agg = await Guilgee.aggregate([{ $match: { gereeniiId: gid } }, { $group: { _id: null, s: { $sum: "$dun" } } }]);
    const umnu = agg[0]?.s || 0;
    const too = zasakh.filter((x) => String(x.r.gereeniiId) === gid).length;
    const dugaar = zasakh.find((x) => String(x.r.gereeniiId) === gid).r.gereeniiDugaar || gid;
    niitBuuralt += too * ZORUU;
    console.log(`   ${dugaar}: үлдэгдэл ${fmt(umnu)} → ${fmt(umnu - too * ZORUU)}  (${too} мөр × −${fmt(ZORUU)})`);
  }
  console.log(`   НИЙТ авлага буурах: −${fmt(niitBuuralt)}`);

  if (!APPLY) {
    console.log(`\nDRY-RUN дууслаа. Юу ч бичигдээгүй. Бичих бол --apply нэмж ажиллуулна.\n`);
    process.exit(0);
  }

  // ---- 4. APPLY ----
  const backupFile = path.join(__dirname, `backup_garaj_${SAR}_${Date.now()}.json`);
  const backupInv = invoices.filter((i) => zasakh.some((x) => String(x.r.nekhemjlekhId) === String(i._id)));
  fs.writeFileSync(backupFile, JSON.stringify({ orgId, guilgeeAvlaguud: zasakh.map((x) => x.r), nekhemjlekhiinTuukh: backupInv }, null, 2));
  console.log(`\n💾 Нөөц: ${backupFile}`);

  const tailbar = `Гаражийн үнэ засвар ${SAR}: ${KHUUCHIN} → ${SHINE} (${new Date().toISOString().slice(0, 10)})`;
  let murToo = 0;
  for (const { r } of zasakh) {
    const set = { dun: SHINE, nemeltTailbar: [r.nemeltTailbar, tailbar].filter(Boolean).join("; ") };
    if (r2(r.undsenDun) === r2(KHUUCHIN)) set.undsenDun = SHINE;
    if (r2(r.tulukhDun) === r2(KHUUCHIN)) set.tulukhDun = SHINE;
    // dun-аар нь давхар шүүнэ — дахин ажиллуулахад давхар хасахгүй
    const res = await Guilgee.collection.updateOne({ _id: r._id, dun: KHUUCHIN }, { $set: set });
    murToo += res.modifiedCount;
  }
  console.log(`✅ guilgeeAvlaguud: ${murToo} мөр шинэчлэгдлээ`);

  // Нэхэмжлэхийн задаргаа (medeelel.zardluud)
  let invToo = 0;
  const invGroups = new Map();
  for (const x of zasakh) {
    if (!x.inv) continue;
    const k = String(x.inv._id);
    if (!invGroups.has(k)) invGroups.set(k, { inv: x.inv, tootuud: [] });
    invGroups.get(k).tootuud.push(tootAvya(x.r));
  }
  for (const { inv, tootuud } of invGroups.values()) {
    const zardluud = Array.isArray(inv.medeelel?.zardluud) ? inv.medeelel.zardluud.map((z) => ({ ...z })) : [];
    let uurchilsun = 0;
    const uldsen = [...tootuud];
    for (const z of zardluud) {
      const t = `${z.ner || ""} ${z.zardliinNer || ""} ${z.tailbar || ""} ${z.zardliinTurul || ""}`;
      if (!GARAJ_RE.test(t) || AGUULAKH_RE.test(t) || r2(z.dun) !== r2(KHUUCHIN)) continue;
      const zToot = tootAvya({ zardliinNer: z.ner || z.zardliinNer, tailbar: z.tailbar, toot: z.toot });
      const idx = uldsen.indexOf(zToot);
      if (idx < 0) continue;
      uldsen.splice(idx, 1);
      z.dun = SHINE;
      if (r2(z.tariff) === r2(KHUUCHIN)) z.tariff = SHINE;
      uurchilsun++;
    }
    const set = {};
    if (uurchilsun) set["medeelel.zardluud"] = zardluud;
    if (inv.niitTulbur != null) set.niitTulbur = r2(Number(inv.niitTulbur) - tootuud.length * ZORUU);
    if (Object.keys(set).length) {
      await Nekhemjlekh.collection.updateOne({ _id: inv._id }, { $set: set });
      invToo++;
    }
  }
  console.log(`✅ nekhemjlekhiinTuukh: ${invToo} нэхэмжлэх шинэчлэгдлээ`);

  for (const gid of gereenuud) await guilgeeService.syncInvoicesStatus(kh, gid);
  console.log(`✅ syncInvoicesStatus: ${gereenuud.length} гэрээ дахин тооцогдлоо\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
