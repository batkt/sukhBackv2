const XLSX = require("xlsx");
const wb = XLSX.readFile("C:/Users/user/Downloads/Ashiglaltiin zardal-Tsahilgaan, SUKH 2026-08-20 Хянасан.xlsx");
const f = n => (Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const sheets = wb.SheetNames.filter(n => /^2026\.\d\d\.\d\d$/.test(n));
console.log("Sheet      | Цахилгаан   |    СӨХ    | НИЙТ ТӨЛБӨР");
console.log("-".repeat(52));
const out = {};
for (const name of sheets) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, defval:"" });
  const h = rows.findIndex(r => r.some(c => String(c).includes("Айлын тоот")));
  if (h < 0) { console.log(name, "(header not found)"); continue; }
  const hdr = rows[h].map(c => String(c).trim());
  const cToot = hdr.findIndex(c => c.includes("Айлын тоот"));
  const cTsah = hdr.findIndex(c => c.includes("НИЙТ Цахилгааны"));
  const cSukh = hdr.findIndex(c => c === "СӨХ");
  const cNiit = hdr.findIndex(c => c.includes("НИЙТ ТӨЛБӨР"));
  const r = rows.find((r,i) => i>h && String(r[cToot]).trim()==="25");
  if (!r) { console.log(name, "(Тоот 25 олдсонгүй)"); continue; }
  out[name] = { tsah:Number(r[cTsah])||0, sukh:Number(r[cSukh])||0, niit:Number(r[cNiit])||0 };
  console.log(`${name} | ${f(r[cTsah]).padStart(11)} | ${f(r[cSukh]).padStart(9)} | ${f(r[cNiit]).padStart(12)}`);
}
require("fs").writeFileSync("xl_out.json", JSON.stringify(out));
