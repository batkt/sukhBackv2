// ТООТ-ыг бичихээс ӨМНӨ шалгах скрипт. Юу ч бичихгүй — зөвхөн уншина.
//
// Тоот бүрийг 3 бие даасан эх сурвалжаас тусад нь гаргаж, зөрөх эсэхийг харуулна:
//   A) нэхэмжлэх (nekhemjlekhiinId -> nekhemjlekh.toot)
//   B) гэрээ, нэхэмжлэхийн gereeniiId-аар
//   C) гэрээ, баримтын дээрх gereeniiDugaar-аар
// Мөн баримтын дүн нэхэмжлэхийн niitTulbur-тэй таарч байгаа эсэх, тухайн
// гэрээний дугаараар хэдэн гэрээ олдсоныг (олон бол эргэлзээтэй) шалгана.
//
//   node scratch/verify_ebarimt_toot.js --db=nairamdalSukh
//   node scratch/verify_ebarimt_toot.js --db=nairamdalSukh --only-suspect
require("dotenv").config({ path: __dirname + "/../tokhirgoo/tokhirgoo.env" });
const mongoose = require("mongoose");
const { db } = require("zevbackv2");

const arg = (n) =>
  (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1];
const orgArg = arg("org");
const dbArg = arg("db");
const ONLY_SUSPECT = process.argv.includes("--only-suspect");

const tootBaikhEsekh = (v) =>
  v !== undefined && v !== null && String(v).trim() !== "" && String(v).trim() !== "-";
const tootAvya = (d) => {
  if (!d) return "";
  if (tootBaikhEsekh(d.toot)) return String(d.toot).trim();
  if (Array.isArray(d.toots))
    for (const t of d.toots) {
      const v = typeof t === "string" || typeof t === "number" ? t : t?.toot;
      if (tootBaikhEsekh(v)) return String(v).trim();
    }
  return "";
};
const idZuv = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

async function main() {
  const URI = process.env.MONGODB_URI;
  if (!URI) throw new Error("MONGODB_URI тохируулаагүй байна");
  db.kholboltUusgey(null, URI);
  await new Promise((r) => setTimeout(r, 5000));

  const EbarimtShine = require("../models/ebarimtShine");
  const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
  const Geree = require("../models/geree");

  const kholboltuud = (db.kholboltuud || []).filter((k) => {
    if (k.baaziinNer === "undsenBaaz" || !k.baiguullagiinId) return false;
    if (orgArg && String(k.baiguullagiinId) !== orgArg) return false;
    if (dbArg && String(k.baaziinNer || "") !== dbArg) return false;
    return true;
  });

  for (const kh of kholboltuud) {
    const barimtuud = await EbarimtShine(kh)
      .find({
        $or: [{ toot: { $in: [null, "", "-"] } }, { toot: { $exists: false } }],
      })
      .select("_id toot date createdAt gereeniiDugaar nekhemjlekhiinId receiptId totalAmount")
      .sort({ createdAt: -1 })
      .lean();
    if (!barimtuud.length) continue;

    // Нэхэмжлэхүүд
    const nIds = [
      ...new Set(
        barimtuud.map((b) => String(b.nekhemjlekhiinId || "")).filter(idZuv)
      ),
    ];
    const nMap = new Map();
    if (nIds.length) {
      const nn = await NekhemjlekhiinTuukh(kh)
        .find({ _id: { $in: nIds } })
        .select("toot toots gereeniiDugaar gereeniiId niitTulbur ovog ner ognoo")
        .lean();
      for (const n of nn) nMap.set(String(n._id), n);
    }

    // Гэрээнүүд — ID-аар ба дугаараар
    const gIds = [
      ...new Set(
        barimtuud
          .map((b) => nMap.get(String(b.nekhemjlekhiinId || ""))?.gereeniiId)
          .filter(idZuv)
          .map(String)
      ),
    ];
    const gDug = [
      ...new Set(
        barimtuud
          .map(
            (b) =>
              b.gereeniiDugaar ||
              nMap.get(String(b.nekhemjlekhiinId || ""))?.gereeniiDugaar ||
              ""
          )
          .filter(Boolean)
      ),
    ];
    const shalguur = [];
    if (gIds.length) shalguur.push({ _id: { $in: gIds } });
    if (gDug.length) shalguur.push({ gereeniiDugaar: { $in: gDug } });
    const gg = shalguur.length
      ? await Geree(kh)
          .find({ $or: shalguur })
          .select("toot gereeniiDugaar tuluv ovog ner")
          .lean()
      : [];

    const gById = new Map();
    const gByDug = new Map(); // dugaar -> [гэрээнүүд]
    for (const g of gg) {
      gById.set(String(g._id), g);
      if (!gByDug.has(g.gereeniiDugaar)) gByDug.set(g.gereeniiDugaar, []);
      gByDug.get(g.gereeniiDugaar).push(g);
    }

    const mur = [];
    const toolt = { taarsan: 0, zuruu: 0, negEkh: 0, oldoogui: 0, olonGeree: 0, dunZuruu: 0 };

    for (const b of barimtuud) {
      const n = nMap.get(String(b.nekhemjlekhiinId || ""));
      const dugaar = b.gereeniiDugaar || n?.gereeniiDugaar || "";
      const gereeList = gByDug.get(dugaar) || [];
      const idevkhtei = gereeList.filter((g) => g.tuluv === "Идэвхтэй");
      const gByDugSongoson = idevkhtei[0] || gereeList[0];

      const A = tootAvya(n);
      const B = tootAvya(gById.get(String(n?.gereeniiId || "")));
      const C = tootAvya(gByDugSongoson);

      const utguud = [A, B, C].filter(Boolean);
      const yalgaatai = [...new Set(utguud)];

      let shiidver;
      if (!utguud.length) {
        shiidver = "ОЛДОХГҮЙ";
        toolt.oldoogui++;
      } else if (yalgaatai.length > 1) {
        shiidver = "⚠ ЗӨРӨӨ";
        toolt.zuruu++;
      } else if (utguud.length === 1) {
        shiidver = "1 эх сурвалж";
        toolt.negEkh++;
      } else {
        shiidver = "✓ таарсан";
        toolt.taarsan++;
      }

      // Гэрээний дугаар давхардсан эсэх
      const olonGeree = gereeList.length > 1;
      if (olonGeree) toolt.olonGeree++;

      // Дүн тулгалт: баримтын totalAmount vs нэхэмжлэхийн niitTulbur
      const bDun = Math.round(Number(b.totalAmount || 0));
      const nDun = n?.niitTulbur == null ? null : Math.round(Number(n.niitTulbur));
      let dunTemdeg = "—";
      if (nDun != null) {
        if (Math.abs(bDun - nDun) <= 1) dunTemdeg = "✓";
        else {
          dunTemdeg = `✗ ${nDun.toLocaleString("en-US")}`;
          toolt.dunZuruu++;
        }
      }

      const ner = [gByDugSongoson?.ovog, gByDugSongoson?.ner]
        .filter(Boolean)
        .join(" ") || [n?.ovog, n?.ner].filter(Boolean).join(" ") || "-";

      const sereldee =
        shiidver.startsWith("⚠") ||
        shiidver === "ОЛДОХГҮЙ" ||
        olonGeree ||
        dunTemdeg.startsWith("✗");
      if (ONLY_SUSPECT && !sereldee) continue;

      mur.push({
        Огноо: new Date(b.date || b.createdAt).toISOString().slice(0, 10),
        Гэрээ: dugaar || "-",
        "A нэхэмжлэх": A || "-",
        "B гэрээ(id)": B || "-",
        "C гэрээ(дугаар)": C || "-",
        Шийдвэр: shiidver,
        "Гэрээ тоо": gereeList.length + (olonGeree ? " ⚠" : ""),
        Дүн: dunTemdeg,
        Нэр: ner.slice(0, 22),
      });
    }

    console.log(`\n=== ${kh.baaziinNer} | шалгасан: ${barimtuud.length} ===`);
    console.table(mur);
    console.log(
      `✓ 2+ эх сурвалж таарсан: ${toolt.taarsan}\n` +
      `  зөвхөн 1 эх сурвалжтай: ${toolt.negEkh}\n` +
      `⚠ эх сурвалжууд зөрсөн:  ${toolt.zuruu}\n` +
      `⚠ гэрээний дугаар давхардсан: ${toolt.olonGeree}\n` +
      `⚠ дүн нэхэмжлэхтэй зөрсөн:    ${toolt.dunZuruu}\n` +
      `  огт олдоогүй: ${toolt.oldoogui}`
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
