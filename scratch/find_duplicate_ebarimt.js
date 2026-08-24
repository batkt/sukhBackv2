// Давхардсан e-barimt-уудыг олж ангилна. Юу ч бичихгүй, устгахгүй — зөвхөн уншина.
//
// ХОЁР ӨӨР АСУУДЛЫГ ЯЛГАНА:
//
//  [1] ЖИНХЭНЭ ДАВХАРДАЛ — ижил гэрээ + ижил дүн + N секундын дотор.
//      Нэг төлөлт олон нэхэмжлэх дээр зэрэг ажилласнаас үүсдэг (Promise.all race).
//      -> Эхнийхийг үлдээж, үлдсэнийг ХҮЧИНГҮЙ БОЛГОНО.
//
//  [2] БУРУУ ХОЛБООС — өөр өөр сард гарсан 2 баримт нэг nekhemjlekhiinId-тэй.
//      Баримтууд нь ХУУЧИН БИШ, төлөлт нь бодит. Зөвхөн холбоос буруу.
//      -> ХҮЧИНГҮЙ БОЛГОХГҮЙ. Гараар шалгаж, холбоосыг засна.
//
//   node scratch/find_duplicate_ebarimt.js --db=nairamdalSukh
//   node scratch/find_duplicate_ebarimt.js --db=nairamdalSukh --seconds=120
require("dotenv").config({ path: __dirname + "/../tokhirgoo/tokhirgoo.env" });
const { db } = require("zevbackv2");

const arg = (n) =>
  (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1];
const dbArg = arg("db");
const orgArg = arg("org");
const SEK = Number(arg("seconds") || 120);

const tsag = (b) => new Date(b.date || b.createdAt);
const mnt = (n) => Math.round(Number(n || 0)).toLocaleString("en-US");

async function main() {
  const URI = process.env.MONGODB_URI;
  if (!URI) throw new Error("MONGODB_URI тохируулаагүй байна");
  db.kholboltUusgey(null, URI);
  await new Promise((r) => setTimeout(r, 5000));

  const EbarimtShine = require("../models/ebarimtShine");
  const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

  const kholboltuud = (db.kholboltuud || []).filter((k) => {
    if (k.baaziinNer === "undsenBaaz" || !k.baiguullagiinId) return false;
    if (orgArg && String(k.baiguullagiinId) !== orgArg) return false;
    if (dbArg && String(k.baaziinNer || "") !== dbArg) return false;
    return true;
  });

  for (const kh of kholboltuud) {
    const bb = await EbarimtShine(kh)
      .find({ ustgasanOgnoo: { $exists: false } })
      .select("_id toot receiptId date createdAt gereeniiDugaar nekhemjlekhiinId totalAmount success status")
      .sort({ createdAt: 1 })
      .lean();
    if (!bb.length) continue;
    const amjilttai = bb.filter((b) => b.success || b.status === "SUCCESS");

    console.log(`\n================ ${kh.baaziinNer} ================`);
    console.log(`Нийт амжилттай баримт: ${amjilttai.length}`);

    // ---------- [1] ЖИНХЭНЭ ДАВХАРДАЛ: ижил гэрээ+дүн, ойрхон хугацаа ----------
    const bagts = new Map();
    for (const b of amjilttai) {
      const k = `${b.gereeniiDugaar || "-"}|${Math.round(Number(b.totalAmount || 0))}`;
      if (!bagts.has(k)) bagts.set(k, []);
      bagts.get(k).push(b);
    }

    const buleguud = [];
    for (const [k, arr] of bagts) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => tsag(a) - tsag(b));
      let bulag = [arr[0]];
      for (let i = 1; i < arr.length; i++) {
        if ((tsag(arr[i]) - tsag(bulag[bulag.length - 1])) / 1000 <= SEK)
          bulag.push(arr[i]);
        else {
          if (bulag.length > 1) buleguud.push({ k, bulag });
          bulag = [arr[i]];
        }
      }
      if (bulag.length > 1) buleguud.push({ k, bulag });
    }

    // Хүчингүй болгох ёстой баримтуудын багц (давхар тоолохоос сэргийлнэ)
    const khuchingui = new Set();
    let iluuToo = 0, iluuDun = 0;
    const mur1 = [];

    buleguud.sort((a, b) => tsag(a.bulag[0]) - tsag(b.bulag[0]));
    for (const { bulag } of buleguud) {
      const dun = Math.round(Number(bulag[0].totalAmount || 0));
      iluuToo += bulag.length - 1;
      iluuDun += dun * (bulag.length - 1);
      bulag.forEach((b, i) => {
        if (i > 0) khuchingui.add(String(b._id));
        mur1.push({
          Гэрээ: b.gereeniiDugaar || "-",
          Тоот: b.toot || "-",
          "#": `${i + 1}/${bulag.length}`,
          Огноо: tsag(b).toISOString().slice(0, 19).replace("T", " "),
          Дүн: mnt(b.totalAmount),
          ДДТД: b.receiptId || "-",
          Үйлдэл: i === 0 ? "ҮЛДЭЭХ" : "ХҮЧИНГҮЙ БОЛГОХ",
        });
      });
    }

    console.log(
      `\n--- [1] ЖИНХЭНЭ ДАВХАРДАЛ (ижил гэрээ+дүн, ${SEK}сек дотор): ${buleguud.length} бүлэг ---`
    );
    if (mur1.length) console.table(mur1);
    else console.log("олдсонгүй");

    // ---------- [2] БУРУУ ХОЛБООС: нэг nekhemjlekhiinId, өөр өөр цаг ----------
    const nMap = new Map();
    for (const b of amjilttai) {
      const k = String(b.nekhemjlekhiinId || "");
      if (!k) continue;
      if (!nMap.has(k)) nMap.set(k, []);
      nMap.get(k).push(b);
    }

    const buruuKholboos = [];
    for (const [nid, arr] of nMap) {
      // [1]-д хамрагдсан хуулбаруудыг хасаад үлдсэнийг шалгана
      const uldsen = arr.filter((b) => !khuchingui.has(String(b._id)));
      if (uldsen.length > 1) buruuKholboos.push([nid, uldsen]);
    }

    const nIds = buruuKholboos.map(([nid]) => nid);
    const niiMap = new Map();
    if (nIds.length) {
      const nn = await NekhemjlekhiinTuukh(kh)
        .find({ _id: { $in: nIds } })
        .select("niitTulbur gereeniiDugaar ognoo")
        .lean();
      for (const n of nn) niiMap.set(String(n._id), n);
    }

    console.log(
      `\n--- [2] БУРУУ ХОЛБООС (нэг нэхэмжлэхэд өөр өөр үеийн баримт): ${buruuKholboos.length} ---`
    );
    console.log("    ⚠ Эдгээрийг ХҮЧИНГҮЙ БОЛГОХГҮЙ — төлөлт нь бодит, зөвхөн холбоос буруу.");
    if (buruuKholboos.length) {
      const mur2 = [];
      for (const [nid, arr] of buruuKholboos) {
        const n = niiMap.get(nid);
        arr.sort((a, b) => tsag(a) - tsag(b));
        arr.forEach((b, i) =>
          mur2.push({
            Гэрээ: b.gereeniiDugaar || n?.gereeniiDugaar || "-",
            Тоот: b.toot || "-",
            "#": `${i + 1}/${arr.length}`,
            Огноо: tsag(b).toISOString().slice(0, 19).replace("T", " "),
            "Баримтын дүн": mnt(b.totalAmount),
            "Нэхэмжлэхийн дүн": n?.niitTulbur == null ? "?" : mnt(n.niitTulbur),
            "Зөрүү хоног": i === 0 ? "-" : Math.round((tsag(b) - tsag(arr[0])) / 86400000),
            ДДТД: b.receiptId || "-",
          })
        );
      }
      console.table(mur2);
    } else console.log("олдсонгүй");

    console.log(
      `\nДҮГНЭЛТ (${kh.baaziinNer})\n` +
      `  [1] Хүчингүй болгох баримт: ${iluuToo} ширхэг\n` +
      `      Илүү мэдүүлсэн дүн:      ${iluuDun.toLocaleString("en-US")}₮\n` +
      `  [2] Холбоос засах шаардлагатай нэхэмжлэх: ${buruuKholboos.length} (баримт хэвээр үлдэнэ)`
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
