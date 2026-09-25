/**
 * Буруу орцонд орсон тоотуудыг зөв орц руу нь шилжүүлэх.
 *
 * Асуудал: оршин суугчийн Excel импорт `updateDavkharWithToot`-д орцыг
 * дамжуулдаггүй байсан тул 2, 3-р орцын тоотууд барилгын тохиргооны
 * `davkhariinToonuud["1::<давхар>"]` түлхүүрт ордог байв. «Тоот бүртгэл»
 * дээр 1-р орцын мөрөнд бусад орцын тоот холилдож харагдана.
 *
 * Тоот бүрийн жинхэнэ орцыг гэрээ (цуцлаагүй) болон оршин суугчийн
 * `toots[]`-аас тодорхойлно. Зөвхөн НЭГ л өөр орц заасан тоотыг шилжүүлнэ —
 * хэн ч заагаагүй эсвэл зөрчилтэй тоот байрандаа үлдэнэ.
 *
 * Ашиглах:
 *   cd scratch && node orts_toot_zasakh.js <baiguullagiinId>            # зөвхөн харуулна
 *   cd scratch && node orts_toot_zasakh.js <baiguullagiinId> --apply    # хадгална
 */
require("dotenv").config({ path: "../tokhirgoo/tokhirgoo.env" });
const { db } = require("zevbackv2");

const TSUTSLASAN = new Set(["цуцалсан", "tsutlsasan", "идэвхгүй"]);
const salgakh = (v) =>
  (Array.isArray(v) ? v : [v])
    .flatMap((x) => String(x ?? "").split(/[\s,;|]+/))
    .map((x) => x.trim())
    .filter(Boolean);
const eremblekh = (a, b) => {
  const x = parseInt(a);
  const y = parseInt(b);
  return !isNaN(x) && !isNaN(y) && x !== y ? x - y : String(a).localeCompare(String(b));
};

async function main() {
  const [orgId, ...busad] = process.argv.slice(2);
  const khadgalakh = busad.includes("--apply");
  if (!orgId) {
    console.error("Ашиглах: node orts_toot_zasakh.js <baiguullagiinId> [--apply]");
    process.exit(1);
  }

  db.kholboltUusgey(null, process.env.MONGODB_URI);
  await new Promise((r) => setTimeout(r, 3000));

  const kh = db.kholboltuud.find((k) => String(k.baiguullagiinId) === String(orgId));
  if (!kh) {
    console.error(`Байгууллагын холболт олдсонгүй: ${orgId}`);
    process.exit(1);
  }

  const Baiguullaga = require("../models/baiguullaga")(db.erunkhiiKholbolt);
  const Geree = require("../models/geree")(kh);
  const OrshinSuugch = require("../models/orshinSuugch")(db.erunkhiiKholbolt);

  const baiguullaga = await Baiguullaga.findById(orgId).lean();
  if (!baiguullaga) {
    console.error("Байгууллага олдсонгүй");
    process.exit(1);
  }

  const gereenuud = await Geree.find(
    { baiguullagiinId: String(orgId) },
    { toot: 1, davkhar: 1, orts: 1, barilgiinId: 1, tuluv: 1 },
  ).lean();
  const suugchid = await OrshinSuugch.find(
    { $or: [{ baiguullagiinId: String(orgId) }, { "toots.baiguullagiinId": String(orgId) }] },
    { toots: 1, toot: 1, davkhar: 1, orts: 1, barilgiinId: 1, baiguullagiinId: 1 },
  ).lean();

  const set = {};
  for (const [bi, barilga] of (baiguullaga.barilguud || []).entries()) {
    const bId = String(barilga._id);
    const map = barilga.tokhirgoo?.davkhariinToonuud || {};
    if (!Object.keys(map).length) continue;

    // "давхар|тоот" → заасан орцуудын олонлог
    const zaasan = new Map();
    const nemekh = (o, f, t, b) => {
      o = String(o ?? "").trim();
      f = String(f ?? "").trim();
      t = String(t ?? "").trim();
      if (!o || !f || !t || (b && String(b) !== bId)) return;
      const k = `${f}|${t}`;
      if (!zaasan.has(k)) zaasan.set(k, new Set());
      zaasan.get(k).add(o);
    };
    for (const g of gereenuud) {
      if (TSUTSLASAN.has(String(g.tuluv || "").trim().toLowerCase())) continue;
      nemekh(g.orts, g.davkhar, g.toot, g.barilgiinId);
    }
    for (const s of suugchid) {
      for (const t of s.toots || []) {
        if (t.baiguullagiinId && String(t.baiguullagiinId) !== String(orgId)) continue;
        nemekh(t.orts, t.davkhar, t.toot, t.barilgiinId);
      }
      if (s.baiguullagiinId && String(s.baiguullagiinId) === String(orgId))
        nemekh(s.orts, s.davkhar, s.toot, s.barilgiinId);
    }

    const shine = {};
    for (const [k, v] of Object.entries(map)) shine[k] = salgakh(v);
    const shiljuulelt = [];
    for (const [k, units] of Object.entries(shine)) {
      if (!k.includes("::")) continue;
      const [o, f] = k.split("::");
      for (const u of [...units]) {
        const z = zaasan.get(`${f}|${u}`);
        if (!z || z.has(o) || z.size !== 1) continue;
        const zov = [...z][0];
        const zovKey = `${zov}::${f}`;
        shine[k] = shine[k].filter((x) => x !== u);
        if (!shine[zovKey]) shine[zovKey] = [];
        if (!shine[zovKey].includes(u)) shine[zovKey].push(u);
        shiljuulelt.push(`${u}: ${k} → ${zovKey}`);
      }
    }

    console.log(`\n=== Барилга: ${barilga.ner || bId} (${bId}) ===`);
    if (!shiljuulelt.length) {
      console.log("Шилжүүлэх тоот алга.");
      continue;
    }
    shiljuulelt.forEach((x) => console.log("  " + x));
    console.log(`Нийт ${shiljuulelt.length} тоот шилжинэ.`);

    const gargakh = {};
    for (const [k, units] of Object.entries(shine))
      gargakh[k] = units.length ? [units.sort(eremblekh).join(",")] : [];
    set[`barilguud.${bi}.tokhirgoo.davkhariinToonuud`] = gargakh;
  }

  if (!Object.keys(set).length) {
    console.log("\nӨөрчлөлт алга.");
  } else if (!khadgalakh) {
    console.log("\nЗӨВХӨН ХАРУУЛАВ. Хадгалах бол --apply нэмж ажиллуулна уу.");
  } else {
    await Baiguullaga.updateOne({ _id: baiguullaga._id }, { $set: set });
    console.log("\nХадгаллаа.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
