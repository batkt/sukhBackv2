/**
 * timetower баазын «Тог цахилгаан» зардлын тохиргоо, дүн, тариф болон
 * 216-р барилгад 10-р сард хэдэн төгрөгөөр орсныг, бусад барилгад гэрээн дээр
 * ямар дүнтэй байгааг шалгах скрипт.
 */
const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const DEFAULT_URI =
  "mongodb://admin:Br1stelback1@127.0.0.1:27017/{db}?authSource=admin";

async function main() {
  const conn = await mongoose
    .createConnection(DEFAULT_URI.replace("{db}", "timetower"))
    .asPromise();

  try {
    console.log("=".repeat(80));
    console.log("🔎 «ТОГ ЦАХИЛГААН» ЗАРДЛЫН НАРИЙВЧИЛСАН ШАЛГАЛТ");
    console.log("=".repeat(80));

    // 1. ashiglaltiinZardluud дахь «Тог цахилгаан»
    const ashZardluud = await conn
      .collection("ashiglaltiinZardluud")
      .find({ ner: new RegExp("цахилгаан|тог", "i") })
      .toArray();

    console.log("\n1. ashiglaltiinZardluud цуглуулга дахь бүртгэлүүд:");
    for (const z of ashZardluud) {
      console.log(
        `   • ID: ${z._id} | ner: «${z.ner}» | turul: ${z.turul} | tariff: ${z.tariff} | dun: ${z.dun} | togtmolUtga: ${z.togtmolUtga} | zaalt: ${z.zaalt} | barilga: ${z.barilgiinId || "Бүгд"}`
      );
    }

    // 2. 2026-10 сард Time tower 216 барилгын нэхэмжлэхэд «Цахилгаан» ямар дүнгээр орсон бэ?
    const inv216_oct = await conn
      .collection("guilgeeAvlaguud")
      .find({
        zardliinNer: new RegExp("цахилгаан|тог", "i"),
        ognoo: { $gte: new Date("2026-10-01"), $lt: new Date("2026-11-01") },
      })
      .limit(5)
      .toArray();

    console.log(`\n2. 2026-10 сарын guilgeeAvlaguud дээрх «Цахилгаан» мөрүүдийн жишээ (дүн, төрөл):`);
    for (const g of inv216_oct) {
      console.log(
        `   • Тоот: ${g.toot} | Дүн: ${g.dun}₮ | zardliinNer: «${g.zardliinNer}» | turul: ${g.turul} | tailbar: «${g.tailbar}» | barilga: ${g.barilgiinId}`
      );
    }

    // 3. 2026-09 сард 217, 218, 219 барилгын нэхэмжлэхэд «Цахилгаан» ямар дүнгээр орсон байсан бэ?
    const inv_sep = await conn
      .collection("guilgeeAvlaguud")
      .find({
        zardliinNer: new RegExp("цахилгаан|тог", "i"),
        ognoo: { $gte: new Date("2026-09-01"), $lt: new Date("2026-10-01") },
      })
      .limit(5)
      .toArray();

    console.log(`\n3. 2026-09 сарын guilgeeAvlaguud дээрх «Цахилгаан» мөрүүдийн жишээ (дүн, төрөл):`);
    for (const g of inv_sep) {
      console.log(
        `   • Тоот: ${g.toot} | Дүн: ${g.dun}₮ | zardliinNer: «${g.zardliinNer}» | turul: ${g.turul} | tailbar: «${g.tailbar}» | barilga: ${g.barilgiinId}`
      );
    }

    // 4. Гэрээнүүд дээр «Тог цахилгаан» зардал ямар дүн, тохиргоотой байна вэ?
    const gereenuud = await conn
      .collection("geree")
      .find({ tuluv: "Идэвхтэй" })
      .project({ toot: 1, barilgiinId: 1, zardluud: 1 })
      .limit(10)
      .toArray();

    console.log(`\n4. Идэвхтэй гэрээнүүд дээрх «Тог цахилгаан» тохиргооны дээж:`);
    for (const g of gereenuud) {
      const z = (g.zardluud || []).find((x) =>
        /цахилгаан|тог/i.test(x.ner || "")
      );
      if (z) {
        console.log(
          `   • Тоот: ${g.toot} (Барилга: ${g.barilgiinId}) -> ner: «${z.ner}» | tariff: ${z.tariff} | dun: ${z.dun} | togtmolUtga: ${z.togtmolUtga} | zaalt: ${z.zaalt} | turul: ${z.turul} | bodokhArga: ${z.bodokhArga}`
        );
      }
    }
  } finally {
    await conn.close();
  }
}

main().catch(console.error);
