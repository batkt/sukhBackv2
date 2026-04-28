const mongoose = require("mongoose");
const Schema = mongoose.Schema;

mongoose.pluralize(null);

const nekhemjlekhCronSchema = new Schema({
  baiguullagiinId: {
    type: String,
    required: true,
  },
  barilgiinId: {
    type: String,
    default: null, // null means organization-level, otherwise building-level
  },
  nekhemjlekhUusgekhOgnoo: {
    type: Number,
    required: true,
    min: 1,
    max: 31,
    default: 1,
  },
  idevkhitei: {
    type: Boolean,
    default: true,
  },
  suuldAjillasanOgnoo: {
    type: Date,
    default: null,
  },
  daraagiinAjillakhOgnoo: {
    type: Date,
    default: null,
  },
  uussenOgnoo: {
    type: Date,
    default: Date.now,
  },
  shinechilsenOgnoo: {
    type: Date,
    default: Date.now,
  },
});

// Unique constraint: one schedule per baiguullaga OR per baiguullaga+barilga combination
nekhemjlekhCronSchema.index(
  { baiguullagiinId: 1, barilgiinId: 1 },
  { unique: true, sparse: true }
);

nekhemjlekhCronSchema.pre("save", function (next) {
  this.shinechilsenOgnoo = new Date();
  next();
});

module.exports = function a(conn) {
  if (!conn || !conn.kholbolt)
    throw new Error("Холболтын мэдээлэл заавал бөглөх шаардлагатай!");
  conn = conn.kholbolt;
  
  const Model = conn.model("nekhemjlekhCron", nekhemjlekhCronSchema);
  
  // Migration: Drop old unique index on baiguullagiinId if it exists
  // This allows multiple schedules per baiguullaga (one per building)
  (async () => {
    try {
      const indexes = await Model.collection.getIndexes();
      if (indexes.baiguullagiinId_1) {
        console.log("🔄 [MIGRATION] Dropping old baiguullagiinId unique index...");
        await Model.collection.dropIndex("baiguullagiinId_1");
        console.log("✅ [MIGRATION] Old index dropped successfully");
      }
      // Ensure new compound index exists
      await Model.collection.createIndex(
        { baiguullagiinId: 1, barilgiinId: 1 },
        { unique: true, sparse: true, background: false }
      );
    } catch (err) {
      // Ignore error if index doesn't exist (code 27) or already exists (code 85)
      if (err.code !== 27 && err.code !== 85) {
        console.error("⚠️ [MIGRATION] Error managing indexes:", err.message);
      }
    }
  })();
  
  return Model;
};
