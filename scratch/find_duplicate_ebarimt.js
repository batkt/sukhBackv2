// Давхардсан e-barimt-уудыг олж харуулна. Юу ч бичихгүй, устгахгүй — зөвхөн уншина.
//
// Нэг нэхэмжлэх (nekhemjlekhiinId) дээр 1-ээс олон амжилттай баримт байвал давхардал.
// Мөн ижил гэрээ + ижил дүн + ойролцоо хугацаанд гарсан баримтуудыг илрүүлнэ.
//
//   node scratch/find_duplicate_ebarimt.js --db=nairamdalSukh
require("dotenv").config({ path: __dirname + "/../tokhirgoo/tokhirgoo.env" });
const { db } = require("zevbackv2");

const arg = (n) =>
  (process.argv.find((a) => a.startsWith(`--${n}=`)) || "").split("=")[1];
const dbArg = arg("db");
const orgArg = arg("org");
const SEK = Number(arg("seconds") || 120); // хугацааны цонх

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

    // --- 1) Нэг нэхэмжлэх дээр олон баримт
    const nMap = new Map();
    for (const b of amjilttai) {
      const k = String(b.nekhemjlekhiinId || "");
      if (!k) continue;
      if (!nMap.has(k)) nMap.set(k, []);
      nMap.get(k).push(b);
    }
    const davkhar = [...nMap.entries()].filter(([, v]) => v.length > 1);

    // --- 2) Ижил гэрээ + ижил дүн + ойрхон хугацаа (нэхэмжлэхгүй тохиолдолд)
    const bagts = new Map();
    for (const b of amjilttai) {
      const k = `${b.gereeniiDugaar || "-"}|${Math.round(Number(b.totalAmount || 0))}`;
      if (!bagts.has(k)) bagts.set(k, []);
      bagts.get(k).push(b);
    }
    const oirkhon = [];
    for (const [k, arr] of bagts) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));
      let bulag = [arr[0]];
      for (let i = 1; i < arr.length; i++) {
        const zuruu =
          (new Date(arr[i].date || arr[i].createdAt) -
            new Date(bulag[bulag.length - 1].date || bulag[bulag.length - 1].createdAt)) / 1000;
        if (zuruu <= SEK) bulag.push(arr[i]);
        else {
          if (bulag.length > 1) oirkhon.push([k, bulag]);
          bulag = [arr[i]];
        }
      }
      if (bulag.length > 1) oirkhon.push([k, bulag]);
    }

    // Нэхэмжлэхийн жинхэнэ дүнтэй тулгах
    const nIds = [...new Set(davkhar.map(([k]) => k))];
    const niiMap = new Map();
    if (nIds.length) {
      const nn = await NekhemjlekhiinTuukh(kh)
        .find({ _id: { $in: nIds } })
        .select("niitTulbur gereeniiDugaar")
        .lean();
      for (const n of nn) niiMap.set(String(n._id), n);
    }

    console.log(`\n================ ${kh.baaziinNer} ================`);
    console.log(`Нийт амжилттай баримт: ${amjilttai.length}`);

    let iluuDun = 0, iluuToo = 0;

    if (davkhar.length) {
      console.log(`\n--- A) Нэг нэхэмжлэх дээр олон баримт: ${davkhar.length} нэхэмжлэх ---`);
      const mur = [];
      for (const [nid, arr] of davkhar) {
        const n = niiMap.get(nid);
        const jinkhene = n?.niitTulbur == null ? null : Math.round(Number(n.niitTulbur));
        const niitBarimt = arr.reduce((s, b) => s + Math.round(Number(b.totalAmount || 0)), 0);
        if (jinkhene != null) iluuDun += niitBarimt - jinkhene;
        iluuToo += arr.length - 1;
        arr.forEach((b, i) =>
          mur.push({
            Гэрээ: b.gereeniiDugaar || n?.gereeniiDugaar || "-",
            Тоот: b.toot || "-",
            "#": `${i + 1}/${arr.length}`,
            Огноо: new Date(b.date || b.createdAt).toISOString().slice(0, 19).replace("T", " "),
            "Баримтын дүн": Math.round(Number(b.totalAmount || 0)).toLocaleString("en-US"),
            "Нэхэмжлэхийн дүн": jinkhene == null ? "?" : jinkhene.toLocaleString("en-US"),
            ДДТД: b.receiptId || "-",
            Үлдээх: i === 0 ? "ҮЛДЭЭХ" : "ХҮЧИНГҮЙ БОЛГОХ",
          })
        );
      }
      console.table(mur);
    } else console.log("\n--- A) Нэг нэхэмжлэх дээр олон баримт: олдсонгүй ---");

    const zovkhonB = oirkhon.filter(([, arr]) => {
      const nid = String(arr[0].nekhemjlekhiinId || "");
      return !nid || !nMap.get(nid) || nMap.get(nid).length === 1;
    });
    if (zovkhonB.length) {
      console.log(`\n--- B) Ижил гэрээ+дүн, ${SEK}сек дотор давхардсан: ${zovkhonB.length} бүлэг ---`);
      const mur2 = [];
      for (const [k, arr] of zovkhonB)
        arr.forEach((b, i) =>
          mur2.push({
            "Гэрээ|Дүн": k,
            Тоот: b.toot || "-",
            "#": `${i + 1}/${arr.length}`,
            Огноо: new Date(b.date || b.createdAt).toISOString().slice(0, 19).replace("T", " "),
            ДДТД: b.receiptId || "-",
          })
        );
      console.table(mur2);
    } else console.log(`\n--- B) Ижил гэрээ+дүн давхардал: олдсонгүй ---`);

    console.log(
      `\nДҮГНЭЛТ: илүү гарсан баримт ~${iluuToo} ширхэг` +
      (iluuDun ? `, илүү мэдүүлсэн дүн ~${iluuDun.toLocaleString("en-US")}₮` : "")
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Алдаа:", e);
  process.exit(1);
});
