/**
 * `zochinZogsooliinTuukh` дээрх ХУУЧИН unique индексийг устгана.
 *
 * ЯАГААД ЗААВАЛ ГАРААР ХИЙХ ВЭ:
 *
 * Схем дээрх `index()` тодорхойлолтыг өөрчлөхөд Mongoose нь ШИНЭ индексийг
 * нэмдэг ч ХУУЧНЫГ нь устгадаггүй. Тиймээс `{baiguullagiinId, uilchluulegchId}`
 * дээрх unique индекс баазад хэвээр үлдэнэ — зочлолт тутамд шинэ мөр үүсгэх
 * гэхэд `E11000 duplicate key` алдаа өгч, webhook унана.
 *
 * Энэ скрипт тэр индексийг бүх холболтоос олж устгана. Шинэ (unique БИШ)
 * индекс нь сервер дахин асахад Mongoose өөрөө үүсгэнэ.
 *
 * ХЭРЭГЛЭЭ (анхдагчаар ЗӨВХӨН ТУРШИНА):
 *
 *   node scripts/zochinTuukhIndexZasvar.js
 *   node scripts/zochinTuukhIndexZasvar.js --apply
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

const APPLY = process.argv.includes("--apply");
const KHUUCHIN = "baiguullagiinId_1_uilchluulegchId_1";

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(APPLY ? "  БОДИТООР УСТГАНА (--apply)" : "  ЗӨВХӨН ТУРШИЛТ — юу ч өөрчлөхгүй");
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  устгах индекс:", KHUUCHIN, "(unique)");
  console.log("");

  const kholboltuud = [...(db.kholboltuud || [])];
  if (db.erunkhiiKholbolt && !kholboltuud.includes(db.erunkhiiKholbolt))
    kholboltuud.push(db.erunkhiiKholbolt);

  let oldson = 0;
  let ustgasan = 0;

  for (const k of kholboltuud) {
    const conn = k?.kholbolt;
    if (!conn) continue;
    const baaz = conn.name || k.baaziinNer || "(нэргүй)";

    let indeksuud;
    try {
      indeksuud = await conn.collection("zochinZogsooliinTuukh").indexes();
    } catch (err) {
      // Коллекци огт байхгүй бол алгасна
      continue;
    }

    const baigaa = indeksuud.find((i) => i.name === KHUUCHIN);
    if (!baigaa) {
      console.log(`   ✓ ${baaz.padEnd(24)} хуучин индекс алга`);
      continue;
    }

    oldson++;
    console.log(
      `   ! ${baaz.padEnd(24)} ОЛДЛОО  unique=${!!baigaa.unique}  түлхүүр=${JSON.stringify(baigaa.key)}`,
    );

    if (!APPLY) continue;

    try {
      await conn.collection("zochinZogsooliinTuukh").dropIndex(KHUUCHIN);
      ustgasan++;
      console.log(`     → устгалаа`);
    } catch (err) {
      console.error(`     ✕ устгаж чадсангүй: ${err.message}`);
    }
  }

  console.log("");
  console.log(`Хуучин индекстэй бааз: ${oldson}`);
  if (APPLY) {
    console.log(`Устгасан: ${ustgasan}`);
    console.log("\nСерверээ дахин асаана уу — Mongoose шинэ индексийг үүсгэнэ.");
  } else {
    console.log("\nГүйцэтгэхдээ `--apply` нэмнэ үү.");
  }
}

(async () => {
  const MONGODB_URI =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  db.kholboltUusgey(require("express")(), MONGODB_URI);
  // Бүх түрээслэгчийн холболт бэлэн болтол хүлээнэ
  for (let i = 0; i < 60; i++) {
    if ((db.kholboltuud || []).length > 1) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 2000));
  try {
    await main();
    process.exit(0);
  } catch (err) {
    console.error("\n❌ АЛДАА:", err.message, "\n", err.stack);
    process.exit(1);
  }
})();
