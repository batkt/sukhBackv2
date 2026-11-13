/**
 * Төрийн банкны холболт + төлбөрийн шалгалт — ЗӨВХӨН УНШИНА.
 *
 * Төрийн банк горимтой бүх байгууллагын холбогдсон тоот бүрээр:
 *   • манай тал: барилга, тоот, гэрээ, синкийн утас
 *   • банкны тал: хэрэглэгчийн код, нэр, хаяг (жишээ «БЗД 26-р хороо 217-р байр, 153»)
 *   • биллүүд: нийт, төлсөн тоо/дүн, сүүлд төлсөн огноо, төлөгдөөгүй дүн
 * Анхааруулга:
 *   ⚠ БАРИЛГА — банкны хаягийн байрны дугаар манай барилгын нэрэн дэх дугаартай таарахгүй
 *   ⚠ ДАВХАР  — нэг банкны хэрэглэгчийн кодыг 2+ тоотод холбосон
 *   ⚠ ТООТ    — банкны хаалганы дугаар манай тоотоос огт өөр (дугаарлалт өөр тул зөвхөн лавлагаа)
 *
 * Ажиллуулах (сервер дээр):
 *   node scripts/bpayKholboltShalgakh.js                 # бүгд
 *   node scripts/bpayKholboltShalgakh.js --zovkhonAnkhaar # зөвхөн анхааруулгатай
 *   node scripts/bpayKholboltShalgakh.js --barilga=217    # барилгын нэрээр шүүх
 * CSV: bpay-kholbolt-<огноо>.csv (Excel-д нээгдэнэ)
 */
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "tokhirgoo", "tokhirgoo.env") });
const { MongoClient, ObjectId } = require("mongodb");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  }),
);
const ZOVKHON_ANKHAAR = !!args.zovkhonAnkhaar;
const BARILGA_SHUULT = typeof args.barilga === "string" ? args.barilga.toLowerCase() : null;

/** «… 217-р байр, 153» → { bair: "217", khaalga: "153" } */
function bankniiKhayag(khayag) {
  const s = String(khayag || "");
  const bair = (s.match(/(\d+)\s*-?\s*р?\s*байр/i) || [])[1] || "";
  const khaalga = (s.match(/,\s*0*(\d+)\s*(?:-\s*\d+)?\s*$/) || s.match(/(\d+)\s*$/) || [])[1] || "";
  return { bair, khaalga };
}
/** «Time tower 217» → ["217"] (нэрэн дэх бүх тоо) */
const nerniiToonuud = (ner) => String(ner || "").match(/\d+/g) || [];
const tooKhevshuulekh = (v) => String(v ?? "").trim().replace(/^0+(?=\d)/, "");
const ognoo = (d) => (d ? new Date(new Date(d).getTime() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "");
const mnt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI олдсонгүй");
    process.exit(1);
  }
  const client = await new MongoClient(process.env.MONGODB_URI, { readPreference: "secondaryPreferred" }).connect();
  const undsen = client.db();
  const neeltuud = [];

  const orgs = await undsen
    .collection("baiguullaga")
    .find({ "tokhirgoo.bpayAshiglakhEsekh": true }, { projection: { ner: 1, barilguud: 1 } })
    .toArray();
  const medeelelColl = (await undsen.listCollections({}, { nameOnly: true }).toArray()).find((c) => /^baaziinmedeel/i.test(c.name));
  const baazuud = medeelelColl ? await undsen.collection(medeelelColl.name).find({}).toArray() : [];

  const muruud = [];
  for (const org of orgs) {
    const orgId = String(org._id);
    const baaz = baazuud.find((b) => String(b.baiguullagiinId) === orgId);
    if (!baaz?.baaz) {
      console.warn(`⚠️  ${org.ner}: DB олдсонгүй`);
      continue;
    }
    // «cloud» гэж тэмдэглэсэн ч ихэнхдээ энэ серверт байдаг — эхлээд үндсэн холболтоор,
    // тэнд bpayHolbolt байхгүй бол бичлэгийн cloud хаягаар (нууц үгийг хэвлэхгүй).
    let d = client.db(baaz.baaz);
    if (baaz.cloudMongoDBEsekh && !(await d.listCollections({ name: "bpayHolbolt" }, { nameOnly: true }).hasNext())) {
      try {
        const url =
          (baaz.appName ? "mongodb+srv://" : "mongodb://") +
          encodeURIComponent(baaz.userName) +
          ":" +
          encodeURIComponent(baaz.password) +
          "@" +
          baaz.clusterUrl +
          "/" +
          baaz.baaz +
          (baaz.appName ? `?retryWrites=true&w=majority&appName=${baaz.appName}` : "?authSource=admin");
        const c = await new MongoClient(url, { readPreference: "secondaryPreferred", serverSelectionTimeoutMS: 15000 }).connect();
        neeltuud.push(c);
        d = c.db(baaz.baaz);
      } catch (e) {
        console.warn(`⚠️  ${org.ner}: cloud DB холболт амжилтгүй (${e.message})`);
        continue;
      }
    }
    const barilgaNer = new Map((org.barilguud || []).map((b) => [String(b._id), b.ner || ""]));
    const holboltuud = await d.collection("bpayHolbolt").find({ baiguullagiinId: orgId }).toArray();
    const billuud = await d
      .collection("bpayBill")
      .find({ baiguullagiinId: orgId }, { projection: { gereeniiId: 1, customerCode: 1, tuluv: 1, dun: 1, aldangitaiDun: 1, tulsunDun: 1, tulsunOgnoo: 1, sar: 1 } })
      .toArray();

    for (const h of holboltuud) {
      const barilga = barilgaNer.get(String(h.barilgiinId)) || "";
      if (BARILGA_SHUULT && !barilga.toLowerCase().includes(BARILGA_SHUULT)) continue;
      // Энэ хэрэглэгчийн биллүүд (гэрээгээр ЭСВЭЛ кодоор — салгагдсан ч тоологдоно)
      const b = billuud.filter(
        (x) => (h.customerCode && x.customerCode === h.customerCode) || String(x.gereeniiId) === String(h.gereeniiId),
      );
      const tulsun = b.filter((x) => x.tuluv === "Төлөгдсөн");
      const tulugduugui = b.filter((x) => x.tuluv === "Төлөгдөөгүй");
      const suuld = tulsun.map((x) => x.tulsunOgnoo).filter(Boolean).sort().pop();
      const bank = bankniiKhayag(h.customerAddress);
      muruud.push({
        baiguullaga: org.ner || "",
        barilga,
        toot: h.toot || "",
        geree: h.gereeniiDugaar || "",
        utas: h.syncUtas || "",
        salgasan: !!h.salgasan,
        customerCode: h.customerCode || "",
        customerName: h.customerName || "",
        bankKhayag: h.customerAddress || "",
        bankBair: bank.bair,
        bankKhaalga: bank.khaalga,
        billToo: b.length,
        tulsunToo: tulsun.length,
        tulsunDun: tulsun.reduce((s, x) => s + (x.tulsunDun || x.aldangitaiDun || x.dun || 0), 0),
        suuldTulsun: suuld || null,
        tulugduuguiDun: tulugduugui.reduce((s, x) => s + (x.aldangitaiDun || x.dun || 0), 0),
        suuldAldaa: h.suuldAldaa || "",
        ankhaar: [],
      });
    }
  }

  // Анхааруулга
  const kodoor = new Map();
  muruud.forEach((m) => m.customerCode && kodoor.set(m.customerCode, [...(kodoor.get(m.customerCode) || []), m]));
  for (const m of muruud) {
    if (m.bankBair && !nerniiToonuud(m.barilga).includes(m.bankBair)) m.ankhaar.push(`БАРИЛГА (банк ${m.bankBair}-р байр)`);
    const davkhar = (kodoor.get(m.customerCode) || []).filter((x) => x !== m);
    if (davkhar.length) m.ankhaar.push(`ДАВХАР (${davkhar.map((x) => `${x.barilga} ${x.toot}`).join(", ")})`);
    const t = tooKhevshuulekh(m.toot);
    const k = tooKhevshuulekh(m.bankKhaalga);
    // Дугаарлалт өөр байж болно (1513 ↔ 153): тоот банкны дугаараар эхлэх/дуусах, эсвэл ижил цифрүүдтэй бол хэвийн
    const oir = !k || t === k || t.endsWith(k) || k.endsWith(t) || (t.length === k.length + 1 && t.startsWith(k.slice(0, 2)) && t.endsWith(k.slice(-1)));
    if (!oir) m.ankhaar.push(`ТООТ (банк ${k})`);
    if (m.suuldAldaa) m.ankhaar.push(`СИНК: ${m.suuldAldaa}`);
  }

  const khevlekh = ZOVKHON_ANKHAAR ? muruud.filter((m) => m.ankhaar.length) : muruud;
  khevlekh.sort((a, b) => a.baiguullaga.localeCompare(b.baiguullaga) || a.barilga.localeCompare(b.barilga) || (parseInt(a.toot) || 0) - (parseInt(b.toot) || 0));

  console.log(`\n${muruud.length} холболт, ${muruud.filter((m) => m.ankhaar.length).length} анхааруулгатай\n`);
  console.log("Барилга · Тоот | Банкны хэрэглэгч (хаяг) | Төлсөн | Сүүлд | Төлөгдөөгүй | Анхааруулга");
  for (const m of khevlekh) {
    console.log(
      `${m.barilga} · ${m.toot} | ${m.customerName} ${m.customerCode} (${m.bankBair}-р байр, ${m.bankKhaalga}) | ` +
        `${m.tulsunToo}x ${mnt(m.tulsunDun)}₮ | ${ognoo(m.suuldTulsun) || "-"} | ${mnt(m.tulugduuguiDun)}₮ | ${m.ankhaar.join("; ") || "✓"}`,
    );
  }

  // CSV
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const tolgoi = ["Байгууллага", "Барилга", "Тоот", "Гэрээ", "Синк утас", "Салгасан", "Банкны код", "Банкны нэр", "Банкны хаяг", "Банк байр", "Банк хаалга", "Билл", "Төлсөн тоо", "Төлсөн дүн", "Сүүлд төлсөн", "Төлөгдөөгүй дүн", "Анхааруулга"];
  const csv = [tolgoi.map(q).join(",")]
    .concat(
      khevlekh.map((m) =>
        [m.baiguullaga, m.barilga, m.toot, m.geree, m.utas, m.salgasan ? "тийм" : "", m.customerCode, m.customerName, m.bankKhayag, m.bankBair, m.bankKhaalga, m.billToo, m.tulsunToo, Math.round(m.tulsunDun), ognoo(m.suuldTulsun), Math.round(m.tulugduuguiDun), m.ankhaar.join("; ")]
          .map(q)
          .join(","),
      ),
    )
    .join("\r\n");
  const file = `bpay-kholbolt-${new Date().toISOString().slice(0, 10)}.csv`;
  fs.writeFileSync(file, "﻿" + csv);
  console.log(`\n💾 ${path.resolve(file)}\nЮу ч өөрчлөөгүй.`);
  await Promise.all(neeltuud.map((c) => c.close().catch(() => {})));
  await client.close();
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
