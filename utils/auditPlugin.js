/**
 * Глобал аудит plugin — БҮХ Mongoose model дээрх засвар/устгалыг бүртгэнэ.
 *
 * Өмнө нь `addAuditHooks`-ийг 57 model-оос зөвхөн 14-т нь гараар залгасан
 * байсан тул ажилтан, нэхэмжлэх, гүйлгээ, и-баримт гэх мэт ихэнх өгөгдлийн
 * засвар/устгал «Зассан / Устгасан түүх»-д огт харагддаггүй байв. Мөн
 * `updateMany`/`deleteMany` (бөөнөөр) үйлдэл ямар ч model дээр бичигддэггүй
 * байв.
 *
 * `index.js`-ийн хамгийн эхэнд `mongoose.plugin(auditPlugin)` гэж бүртгэнэ —
 * model нь connection дээр compile хийгдэх үед автоматаар залгагдана.
 *
 * Бүртгэх нөхцөл: зөвхөн НЭВТЭРСЭН АЖИЛТНЫ хүсэлтийн үеэр (камер, cron,
 * оршин суугчийн апп зэрэг нь бичигдэхгүй — `auditService` мөн адил шүүдэг).
 * Ажилтны хүсэлт биш бол нэмэлт `findOne` query ч хийхгүй.
 */

const { logEdit, logDelete } = require("../services/auditService");
const { getCurrentRequest } = require("../middleware/requestContext");

/** Аудит бүртгэлд хамаарахгүй model-ууд (аудитын өөрийн, лог, session, код) */
const KHASAKH_MODELUUD = new Set([
  "zassanBarimt",
  "ustgakhTuukh",
  "zasakhTuukh",
  "ustsanBarimt",
  "backTuukh",
  "ipTuukh",
  "khaalgaNeeyeTuukh",
  "msgTuukh",
  "nevtreltiinTuukh",
  "session",
  "batalgaajuulahCode",
  "zevtabsNevtreltCode",
  "cronSchedule",
  "zogsooliinIp",
]);

/** Бөөнөөр үйлдэлд нэг удаад бүртгэх дээд тоо — асар том deleteMany-г хязгаарлана */
const BOONUUR_DEED = 500;

function ajiltniiKhuseltEsekh() {
  const req = getCurrentRequest();
  return req && req.body && req.body.nevtersenAjiltniiToken ? req : null;
}

function modelNerAvya(schema, modelName) {
  return schema.__auditModelName || modelName || "unknown";
}

function orchin(doc) {
  return {
    baiguullagiinId: (doc && doc.baiguullagiinId) || null,
    barilgiinId: (doc && doc.barilgiinId) || null,
  };
}

function auditPlugin(schema) {
  if (schema.__auditPluginApplied) return;
  schema.__auditPluginApplied = true;

  const ner = (ctx) =>
    modelNerAvya(
      schema,
      (ctx && ctx.model && ctx.model.modelName) ||
        (ctx && ctx.constructor && ctx.constructor.modelName),
    );
  const khasakhEsekh = (ctx) => KHASAKH_MODELUUD.has(ner(ctx));
  const dbAvya = () => require("zevbackv2").db;

  /* ── save() — байгаа баримтын засвар ─────────────────────────────── */
  schema.pre("save", async function () {
    if (this.isNew || khasakhEsekh(this) || !ajiltniiKhuseltEsekh()) return;
    if (!this._auditKhuuchin && this._id) {
      try {
        this._auditKhuuchin = await this.constructor.findById(this._id).lean();
      } catch (_) {}
    }
  });
  schema.post("save", async function (doc) {
    const req = ajiltniiKhuseltEsekh();
    if (!req || !this._auditKhuuchin || khasakhEsekh(this)) return;
    try {
      const shine = doc.toObject ? doc.toObject() : doc;
      await logEdit(req, dbAvya(), ner(this), String(doc._id), this._auditKhuuchin, shine, orchin(shine));
    } catch (e) {
      console.error(`❌ [AUDIT] ${ner(this)} save:`, e.message);
    } finally {
      this._auditKhuuchin = null;
    }
  });

  /* ── Нэг баримтын update (findOneAndUpdate / findByIdAndUpdate / updateOne) ── */
  const neginUmnukh = async function () {
    if (khasakhEsekh(this) || !ajiltniiKhuseltEsekh()) return;
    try {
      this._auditKhuuchin = await this.model.findOne(this.getQuery()).lean();
    } catch (_) {}
  };
  const neginDaraa = async function (res) {
    const req = ajiltniiKhuseltEsekh();
    if (!req || !this._auditKhuuchin || khasakhEsekh(this)) return;
    try {
      const khuuchin = this._auditKhuuchin;
      const shine = await this.model.findById(khuuchin._id).lean();
      if (shine) await logEdit(req, dbAvya(), ner(this), String(khuuchin._id), khuuchin, shine, orchin(shine));
    } catch (e) {
      console.error(`❌ [AUDIT] ${ner(this)} update:`, e.message);
    }
  };
  schema.pre("findOneAndUpdate", neginUmnukh);
  schema.post("findOneAndUpdate", neginDaraa);
  schema.pre("updateOne", { document: false, query: true }, neginUmnukh);
  schema.post("updateOne", { document: false, query: true }, neginDaraa);

  /* ── updateMany — өөрчлөгдөх бүх баримтыг бүртгэнэ ──────────────── */
  schema.pre("updateMany", async function () {
    if (khasakhEsekh(this) || !ajiltniiKhuseltEsekh()) return;
    try {
      this._auditKhuuchnuud = await this.model.find(this.getQuery()).limit(BOONUUR_DEED).lean();
    } catch (_) {}
  });
  schema.post("updateMany", async function () {
    const req = ajiltniiKhuseltEsekh();
    const khuuchnuud = this._auditKhuuchnuud;
    if (!req || !khuuchnuud || khuuchnuud.length === 0 || khasakhEsekh(this)) return;
    try {
      const shinenuud = await this.model.find({ _id: { $in: khuuchnuud.map((d) => d._id) } }).lean();
      const shineMap = new Map(shinenuud.map((d) => [String(d._id), d]));
      for (const khuuchin of khuuchnuud) {
        const shine = shineMap.get(String(khuuchin._id));
        if (shine) await logEdit(req, dbAvya(), ner(this), String(khuuchin._id), khuuchin, shine, orchin(shine));
      }
    } catch (e) {
      console.error(`❌ [AUDIT] ${ner(this)} updateMany:`, e.message);
    }
  });

  /* ── Устгал: findOneAndDelete/findByIdAndDelete/findOneAndRemove, deleteOne, deleteMany ── */
  const ustgakhUmnukh = (olon) =>
    async function () {
      if (khasakhEsekh(this) || !ajiltniiKhuseltEsekh()) return;
      try {
        this._auditUstgakh = olon
          ? await this.model.find(this.getQuery()).limit(BOONUUR_DEED).lean()
          : [await this.model.findOne(this.getQuery()).lean()].filter(Boolean);
      } catch (_) {}
    };
  const ustgakhDaraa = (tailbar) =>
    async function () {
      const req = ajiltniiKhuseltEsekh();
      const jagsaalt = this._auditUstgakh;
      if (!req || !jagsaalt || jagsaalt.length === 0 || khasakhEsekh(this)) return;
      for (const doc of jagsaalt) {
        try {
          await logDelete(req, dbAvya(), ner(this), String(doc._id), doc, "hard", tailbar, orchin(doc));
        } catch (e) {
          console.error(`❌ [AUDIT] ${ner(this)} delete:`, e.message);
        }
      }
    };
  schema.pre("findOneAndDelete", ustgakhUmnukh(false));
  schema.post("findOneAndDelete", ustgakhDaraa(null));
  schema.pre("findOneAndRemove", ustgakhUmnukh(false));
  schema.post("findOneAndRemove", ustgakhDaraa(null));
  schema.pre("deleteOne", { document: false, query: true }, ustgakhUmnukh(false));
  schema.post("deleteOne", { document: false, query: true }, ustgakhDaraa(null));
  schema.pre("deleteMany", ustgakhUmnukh(true));
  schema.post("deleteMany", ustgakhDaraa("Бөөнөөр устгасан"));

  // doc.deleteOne() / doc.remove() — баримт өөрөө устгах
  const barimtUstgasan = async function () {
    const req = ajiltniiKhuseltEsekh();
    if (!req || khasakhEsekh(this)) return;
    try {
      const doc = this.toObject ? this.toObject() : this;
      await logDelete(req, dbAvya(), ner(this), String(doc._id), doc, "hard", null, orchin(doc));
    } catch (e) {
      console.error(`❌ [AUDIT] ${ner(this)} doc.deleteOne:`, e.message);
    }
  };
  schema.post("deleteOne", { document: true, query: false }, barimtUstgasan);
  schema.post("remove", { document: true, query: false }, barimtUstgasan);
}

module.exports = { auditPlugin, KHASAKH_MODELUUD };
