const xl = JSON.parse(require("fs").readFileSync("xl_out.json","utf8"));
const f = n => (Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
// Системийн дэвтрээс: сар -> {tsahilgaan, sukh(тогтмол нийлбэр), tulult(~4495)}
const TOGTMOL = [6883.44,13043.48,5000,4046.76,1304.35,20869.56,8347.83];
const sukhSys = TOGTMOL.reduce((a,b)=>a+b,0);
const sys = {
  "2026.02.20":{tsah:65411.20, tulult:4495.42},
  "2026.03.20":{tsah:63004.80, tulult:4495.42},
  "2026.04.20":{tsah:71657.60, tulult:4495.42},
  "2026.05.20":{tsah:55913.60, tulult:4495.12},
  "2026.06.20":{tsah:55939.20, tulult:4495.72},
  "2026.07.20":{tsah:51612.80, tulult:4495.72},
  "2026.08.20":{tsah:52383.70, tulult:4495.72},
};
console.log("Тогтмол хураамжийн нийлбэр (систем):", f(sukhSys));
console.log("Excel-ийн СӨХ                      :", f(55000));
console.log("ЗӨРҮҮ                              :", f(sukhSys-55000));
console.log("");
console.log("Сар        | Цахилгаан Excel/Систем      | СӨХ Excel |  СӨХ Систем | Зөрүү    | Дэвтрийн 'төлөлт'");
console.log("-".repeat(104));
let zTsah=0;
for (const [m,s] of Object.entries(sys)) {
  const e = xl[m]; if (!e) continue;
  const d = e.tsah - s.tsah; zTsah += d;
  console.log(
    `${m} | ${f(e.tsah).padStart(11)} / ${f(s.tsah).padStart(11)} ${d===0?"OK":"DIFF"} | ${f(e.sukh).padStart(9)} | ${f(sukhSys).padStart(11)} | ${f(sukhSys-e.sukh).padStart(8)} | ${f(s.tulult).padStart(8)}`
  );
}
console.log("-".repeat(104));
console.log("Цахилгааны нийт зөрүү:", f(zTsah), zTsah===0?"-> ЯГ ТААРЧ БАЙНА":"-> ЗӨРҮҮТЭЙ");
