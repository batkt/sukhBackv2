/**
 * Нэг удаагийн засвар: бүх гэрээний нэхэмжлэхийн төлөв/үлдэгдлийг дахин бодно.
 *
 * guilgeeService.syncInvoicesStatus хөнгөлөлтийг одоо тухайн сарын
 * нэхэмжлэхэд нь оноодог болсон. Өмнө нь хөнгөлөлт хамгийн эртний авлагад
 * (жишээ нь 8-р сарын 45,000 → 31,500) зарцуулагдаж байсан тул шинэ кодыг
 * deploy хийсний дараа нэг удаа ажиллуулна.
 *
 *   node scripts/khungulultNekhemjlekhSync.js            # бүх байгууллага
 *   node scripts/khungulultNekhemjlekhSync.js <baiguullagiinId>
 */
// Сервертэй (index.js) ижил тохиргоо — хаанаас ажиллуулсан ч зөв олно
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../tokhirgoo/local.env") });
require("dotenv").config({ path: path.join(__dirname, "../tokhirgoo/tokhirgoo.env") });
const { db } = require("zevbackv2");

async function main() {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  db.kholboltUusgey(null, MONGODB_URI);
  await new Promise((r) => setTimeout(r, 2000));

  const zorilt = process.argv[2];
  const { syncInvoicesStatus } = require("../services/guilgeeService");
  const Guilgee = require("../models/guilgeeAvlaguud");

  for (const kh of db.kholboltuud) {
    if (zorilt && String(kh.baiguullagiinId) !== zorilt) continue;
    // Зөвхөн хөнгөлөлттэй гэрээнүүд — бусдынх нь өөрчлөгдөхгүй
    const gereenuud = await Guilgee(kh).distinct("gereeniiId", {
      dun: { $lt: 0 },
      $or: [{ source: "khungulult" }, { turul: "Хөнгөлөлт" }, { zardliinTurul: "Хөнгөлөлт" }],
    });
    console.log(`${kh.baiguullagiinId}: ${gereenuud.length} гэрээ`);
    for (const gid of gereenuud.filter(Boolean)) {
      await syncInvoicesStatus(kh, String(gid));
    }
  }
  console.log("Дууслаа");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
