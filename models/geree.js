const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
var avlagiinTurul = new Schema({
  guilgeenuud: [
    {
      ognoo: Date,
      undsenDun: Number,
      tulukhDun: Number,
      tulukhAldangi: Number,
      tulsunDun: Number,
      tulsunAldangi: Number,
      uldegdel: Number,
      tariff: Number,
      tailbar: String,
      nemeltTailbar: String,
      turul: String,
      aldangiinTurul: String,
      nekhemjlekhDeerKharagdakh: Boolean,
      nuatBodokhEsekh: Boolean,
      ekhniiUldegdelEsekh: Boolean,
      zardliinTurul: String,
      zardliinId: String,
      zardliinNer: String,
      gereeniiId: String,
      guilgeeniiId: String,
      dansniiDugaar: String,
      tulsunDans: String,
      guilgeeKhiisenOgnoo: Date,
      guilgeeKhiisenAjiltniiNer: String,
      guilgeeKhiisenAjiltniiId: String,
      zaaltTog: Number,
      zaaltUs: Number,
      suuliinZaalt: Number,
      umnukhZaalt: Number,
      bokhirUsDun: Number,
      tseverUsDun: Number,
      usKhalaasanDun: Number,
      suuriKhuraamj: Number,
      tsakhilgaanUrjver: Number, //tsakhilgaanii coefficent
      tsakhilgaanKBTST: Number,
      guidliinKoep: Number,
      bichiltKhonog: Number,
      tsekhDun: Number,
      chadalDun: Number,
      sekhDemjikhTulburDun: Number,
      khonogTootsokhEsekh: Boolean,
      togtmolUtga: Number,
      tooluuriinDugaar: String,
      tulukhNUAT: Number,
      tulukhNuatgui: Number,
    },
  ],
  baritsaa: [
    {
      ognoo: Date,
      orlogo: Number,
      zarlaga: Number,
      tailbar: String,
      guilgeeniiId: String,
      guilgeeKhiisenOgnoo: Date,
      guilgeeKhiisenAjiltniiNer: String,
      guilgeeKhiisenAjiltniiId: String,
    },
  ],
});
const gereeSchema = new Schema(
  {
    id: String,
    gereeniiDugaar: String,
    gereeniiOgnoo: Date,
    turul: String,
    tuluv: {
      type: String,
      enum: ["Идэвхтэй", "Цуцалсан"],
      default: "Идэвхтэй",
    },
    ovog: String,
    ner: String,
    suhNer: String,
    suhRegister: String,
    suhUtas: [String],
    suhMail: String,
    suhGariinUseg: String,
    suhTamga: String,
    register: String,
    aimag: String,
    utas: [String],
    mail: String,
    baingiinKhayag: String,
    khugatsaa: Number,
    ekhlekhOgnoo: Date,
    duusakhOgnoo: Date,
    tulukhOgnoo: Date,
    tsutsalsanOgnoo: Date,
    nekhemjlekhiinOgnoo: Date,
    khungulukhKhugatsaa: Number,
    suhTulbur: String,
    suhTulburUsgeer: String,
    suhKhugatsaa: Number,
    sukhKhungulult: Number,
    ashiglaltiinZardal: Number,
    ashiglaltiinZardalUsgeer: String,
    niitTulbur: Number,
    niitTulburUsgeer: String,
    ekhniiUldegdel: Number,
    ekhniiUldegdelUsgeer: String,
    avlaga: { type: avlagiinTurul, select: false },
    bairNer: String,
    sukhBairshil: String,
    duureg: String,
    horoo: Schema.Types.Mixed,
    sohNer: String,
    toot: String,
    davkhar: String,
    burtgesenAjiltan: String,
    orshinSuugchId: String,
    baiguullagiinId: String,
    baiguullagiinNer: String,
    barilgiinId: String,
    temdeglel: String,
    tailbar: String, // Additional description/notes field
    orts: String, // Web only field
    baritsaaniiUldegdel: {
      type: Number,
      default: 0,
    },
    positiveBalance: {
      type: Number,
      default: 0,
    }, // Positive balance/credit that will be deducted from future invoices
    // Global outstanding balance for this geree (sum of all unpaid invoices)
    globalUldegdel: {
      type: Number,
      default: 0,
    },
    // Electricity readings (цахилгаан заалт)
    umnukhZaalt: Number, // Previous reading (Өмнө)
    suuliinZaalt: Number, // Current total reading (Нийт одоо)
    zaaltTog: Number, // Day reading (Өдөр)
    zaaltUs: Number, // Night reading (Шөнө)
    zardluud: [
      {
        ner: String,
        turul: String,
        tariff: Number,
        tariffUsgeer: String,
        zardliinTurul: String,
        barilgiinId: String, // Барилгын ID - аль барилгаас ирсэн zardal болохыг тодорхойлох
        tulukhDun: Number, // Менежментийн зардал
        dun: Number, //dung n zuwxun munguur tootsoj awax togtmol ued buglunu
        bodokhArga: String, //togtmol tomyotoi baidag arguud
        tseverUsDun: Number, // xaluun xuiten ustei ued xatuu bodno
        bokhirUsDun: Number, // xaluun xuiten ustei ued xatuu bodno
        usKhalaasniiDun: Number, // xaluun us ued xatuu bodno
        tsakhilgaanUrjver: Number, //tsakhilgaanii coefficent
        tsakhilgaanChadal: Number,
        tsakhilgaanDemjikh: Number,
        tailbar: String,
        suuriKhuraamj: String,
        nuatNemekhEsekh: Boolean,
        ognoonuud: [Date],
      },
    ],
    segmentuud: [
      {
        ner: String,
        utga: String,
      },
    ],
    gereeniiTuukhuud: {
      type: [Schema.Types.Mixed],
      select: false,
    },
    khungulultuud: [
      {
        ognoonuud: [Date],
        turul: String,
        zardliinId: String,
        khungulukhTurul: String,
        khungulukhKhuvi: Number,
        tulukhDun: Number,
        khungulultiinDun: Number,
        key: String,
      },
    ],
    // Track guilgeenuud that should appear in nekhemjlekh (one-time)
    // Once included in an invoice, they are removed from this array
    guilgeenuudForNekhemjlekh: [
      {
        ognoo: Date,
        undsenDun: Number,
        tulukhDun: Number,
        tulukhAldangi: Number,
        tulsunDun: Number,
        tulsunAldangi: Number,
        uldegdel: Number,
        tariff: Number,
        tailbar: String,
        nemeltTailbar: String,
        turul: String,
        aldangiinTurul: String,
        nuatBodokhEsekh: Boolean,
        zardliinTurul: String,
        zardliinId: String,
        zardliinNer: String,
        gereeniiId: String,
        guilgeeniiId: String,
        dansniiDugaar: String,
        tulsunDans: String,
        guilgeeKhiisenOgnoo: Date,
        guilgeeKhiisenAjiltniiNer: String,
        guilgeeKhiisenAjiltniiId: String,
        zaaltTog: Number,
        zaaltUs: Number,
        suuliinZaalt: Number,
        umnukhZaalt: Number,
        bokhirUsDun: Number,
        tseverUsDun: Number,
        usKhalaasanDun: Number,
        suuriKhuraamj: Number,
        tsakhilgaanUrjver: Number,
        tsakhilgaanKBTST: Number,
        guidliinKoep: Number,
        bichiltKhonog: Number,
        tsekhDun: Number,
        chadalDun: Number,
        sekhDemjikhTulburDun: Number,
        khonogTootsokhEsekh: Boolean,
        togtmolUtga: Number,
        tooluuriinDugaar: String,
        tulukhNUAT: Number,
        tulukhNuatgui: Number,
        // Track which avlaga.guilgeenuud index this came from
        avlagaGuilgeeIndex: Number,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

// Frontend expects "uldegdel" for balance; expose globalUldegdel (contract balance including credit) as uldegdel
gereeSchema.virtual("uldegdel").get(function () {
  return typeof this.globalUldegdel === "number"
    ? this.globalUldegdel
    : (this.globalUldegdel ?? 0);
});

// Post-save hook to track guilgeenuud for nekhemjlekh (one-time)
// When a guilgee is added to avlaga.guilgeenuud, add it to guilgeenuudForNekhemjlekh
gereeSchema.post("findOneAndUpdate", async function (result) {
  if (result && result.avlaga && result.avlaga.guilgeenuud) {
    await handleGuilgeeForNekhemjlekh(result, this.model);
  }
});

gereeSchema.post("updateOne", async function () {
  const doc = await this.model.findOne(this.getQuery()).select("+avlaga");
  if (doc && doc.avlaga && doc.avlaga.guilgeenuud) {
    await handleGuilgeeForNekhemjlekh(doc, this.model);
  }
});

// Add audit hooks for tracking changes (including tokhirgoo) - after schema definition
const { addAuditHooks } = require("../utils/auditHooks");
addAuditHooks(gereeSchema, "geree");

async function handleGuilgeeForNekhemjlekh(doc, GereeModel) {
  try {
    if (!doc || !doc.avlaga || !doc.avlaga.guilgeenuud) {
      return;
    }

    const { db } = require("zevbackv2");

    const kholbolt = db.kholboltuud.find(
      (a) => a.baiguullagiinId == doc.baiguullagiinId,
    );

    if (!kholbolt) return;

    // Get the latest geree document to check guilgeenuudForNekhemjlekh
    const latestGeree = await GereeModel.findById(doc._id).select(
      "+avlaga +guilgeenuudForNekhemjlekh",
    );

    if (!latestGeree) return;

    const guilgeenuudForNekhemjlekh =
      latestGeree.guilgeenuudForNekhemjlekh || [];
    const avlagaGuilgeenuud = latestGeree.avlaga?.guilgeenuud || [];

    // Find new guilgeenuud that aren't yet in guilgeenuudForNekhemjlekh
    // Match by ognoo, turul, tailbar, and tulukhDun to identify unique guilgeenuud
    const existingGuilgeeIds = new Set();
    guilgeenuudForNekhemjlekh.forEach((g) => {
      const key = `${g.ognoo?.getTime()}_${g.turul}_${g.tailbar}_${g.tulukhDun}`;
      existingGuilgeeIds.add(key);
    });

    const newGuilgeenuud = [];
    avlagaGuilgeenuud.forEach((guilgee, index) => {
      const key = `${guilgee.ognoo?.getTime()}_${guilgee.turul}_${guilgee.tailbar}_${guilgee.tulukhDun}`;
      if (!existingGuilgeeIds.has(key)) {
        // Create a copy for tracking (keep all fields)
        const guilgeeForNekhemjlekh = { ...guilgee };
        guilgeeForNekhemjlekh.avlagaGuilgeeIndex = index;
        newGuilgeenuud.push(guilgeeForNekhemjlekh);
      }
    });

    // Add new guilgeenuud to guilgeenuudForNekhemjlekh
    if (newGuilgeenuud.length > 0) {
      await GereeModel.findByIdAndUpdate(doc._id, {
        $push: {
          guilgeenuudForNekhemjlekh: { $each: newGuilgeenuud },
        },
      });
    }
  } catch (error) {
    console.error("Error updating guilgeenuudForNekhemjlekh:", error);
  }
}

module.exports = function a(conn, read = false) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = read && !!conn.kholboltRead ? conn.kholboltRead : conn.kholbolt;
  return conn.model("geree", gereeSchema);
};
// mongoose.model("geree", gereeSchema);
