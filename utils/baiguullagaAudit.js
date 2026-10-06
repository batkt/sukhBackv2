/**
 * Байгууллагын (тохиргооны) засварыг «Зассан түүх»-д ТАЛБАР БҮРЭЭР бичнэ.
 *
 * Глобал plugin нь `barilguud`, `tokhirgoo`-г бүхэлд нь (хэдэн зуун KB JSON)
 * нэг өөрчлөлт болгон бичдэг тул тохиргооны жижиг засвар (гаражийн төлбөр
 * г.м.) түүхэд олдохгүй / ойлгомжгүй байв. Энд хуучин, шинэ баримтыг
 * «barilguud.0.tokhirgoo.garsiinTolborUtga» гэх мэт зам болгон задалж,
 * зөвхөн өөрчлөгдсөн замуудыг монгол нэртэй нь бичнэ.
 */
const { logEdit } = require("../services/auditService");

const ALGASAKH = new Set(["_id", "__v", "createdAt", "updatedAt"]);

const NER = {
  garsiinTolborEnabled: "Гаражийн төлбөр идэвхтэй",
  garsiinTolborArga: "Гаражийн төлбөрийн арга",
  garsiinTolborUtga: "Гаражийн сарын төлбөр",
  aguulakhTolborEnabled: "Агуулахын төлбөр идэвхтэй",
  aguulakhTolborArga: "Агуулахын төлбөрийн арга",
  aguulakhTolborUtga: "Агуулахын сарын төлбөр",
  aldangiinKhuvi: "Алдангийн хувь",
  aldangiChuluulukhKhonog: "Алданги чөлөөлөх хоног",
  aldangiBodojEkhlekhOgnoo: "Алданги бодож эхлэх огноо",
  eBarimtAshiglakhEsekh: "И-баримт ашиглах",
  eBarimtShine: "Шинэ и-баримт",
  eBarimtAutomataarIlgeekh: "И-баримт автоматаар илгээх",
  eBarimtBugdShivikh: "И-баримт бүгдийг шивэх",
  eBarimtMessageIlgeekhEsekh: "И-баримт мессеж илгээх",
  merchantTin: "Merchant TIN",
  nuatTulukhEsekh: "НӨАТ төлөх",
  zogsoolMsgIlgeekh: "Зогсоолын мессеж илгээх",
  sarBurAutoKhungulultOruulakhEsekh: "Сар бүр автомат хөнгөлөлт",
  khungulukhSarBuriinShalguurDun: "Хөнгөлөлтийн шалгуур дүн",
  khungulukhSarBuriinTurul: "Хөнгөлөлтийн төрөл",
  khungulukhSarBuriinUtga: "Хөнгөлөлтийн утга",
  khungulukhSarBuriinTulburEkhlekhUdur: "Хөнгөлөлт эхлэх өдөр",
  khungulukhSarBuriinTulburDuusakhUdur: "Хөнгөлөлт дуусах өдөр",
  zochinUrikhUneguiMinut: "Зочны үнэгүй минут",
  zochinUrikhEsekh: "Зочин урих",
  zochinTurul: "Зочны төрөл",
  zochinErkhiinToo: "Зочны эрхийн тоо",
  zochinTusBurUneguiMinut: "Зочин тус бүрийн үнэгүй минут",
  zochinNiitUneguiMinut: "Зочны нийт үнэгүй минут",
  zochinNekhemjlekhEsekh: "Зочинд нэхэмжлэх",
  zochinTailbar: "Зочны тайлбар",
  davtamjiinTurul: "Давтамжийн төрөл",
  davtamjUtga: "Давтамж",
  orshinSuugchMashiniiLimit: "Оршин суугчийн машины хязгаар",
  khariltsagchMashiniiLimit: "Харилцагчийн машины хязгаар",
  bodokhArgaEnabled: "Бодох арга идэвхтэй",
  bodokhArga: "Бодох арга",
  bodokhKhonog: "Бодох хоног",
  zaaltaarTsakhilgaanBodokhEsekh: "Заалтаар цахилгаан бодох",
  orshinSuugchKhaalgaNeehEsekh: "Оршин суугч хаалга нээх",
  gerBuliinGishuunEsekh: "Гэр бүлийн гишүүн",
  ashiglaltiinZardluud: "Ашиглалтын зардлууд",
  liftShalgaya: "Лифт шалгалт",
  choloolugdokhDavkhar: "Чөлөөлөгдөх давхар",
  davkhariinToonuud: "Давхрын тоотууд",
  davkhariinZogsoolnuud: "Давхрын зогсоолууд",
  davkhariinAguulakhnuud: "Давхрын агуулахууд",
  dans: "Данс",
  ibanDugaar: "IBAN дугаар",
  dansniiNer: "Дансны нэр",
  bank: "Банк",
  jilBurTalbaiTulburNemekhEsekh: "Жил бүр талбайн төлбөр нэмэх",
  jilBurTulbur: "Жил бүрийн төлбөр",
  gereeDuusakhTalbaiTulburNemekhEsekh: "Гэрээ дуусахад талбайн төлбөр нэмэх",
  gereeDuusakhTulbur: "Гэрээ дуусах төлбөр",
};

const objectIdEsekh = (v) => v && typeof v === "object" && v._bsontype === "ObjectId";

function khavtgai(v, zam, out, gun) {
  if (objectIdEsekh(v)) {
    out[zam] = String(v);
  } else if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && gun < 6) {
    for (const [k, val] of Object.entries(v)) {
      if (ALGASAKH.has(k)) continue;
      khavtgai(val, zam ? `${zam}.${k}` : k, out, gun + 1);
    }
  } else {
    out[zam] = v;
  }
  return out;
}

const kharitsuulakh = (v) =>
  JSON.stringify(v === undefined || v === null || v === "" ? null : v instanceof Date ? v.toISOString() : v);

/**
 * @param khuuchin  засварын өмнөх баримт (plain object)
 * @param shine     хадгалсны дараах баримт (plain object)
 */
async function baiguullagaAuditBichye(req, db, id, khuuchin, shine) {
  const umnukh = {};
  const daraa = {};
  const zamBarilga = {};

  const { barilguud: kB = [], ...kBusad } = khuuchin || {};
  const { barilguud: sB = [], ...sBusad } = shine || {};
  khavtgai(kBusad, "", umnukh, 0);
  khavtgai(sBusad, "", daraa, 0);

  // Барилгыг _id-аар тааруулна (дараалал өөрчлөгдсөн ч зөв харьцуулна)
  const kMap = new Map((kB || []).map((b) => [String(b?._id), b]));
  (sB || []).forEach((b, i) => {
    const prefix = `barilguud.${i}`;
    khavtgai(kMap.get(String(b?._id)) || {}, prefix, umnukh, 1);
    khavtgai(b, prefix, daraa, 1);
    zamBarilga[prefix] = b?.ner || "";
    kMap.delete(String(b?._id));
  });

  const zamuud = new Set([...Object.keys(umnukh), ...Object.keys(daraa)]);
  const oldFlat = {};
  const newFlat = {};
  const talbarNeruud = {};
  let ganzBarilga = null;
  for (const zam of zamuud) {
    if (kharitsuulakh(umnukh[zam]) === kharitsuulakh(daraa[zam])) continue;
    oldFlat[zam] = umnukh[zam];
    newFlat[zam] = daraa[zam];
    const kheseg = zam.split(".");
    const suul = kheseg.filter((p) => !/^\d+$/.test(p)).pop();
    const bPrefix = kheseg[0] === "barilguud" ? `barilguud.${kheseg[1]}` : null;
    if (NER[suul]) {
      const bNer = bPrefix ? zamBarilga[bPrefix] : "";
      talbarNeruud[zam] = bNer && (sB || []).length > 1 ? `${bNer} · ${NER[suul]}` : NER[suul];
    }
    if (bPrefix) {
      const bId = String((sB || [])[Number(kheseg[1])]?._id || "");
      ganzBarilga = ganzBarilga === null || ganzBarilga === bId ? bId : "";
    }
  }
  if (Object.keys(newFlat).length === 0) return;

  await logEdit(req, db, "baiguullaga", String(id), oldFlat, newFlat, {
    barilgiinId: ganzBarilga || null,
    talbarNeruud,
    classNer: shine?.ner || khuuchin?.ner || "",
  });
}

module.exports = { baiguullagaAuditBichye };
