/**
 * Сонгосон нэхэмжлэхүүдийн задаргаа — апп-ын төлбөрийн цонхонд.
 *
 * ЯАГААД: өмнө нь апп «Сонгосон нэхэмжлэх 140,000» -ийн доор гэрээний НИЙТ
 * дэвтрийн ангиллын үлдэгдлийг (Орон сууц 135,000 / Гараж 50,000) харуулдаг
 * байв. Хоёр өөр хамрах хүрээтэй тул тоонууд хоорондоо таардаггүй, хэрэглэгч
 * төөрөгддөг байв. Одоо ангилал бүрийн дүнг ЗӨВХӨН сонгосон нэхэмжлэхүүдийн
 * үлдэгдлээс бодно — нийлбэр нь сонгосон дүнтэй яг тэнцүү.
 *
 * Нэхэмжлэхийн үлдэгдэл (uldegdel) нь guilgeeService.syncInvoicesStatus-ийн
 * FIFO-оор бодогдсон утга. Үлдэгдлийг нэхэмжлэхийн мөрүүдэд (дэвтрийн
 * nekhemjlekhId-тай холбоотой, dun > 0) ангиллын жингээр хуваарилна.
 */

const ANGILLUUD = ["Орон сууц", "Зогсоол", "Агуулах"];

function angilalTaniya(ner) {
  const n = String(ner || "").toLowerCase();
  if (n.includes("гараж") || n.includes("гараш") || n.includes("зогсоол")) return "Зогсоол";
  if (n.includes("агуулах")) return "Агуулах";
  return "Орон сууц";
}

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** Үлдэгдлийг жингээр хувааж, бөөрөнхийлөлтийн зөрүүг хамгийн томд нь шингээнэ */
function khuvaarilya(niit, jin) {
  const jinNiit = Object.values(jin).reduce((a, b) => a + b, 0);
  const ur = {};
  ANGILLUUD.forEach((k) => (ur[k] = 0));
  if (!(niit > 0)) return ur;
  if (!(jinNiit > 0)) {
    ur["Орон сууц"] = r2(niit);
    return ur;
  }
  let niilber = 0;
  ANGILLUUD.forEach((k) => {
    ur[k] = r2((niit * (jin[k] || 0)) / jinNiit);
    niilber += ur[k];
  });
  const zuruu = r2(niit - niilber);
  if (zuruu !== 0) {
    const tom = ANGILLUUD.reduce((a, k) => (ur[k] > ur[a] ? k : a), ANGILLUUD[0]);
    ur[tom] = r2(ur[tom] + zuruu);
  }
  return ur;
}

async function nekhemjlekhZadargaaAvya(kholbolt, { gereeniiId, nekhemjlekhIdnuud }) {
  const Nekhemjlekh = require("../models/nekhemjlekhiinTuukh")(kholbolt);
  const Guilgee = require("../models/guilgeeAvlaguud")(kholbolt);

  const idnuud = (nekhemjlekhIdnuud || []).map(String).filter(Boolean);
  if (!gereeniiId || idnuud.length === 0) {
    return { nekhemjlekhuud: [], angilal: khuvaarilya(0, {}), niit: 0 };
  }

  const [nekhemjlekhuud, murnuud] = await Promise.all([
    Nekhemjlekh.find({ _id: { $in: idnuud }, gereeniiId: String(gereeniiId) })
      .select({ ognoo: 1, uldegdel: 1, niitTulbur: 1, tuluv: 1 })
      .sort({ ognoo: 1 })
      .lean(),
    Guilgee.find({
      gereeniiId: String(gereeniiId),
      nekhemjlekhId: { $in: idnuud },
      dun: { $gt: 0 },
    })
      .select({ nekhemjlekhId: 1, dun: 1, zardliinNer: 1, tailbar: 1, turul: 1 })
      .lean(),
  ]);

  const niitAngilal = {};
  ANGILLUUD.forEach((k) => (niitAngilal[k] = 0));
  let niit = 0;

  const ur = nekhemjlekhuud.map((inv) => {
    const id = String(inv._id);
    // Ижил нэртэй мөрүүдийг нэгтгэнэ
    const nereer = new Map();
    murnuud
      .filter((m) => String(m.nekhemjlekhId) === id)
      .forEach((m) => {
        const ner = String(m.zardliinNer || m.tailbar || m.turul || "Төлбөр").trim();
        nereer.set(ner, r2((nereer.get(ner) || 0) + Number(m.dun || 0)));
      });
    const zardluud = Array.from(nereer, ([ner, dun]) => ({ ner, dun, angilal: angilalTaniya(ner) }));

    const jin = {};
    zardluud.forEach((z) => (jin[z.angilal] = (jin[z.angilal] || 0) + z.dun));

    const tuluvsun = String(inv.tuluv || "") === "Төлсөн";
    const uldegdel = tuluvsun ? 0 : r2(Math.max(0, Number(inv.uldegdel ?? inv.niitTulbur ?? 0)));
    const angilal = khuvaarilya(uldegdel, jin);
    ANGILLUUD.forEach((k) => (niitAngilal[k] = r2(niitAngilal[k] + angilal[k])));
    niit = r2(niit + uldegdel);

    return {
      _id: id,
      ognoo: inv.ognoo,
      niitTulbur: r2(zardluud.reduce((s, z) => s + z.dun, 0) || inv.niitTulbur),
      uldegdel,
      zardluud,
      angilal,
    };
  });

  return { nekhemjlekhuud: ur, angilal: niitAngilal, niit };
}

module.exports = { nekhemjlekhZadargaaAvya };
