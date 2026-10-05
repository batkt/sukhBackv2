const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const ashiglaltiinZardluudSchema = new Schema(
  {
    baiguullagiinId: String,
    barilgiinId: String,
    ner: String,
    turul: String,
    bodokhArga: String, //togtmol tomyotoi baidag arguud
    tseverUsDun: Number, // xaluun xuiten ustei ued xatuu bodno
    bokhirUsDun: Number, // xaluun xuiten ustei ued xatuu bodno
    usKhalaasniiDun: Number, // xaluun us ued xatuu bodno
    tsakhilgaanUrjver: Number, //tsakhilgaanii coefficent
    tsakhilgaanChadal: Number,
    tsakhilgaanDemjikh: Number,
    tailbar: String,
    tariff: Number,
    tariffUsgeer: String,
    suuriKhuraamj: Number,
    nuatNemekhEsekh: Boolean,
    togtmolUtga: Number,
    choloolugdsonDavkhar: Boolean,
    zardliinTurul: String,
    dun: Number,
    ognoonuud: [Date],
    nuatBodokhEsekh: Boolean,
    zaalt: Boolean, // Electricity (цахилгаан) flag
    zaaltTariff: Number, // кВт tariff for electricity (legacy - use zaaltTariffTiers if available)
    zaaltDefaultDun: Number, // Default amount for electricity calculation
    zaaltTariffTiers: [
      {
        threshold: Number, // Usage threshold (кВт) - e.g., 175, 256
        tariff: Number, // Tariff rate for this tier (Төг/кВт.цаг) - e.g., 175, 256, 285
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Тааруулах дүрэм нь устгах/синк хийх замуудтай ЯГ ИЖИЛ байх ёстой — эс
// бөгөөс нэг зам хасдаг мөрийг нөгөө нь үлдээж орхино. Тиймээс ганц
// тодорхойлолтыг хуваалцана.
const {
  zardalAdilUu: isSameZardal,
  gereeniiShuult,
  gereeniiZardluudBichye,
} = require("../utils/gereeniiZardalTseverlegee");

// Pre-deletion hook: Store document before query execution so we never lose it in post hook
//
// `deleteMany` нь ОЛОН баримт устгадаг атлаа энд `findOne` л дуудаж байсан тул
// эхнийхээс бусад зардал гэрээнээс хасагдалгүй үлддэг байв. Бүгдийг нь хадгална.
ashiglaltiinZardluudSchema.pre(
  ["findOneAndDelete", "deleteOne", "findOneAndRemove", "deleteMany"],
  async function () {
    try {
      this._docsToDelete = await this.model.find(this.getQuery()).lean();
      this._docToDelete = this._docsToDelete[0] || null;
    } catch (_) {}
  }
);

ashiglaltiinZardluudSchema.post("save", async function (doc) {
  await handleZardluudUpdate(doc);
});

ashiglaltiinZardluudSchema.post("findOneAndUpdate", async function (result) {
  if (result) {
    await handleZardluudUpdate(result);
  }
});

ashiglaltiinZardluudSchema.post("updateOne", async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc) {
    await handleZardluudUpdate(doc);
  }
});

ashiglaltiinZardluudSchema.post(
  ["findOneAndDelete", "deleteOne", "findOneAndRemove", "deleteMany"],
  async function (resDoc) {
    try {
      // `deleteMany`-д олон баримт устсан байж болно. `resDoc` нь устгалын
      // үр дүн (тоо) байж болох тул зөвхөн баримт мөн үед нь ашиглана.
      const docuud =
        this._docsToDelete?.length > 0
          ? this._docsToDelete
          : [resDoc?.baiguullagiinId ? resDoc : this._docToDelete].filter(Boolean);

      for (const doc of docuud) {
        await handleZardluudDelete(doc);
      }
    } catch (err) {
      console.error("Error in post-delete hook for ashiglaltiinZardluud:", err);
    }
  }
);

async function handleZardluudUpdate(doc) {
  try {
    if (!doc || !doc.baiguullagiinId) {
      return;
    }

    const { db } = require("zevbackv2");
    const Geree = require("./geree");
    const { gereeniiTootTurul, zardluudShuuye } = require("../utils/zardalAngilal");

    const kholbolt = db.kholboltuud.find(
      (a) => String(a.baiguullagiinId) === String(doc.baiguullagiinId)
    );

    if (!kholbolt) return;

    // Build flexible geree query for organization & building
    const gereeQuery = gereeniiShuult(doc.baiguullagiinId, doc.barilgiinId);

    // Бичих холболтоор уншина. Өмнө нь `Geree(kholbolt, true)` буюу уншилтын
    // холболтоор уншаад буцааж хадгалдаг байсан тул хуучирсан хуулбар дээр
    // ажиллаж, зэрэг хийгдсэн өөрчлөлтийг дарж бичих эрсдэлтэй байв.
    const GereeModel = Geree(kholbolt);
    const gereenuud = await GereeModel.find(gereeQuery).lean();

    for (const geree of gereenuud) {
      // Нэг гэрээ унасан ч бусдыг үргэлжлүүлнэ.
      try {
        // Remove any pre-existing entry with matching name/turul
        let zardluud = (geree.zardluud || []).filter((z) => !isSameZardal(z, doc));

        // Зогсоол/агуулахын гэрээнд өөр ангиллын (орон сууцны) зардал нэмэхгүй
        const tootTurul = await gereeniiTootTurul(geree);
        if (zardluudShuuye([doc], tootTurul).length === 0) {
          await gereeniiZardluudBichye(GereeModel, geree._id, zardluud);
          continue;
        }

        // Construct fresh zardal entry
        const newZardal = {
          ner: doc.ner,
          turul: doc.turul,
          tariff: doc.tariff || 0,
          tariffUsgeer: doc.tariffUsgeer || "",
          zardliinTurul: doc.zardliinTurul || "Энгийн",
          barilgiinId: doc.barilgiinId || "",
          tulukhDun: 0,
          dun: doc.dun || 0,
          bodokhArga: doc.bodokhArga || "",
          tseverUsDun: doc.tseverUsDun || 0,
          bokhirUsDun: doc.bokhirUsDun || 0,
          usKhalaasniiDun: doc.usKhalaasniiDun || 0,
          tsakhilgaanUrjver: doc.tsakhilgaanUrjver || 1,
          tsakhilgaanChadal: doc.tsakhilgaanChadal || 0,
          tsakhilgaanDemjikh: doc.tsakhilgaanDemjikh || 0,
          tailbar: doc.tailbar || "",
          suuriKhuraamj: doc.suuriKhuraamj || 0,
          nuatNemekhEsekh: doc.nuatNemekhEsekh || false,
          ognoonuud: doc.ognoonuud || [],
          zaalt: doc.zaalt || false,
          zaaltTariff: doc.zaaltTariff || 0,
          zaaltDefaultDun: doc.zaaltDefaultDun || 0,
          zaaltTariffTiers: doc.zaaltTariffTiers || [],
        };

        zardluud = [...zardluud, newZardal];

        await gereeniiZardluudBichye(GereeModel, geree._id, zardluud);
      } catch (aldaa) {
        console.error(
          `[ashiglaltiinZardluud] "${doc.ner}" зардлыг гэрээнд бичиж чадсангүй: ${geree.gereeniiDugaar || geree._id} —`,
          aldaa?.message,
        );
      }
    }
  } catch (error) {
    console.error(
      "Error updating geree after ashiglaltiinZardluud update:",
      error
    );
  }
}

async function handleZardluudDelete(doc) {
  try {
    if (!doc || !doc.baiguullagiinId) return;

    const { db } = require("zevbackv2");
    const {
      zardlaasGereenuudiigTseverleye,
    } = require("../utils/gereeniiZardalTseverlegee");

    const kholbolt = db.kholboltuud.find(
      (a) => String(a.baiguullagiinId) === String(doc.baiguullagiinId)
    );

    if (!kholbolt) return;

    // Хуваалцсан хэрэгсэл нь гэрээ бүрийг тусад нь барьж, `updateOne`-оор
    // бичдэг тул хуучин өгөгдөлтэй ганц гэрээ бусдыг нь таслахгүй.
    const urDun = await zardlaasGereenuudiigTseverleye(kholbolt, doc);
    if (urDun.aldaatai.length)
      console.error(
        `[ashiglaltiinZardluud] "${doc.ner}" зардлыг ${urDun.aldaatai.length} гэрээнээс хасаж чадсангүй:`,
        urDun.aldaatai.map((a) => a.gereeniiDugaar || a.gereeniiId).join(", "),
      );
  } catch (error) {
    console.error(
      "Error updating geree after ashiglaltiinZardluud deletion:",
      error
    );
  }
}

// Add audit hooks for tracking changes
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(ashiglaltiinZardluudSchema, "ashiglaltiinZardluud");

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;

  if (conn.models.ashiglaltiinZardluud) {
    return conn.model("ashiglaltiinZardluud");
  }

  return conn.model("ashiglaltiinZardluud", ashiglaltiinZardluudSchema);
};
