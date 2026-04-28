const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);
const zaaltUnshlaltSchema = new Schema(
  {
    // Contract information
    gereeniiId: {
      type: String,
      required: true,
      index: true,
    },
    gereeniiDugaar: {
      type: String,
      required: true,
      index: true,
    },
    toot: String, // Apartment/unit number
    
    // Organization and building
    baiguullagiinId: {
      type: String,
      required: true,
      index: true,
    },
    barilgiinId: {
      type: String,
      required: true,
      index: true,
    },
    
    // Reading date (when the reading was taken)
    unshlaltiinOgnoo: {
      type: Date,
      required: true,
      index: true,
    },
    
    // Electricity readings
    umnukhZaalt: Number, // Previous reading (Өмнө)
    suuliinZaalt: Number, // Current total reading (Нийт одоо)
    zaaltTog: Number, // Day reading (Өдөр)
    zaaltUs: Number, // Night reading (Шөнө)
    zoruu: Number, // Usage amount (Зөрүү) = suuliinZaalt - umnukhZaalt
    
    // Tariff information
    zaaltZardliinId: String, // Reference to ashiglaltiinZardluud
    zaaltZardliinNer: String, // Tariff name (e.g., "Цахилгаан")
    zaaltZardliinTurul: String, // Tariff type identifier
    tariff: Number, // кВт tariff rate used for calculation
    tariffUsgeer: String, // Unit (usually "кВт")
    defaultDun: Number, // Default amount (суурь хураамж)
    
    // Tiered pricing information (if applicable)
    usedTier: {
      threshold: Number, // Usage threshold for this tier
      tariff: Number, // Tariff rate for this tier
    },
    
    // Calculated amount
    zaaltDun: Number, // Final calculated amount (Төлбөр)
    
    // Detailed calculation breakdown (for transparency and audit)
    zaaltCalculation: {
      umnukhZaalt: Number, // Previous reading
      suuliinZaalt: Number, // Total now
      zaaltTog: Number, // Day reading
      zaaltUs: Number, // Night reading
      zoruu: Number, // Usage amount
      tariff: Number, // кВт tariff rate used
      tariffType: String, // Tariff type identifier
      tariffName: String, // Tariff name
      defaultDun: Number, // Default amount used
      tier: {
        threshold: Number,
        tariff: Number,
      },
      calculatedAt: Date, // When calculation was performed
    },
    
    // Additional tariff settings (for reference)
    bodokhArga: String,
    tseverUsDun: Number,
    bokhirUsDun: Number,
    usKhalaasniiDun: Number,
    tsakhilgaanUrjver: Number,
    tsakhilgaanChadal: Number,
    tsakhilgaanDemjikh: Number,
    suuriKhuraamj: Number,
    nuatNemekhEsekh: Boolean,
    ognoonuud: Array,
    
    // Import metadata
    importOgnoo: Date, // When this reading was imported
    importAjiltniiId: String, // Who imported it
    importAjiltniiNer: String,
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
zaaltUnshlaltSchema.index({ baiguullagiinId: 1, barilgiinId: 1, unshlaltiinOgnoo: -1 });
zaaltUnshlaltSchema.index({ gereeniiId: 1, unshlaltiinOgnoo: -1 });
zaaltUnshlaltSchema.index({ baiguullagiinId: 1, barilgiinId: 1, gereeniiDugaar: 1 });

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  return conn.model("zaaltUnshlalt", zaaltUnshlaltSchema);
};

