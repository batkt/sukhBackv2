const asyncHandler = require("express-async-handler");
const XLSX = require("xlsx");
const excel = require("exceljs");
const OrshinSuugch = require("../models/orshinSuugch");
const Baiguullaga = require("../models/baiguullaga");
const Geree = require("../models/geree");
const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const aldaa = require("../components/aldaa");
const invoiceService = require("../services/invoiceService");
const walletApiService = require("../services/walletApiService");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const { Dans } = require("zevbackv2");

/**
 * Helper to parse numbers from Excel, supporting accounting format like (22) for -22
 * @param {any} val - Value from Excel cell
 * @returns {number} - Parsed number
 */
function parseExcelNumber(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;

  let str = val.toString().trim().replace(/,/g, "");

  if (str.startsWith("(") && str.endsWith(")")) {
    str = "-" + str.substring(1, str.length - 1).trim();
  }

  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}
/**
 *
 * @param {Array} data - Array of objects to export (REQUIRED)
 * @param {Array} headers - Optional: Array of header strings OR objects with 'key' and 'label'
 * @param {String} fileName - Name of the file (without extension)
 * @param {String} sheetName - Name of the Excel sheet
 * @param {Array} colWidths - Optional array of column widths
 */
/**
 * Recursively extract all keys from an object (including nested)
 */
function extractAllKeys(obj, prefix = "") {
  const keys = [];
  if (
    obj &&
    typeof obj === "object" &&
    !Array.isArray(obj) &&
    !(obj instanceof Date)
  ) {
    Object.keys(obj).forEach((key) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (
        obj[key] &&
        typeof obj[key] === "object" &&
        !Array.isArray(obj[key]) &&
        !(obj[key] instanceof Date)
      ) {
        keys.push(...extractAllKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    });
  }
  return keys;
}

exports.downloadNekhemjlekhiinTuukhExcel = asyncHandler(
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
      const Geree = require("../models/geree");

      const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
      if (!tukhainBaaziinKholbolt) {
        throw new aldaa("Холболтын мэдээлэл олдсонгүй!");
      }

      // If the frontend supplies exact pre-calculated and pre-filtered table data,
      // bypass the legacy DB query and immediately process it directly into Excel.
      if (
        req.body.data &&
        Array.isArray(req.body.data) &&
        req.body.data.length > 0
      ) {
        return exports.downloadExcelList(req, res, next);
      }

      const { baiguullagiinId, barilgiinId, filters } = req.body;

      // Build query
      const query = {};
      if (baiguullagiinId) query.baiguullagiinId = baiguullagiinId;
      if (barilgiinId) query.barilgiinId = barilgiinId;

      // Apply additional filters if provided
      if (filters) {
        Object.assign(query, filters);
      }

      // Fetch nekhemjlekhiinTuukh data
      const nekhemjlekhiinTuukhList = await NekhemjlekhiinTuukh(
        tukhainBaaziinKholbolt,
      )
        .find(query)
        .lean();

      if (!nekhemjlekhiinTuukhList || nekhemjlekhiinTuukhList.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Нэхэмжлэхийн мэдээлэл олдсонгүй",
        });
      }

      // Get unique gereeniiId values to fetch geree documents
      const gereeniiIds = [
        ...new Set(
          nekhemjlekhiinTuukhList
            .map((item) => item.gereeniiId)
            .filter(Boolean),
        ),
      ];
      const GereeModel = Geree(tukhainBaaziinKholbolt);
      const gereeMap = {};

      if (gereeniiIds.length > 0) {
        const gereeList = await GereeModel.find({
          _id: { $in: gereeniiIds },
        })
          .select("_id toot davkhar orts utas")
          .lean();

        gereeList.forEach((geree) => {
          gereeMap[geree._id.toString()] = geree;
        });
      }

      // Sort invoices by apartment number (toot) in ascending order
      // Helper function to parse toot as number for proper numeric sorting
      const parseToot = (toot) => {
        if (!toot || toot === "") return Infinity; // Empty toot goes to end
        const num = parseFloat(toot);
        return isNaN(num) ? toot : num; // If not a number, keep as string for comparison
      };

      nekhemjlekhiinTuukhList.sort((a, b) => {
        const gereeA = a.gereeniiId ? gereeMap[a.gereeniiId.toString()] : null;
        const gereeB = b.gereeniiId ? gereeMap[b.gereeniiId.toString()] : null;

        const tootA = gereeA ? gereeA.toot || "" : "";
        const tootB = gereeB ? gereeB.toot || "" : "";

        const numA = parseToot(tootA);
        const numB = parseToot(tootB);

        // Compare as numbers if both are numbers, otherwise as strings
        if (typeof numA === "number" && typeof numB === "number") {
          return numA - numB; // Ascending: 1, 2, 3... 21
        } else if (typeof numA === "number") {
          return -1; // Numbers come before strings
        } else if (typeof numB === "number") {
          return 1; // Numbers come before strings
        } else {
          return String(tootA).localeCompare(String(tootB)); // String comparison
        }
      });

      // Ledger recalculation logic removed as per request.
      const uldegdelMap = {};


      // Helper function to format numbers to 2 decimal places (returns string for Excel)
      const formatNumber = (value) => {
        if (value === null || value === undefined || value === "") return "";
        const num = typeof value === "number" ? value : parseFloat(value);
        if (isNaN(num)) return "";
        return num.toFixed(2);
      };

      // Format data with required columns: №, Нэр, Тоот, Утас, Гэрээний дугаар, Үлдэгдэл, Гүйцэтгэл, Орц, Давхар, Тоот
      const formattedData = nekhemjlekhiinTuukhList.map((item, index) => {
        const geree = item.gereeniiId
          ? gereeMap[item.gereeniiId.toString()]
          : null;

        // Get phone - prefer from invoice, fallback to geree
        let utas = "";
        if (item.utas && Array.isArray(item.utas) && item.utas.length > 0) {
          utas = item.utas[0];
        } else if (item.utas && typeof item.utas === "string") {
          utas = item.utas;
        } else if (
          geree &&
          geree.utas &&
          Array.isArray(geree.utas) &&
          geree.utas.length > 0
        ) {
          utas = geree.utas[0];
        } else if (geree && geree.utas && typeof geree.utas === "string") {
          utas = geree.utas;
        }

        // Get latest uldegdel from ledger (not from invoice)
        const latestUldegdel = item.uldegdel || 0;


        return {
          dugaar: index + 1, // № (row number)
          ner: item.ner || "", // Нэр (name)
          toot: item.nekhemjlekhiinDugaar || item.dugaalaltDugaar || "", // Тоот (invoice number)
          utas: utas, // Утас (phone)
          gereeniiDugaar: item.gereeniiDugaar || "", // Гэрээний дугаар (contract number)
          uldegdel: formatNumber(latestUldegdel), // Үлдэгдэл (balance) - from latest ledger entry, formatted to 2 decimals
          guitsetgel: item.tuluv || "", // Гүйцэтгэл (status/performance)
          orts: geree ? geree.orts || "" : item.davkhar ? "" : "", // Орц (entrance) - from geree
          davkhar: geree
            ? geree.davkhar || item.davkhar || ""
            : item.davkhar || "", // Давхар (floor)
          tootGeree: geree ? geree.toot || "" : "", // Тоот (apartment number) - from geree
        };
      });

      // Set data for download with specific headers
      req.body.data = formattedData;
      req.body.headers = [
        { key: "dugaar", label: "№" },
        { key: "ner", label: "Нэр" },
        { key: "toot", label: "Тоот" },
        { key: "utas", label: "Утас" },
        { key: "gereeniiDugaar", label: "Гэрээний дугаар" },
        { key: "uldegdel", label: "Үлдэгдэл" },
        { key: "guitsetgel", label: "Гүйцэтгэл" },
        { key: "orts", label: "Орц" },
        { key: "davkhar", label: "Давхар" },
        { key: "tootGeree", label: "Тоот" },
      ];
      req.body.fileName =
        req.body.fileName || `nekhemjlekhiinTuukh_${Date.now()}`;
      req.body.sheetName = req.body.sheetName || "Нэхэмжлэх";
      req.body.colWidths = [8, 25, 15, 15, 20, 15, 15, 10, 10, 10]; // Column widths

      // Call downloadExcelList function directly
      return exports.downloadExcelList(req, res, next);
    } catch (error) {
      next(error);
    }
  },
);

// Ebarimt Excel Download
exports.downloadEbarimtExcel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const EbarimtShine = require("../models/ebarimtShine");

    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболтын мэдээлэл олдсонгүй!");
    }

    const { baiguullagiinId, barilgiinId, filters } = req.body;

    // Build query
    const query = {};
    if (baiguullagiinId) query.baiguullagiinId = baiguullagiinId;
    if (barilgiinId) query.barilgiinId = barilgiinId;

    // Apply additional filters if provided
    if (filters) {
      Object.assign(query, filters);
    }

    // Fetch ebarimt data
    const ebarimtList = await EbarimtShine(tukhainBaaziinKholbolt)
      .find(query)
      .lean()
      .sort({ createdAt: -1 });

    if (!ebarimtList || ebarimtList.length === 0) {
      return res.status(404).json({
        success: false,
        message: "E-Barimt мэдээлэл олдсонгүй",
      });
    }

    // Set data for download
    req.body.data = ebarimtList;
    req.body.fileName = req.body.fileName || `ebarimt_${Date.now()}`;
    req.body.sheetName = req.body.sheetName || "E-Barimt";

    // Call downloadExcelList function directly
    return exports.downloadExcelList(req, res, next);
  } catch (error) {
    next(error);
  }
});

// BankniiGuilgee Excel Download
exports.downloadBankniiGuilgeeExcel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const BankniiGuilgee = require("../models/bankniiGuilgee");

    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболтын мэдээлэл олдсонгүй!");
    }

    const {
      baiguullagiinId,
      barilgiinId,
      filters,
      historical = false,
    } = req.body;

    // Build query
    const query = {};
    if (baiguullagiinId) query.baiguullagiinId = baiguullagiinId;
    if (barilgiinId) query.barilgiinId = barilgiinId;

    // Apply additional filters if provided
    if (filters) {
      Object.assign(query, filters);
    }

    // Fetch bankniiGuilgee data
    const bankniiGuilgeeList = await BankniiGuilgee(
      tukhainBaaziinKholbolt,
      historical,
    )
      .find(query)
      .lean()
      .sort({ tranDate: -1 });

    if (!bankniiGuilgeeList || bankniiGuilgeeList.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Банкны гүйлгээний мэдээлэл олдсонгүй",
      });
    }

    // Fetch Dans (account registry) information for all unique combinations of baiguullagiinId and dansniiDugaar
    const { Dans } = require("zevbackv2");
    const dansModel = Dans(tukhainBaaziinKholbolt);

    // Get unique combinations of baiguullagiinId and dansniiDugaar
    const uniqueDansCombinations = new Map();
    bankniiGuilgeeList.forEach((item) => {
      if (item.dansniiDugaar && item.baiguullagiinId) {
        const key = `${item.baiguullagiinId}_${item.dansniiDugaar}`;
        if (!uniqueDansCombinations.has(key)) {
          uniqueDansCombinations.set(key, {
            baiguullagiinId: item.baiguullagiinId,
            dansniiDugaar: item.dansniiDugaar,
          });
        }
      }
    });

    // Create a map of baiguullagiinId_dansniiDugaar -> dans field from Dans model
    const dansMap = {};
    for (const [key, combo] of uniqueDansCombinations) {
      try {
        const dans = await dansModel
          .findOne({
            baiguullagiinId: combo.baiguullagiinId.toString(),
            dugaar: combo.dansniiDugaar,
          })
          .lean();

        if (dans) {
          // Use 'dugaar' field from Dans model (account number), not dans or dansniiNer which are names
          dansMap[key] = dans.dugaar || "";
        }
      } catch (dansError) {
        dansMap[key] = "";
      }
    }

    // Format data with only required columns: №, Огноо, Гүйлгээний утга, Гүйлгээний дүн, Шилжүүлсэн данс
    const formattedData = bankniiGuilgeeList.map((item, index) => ({
      dugaar: index + 1, // № (row number)
      ognoo: item.tranDate
        ? new Date(item.tranDate).toISOString().split("T")[0]
        : "", // Огноо (date)
      guilgeeniiUtga: item.description || "", // Гүйлгээний утга (transaction description)
      guilgeeniiDun: item.amount || 0, // Гүйлгээний дүн (transaction amount)
      shiljuulsenDans:
        item.dansniiDugaar && item.baiguullagiinId
          ? dansMap[`${item.baiguullagiinId}_${item.dansniiDugaar}`] || ""
          : item.relatedAccount || "", // Шилжүүлсэн данс (from Dans model dans field)
    }));

    // Set data for download with specific headers
    req.body.data = formattedData;
    req.body.headers = [
      { key: "dugaar", label: "№" },
      { key: "ognoo", label: "Огноо" },
      { key: "guilgeeniiUtga", label: "Гүйлгээний утга" },
      { key: "guilgeeniiDun", label: "Гүйлгээний дүн" },
      { key: "shiljuulsenDans", label: "Шилжүүлсэн данс" },
    ];
    req.body.fileName = req.body.fileName || `bankniiGuilgee_${Date.now()}`;
    req.body.sheetName = req.body.sheetName || "Банкны гүйлгээ";
    req.body.colWidths = [10, 15, 40, 15, 20]; // Column widths

    // Call downloadExcelList function directly
    return exports.downloadExcelList(req, res, next);
  } catch (error) {
    next(error);
  }
});

// GuilgeeniiTuukh Excel Download (combines geree, orshinSuugch, nekhemjlekhiinTuukh)
exports.downloadGuilgeeniiTuukhExcel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const Geree = require("../models/geree");
    const OrshinSuugch = require("../models/orshinSuugch");
    const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");

    const tukhainBaaziinKholbolt = req.body.tukhainBaaziinKholbolt;
    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболтын мэдээлэл олдсонгүй!");
    }

    const { baiguullagiinId, barilgiinId, gereeniiId, filters } = req.body;

    // Build query for geree
    const gereeQuery = {};
    if (baiguullagiinId) gereeQuery.baiguullagiinId = baiguullagiinId;
    if (barilgiinId) gereeQuery.barilgiinId = barilgiinId;
    if (gereeniiId) gereeQuery._id = gereeniiId;

    // Apply additional filters if provided
    if (filters) {
      Object.assign(gereeQuery, filters);
    }

    // Fetch geree records
    const gereeList = await Geree(tukhainBaaziinKholbolt)
      .find(gereeQuery)
      .lean()
      .sort({ createdAt: -1 });

    if (!gereeList || gereeList.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Гэрээний мэдээлэл олдсонгүй",
      });
    }

    // Expand guilgeenuud and join with related data
    // Note: guilgeenuud might be nested in avlagiinTurul or directly on geree
    const guilgeeniiTuukhList = [];

    for (const geree of gereeList) {
      // Check both geree.guilgeenuud and geree.avlagiinTurul?.guilgeenuud
      let guilgeenuud = geree.guilgeenuud;
      if (
        !guilgeenuud &&
        geree.avlagiinTurul &&
        geree.avlagiinTurul.guilgeenuud
      ) {
        guilgeenuud = geree.avlagiinTurul.guilgeenuud;
      }

      // If no guilgeenuud, create one entry per geree with nekhemjlekhiinTuukh data
      if (
        !guilgeenuud ||
        !Array.isArray(guilgeenuud) ||
        guilgeenuud.length === 0
      ) {
        // Create one row per geree even if no guilgeenuud exists
        const guilgeenuudArray = [{}]; // Empty guilgee object
        guilgeenuud = guilgeenuudArray;
      }

      if (Array.isArray(guilgeenuud) && guilgeenuud.length > 0) {
        // Get orshinSuugch data
        let orshinSuugch = null;
        if (geree.orshinSuugchId) {
          orshinSuugch = await OrshinSuugch(db.erunkhiiKholbolt)
            .findById(geree.orshinSuugchId)
            .lean();
        }

        // Get nekhemjlekhiinTuukh data
        let nekhemjlekhiinTuukh = null;
        if (geree._id) {
          nekhemjlekhiinTuukh = await NekhemjlekhiinTuukh(
            tukhainBaaziinKholbolt,
          )
            .findOne({ gereeniiId: geree._id.toString() })
            .lean()
            .sort({ createdAt: -1 });
        }

        // Expand each guilgee entry
        for (const guilgee of guilgeenuud) {
          guilgeeniiTuukhList.push({
            // Geree fields
            gereeniiId: geree._id?.toString(),
            gereeniiDugaar: geree.gereeniiDugaar,
            gereeniiOgnoo: geree.gereeniiOgnoo,
            gereeOvog: geree.ovog,
            gereeNer: geree.ner,
            gereeUtas: Array.isArray(geree.utas)
              ? geree.utas.join(", ")
              : geree.utas,
            gereeMail: geree.mail,
            gereeBairNer: geree.bairNer,
            gereeDavkhar: geree.davkhar,
            gereeToot: geree.toot,
            gereeBaiguullagiinNer: geree.baiguullagiinNer,

            // OrshinSuugch fields
            orshinSuugchNer: orshinSuugch?.ner || "",
            orshinSuugchOvog: orshinSuugch?.ovog || "",
            orshinSuugchUtas: orshinSuugch?.utas || "",
            orshinSuugchMail: orshinSuugch?.mail || "",

            // NekhemjlekhiinTuukh fields
            nekhemjlekhiinDugaar: nekhemjlekhiinTuukh?.dugaalaltDugaar || "",
            nekhemjlekhiinOgnoo: nekhemjlekhiinTuukh?.nekhemjlekhiinOgnoo || "",
            nekhemjlekhiinTuluv: nekhemjlekhiinTuukh?.tuluv || "",
            nekhemjlekhiinNiitTulbur: nekhemjlekhiinTuukh?.niitTulbur || 0,

            // Guilgee fields
            guilgeeniiOgnoo: guilgee.ognoo,
            guilgeeniiTurul: guilgee.turul,
            guilgeeniiTailbar: guilgee.tailbar,
            guilgeeniiNemeltTailbar: guilgee.nemeltTailbar,
            guilgeeniiUndsenDun: guilgee.undsenDun || 0,
            guilgeeniiTulukhDun: guilgee.tulukhDun || 0,
            guilgeeniiTulukhAldangi: guilgee.tulukhAldangi || 0,
            guilgeeniiTulsunDun: guilgee.tulsunDun || 0,
            guilgeeniiTulsunAldangi: guilgee.tulsunAldangi || 0,
            guilgeeniiUldegdel: guilgee.uldegdel || 0,
            guilgeeniiTariff: guilgee.tariff || 0,
            guilgeeniiZardliinTurul: guilgee.zardliinTurul || "",
            guilgeeniiZardliinNer: guilgee.zardliinNer || "",
            guilgeeniiKhiisenAjiltniiNer:
              guilgee.guilgeeKhiisenAjiltniiNer || "",
            guilgeeniiKhiisenOgnoo: guilgee.guilgeeKhiisenOgnoo,
          });
        }
      }
    }

    if (guilgeeniiTuukhList.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Гүйлгээний мэдээлэл олдсонгүй",
      });
    }

    // Format data with only required columns: №, Нэр, Гэрээний дугаар, Төлбөр, Төлөв
    const formattedData = guilgeeniiTuukhList.map((item, index) => ({
      dugaar: index + 1, // № (row number)
      ner: item.gereeNer || item.orshinSuugchNer || "", // Нэр (name from geree or orshinSuugch)
      gereeniiDugaar: item.gereeniiDugaar || "", // Гэрээний дугаар (contract number)
      tulbur: item.guilgeeniiTulukhDun || item.nekhemjlekhiinNiitTulbur || 0, // Төлбөр (payment amount)
      tuluv: item.nekhemjlekhiinTuluv || "", // Төлөв (status)
    }));

    // Set data for download with specific headers
    req.body.data = formattedData;
    req.body.headers = [
      { key: "dugaar", label: "№" },
      { key: "ner", label: "Нэр" },
      { key: "gereeniiDugaar", label: "Гэрээний дугаар" },
      { key: "tulbur", label: "Төлбөр" },
      { key: "tuluv", label: "Төлөв" },
    ];
    req.body.fileName = req.body.fileName || `guilgeeniiTuukh_${Date.now()}`;
    req.body.sheetName = req.body.sheetName || "Гүйлгээний түүх";
    req.body.colWidths = [10, 25, 20, 15, 15]; // Column widths

    // Call downloadExcelList function directly
    return exports.downloadExcelList(req, res, next);
  } catch (error) {
    next(error);
  }
});

// OrshinSuugch Excel Download
exports.downloadOrshinSuugchExcel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId, filters } = req.body;

    if (!baiguullagiinId) {
      throw new aldaa("Байгууллагын ID хоосон!");
    }

    // Build query
    const query = { baiguullagiinId: String(baiguullagiinId) };

    // Add barilgiinId filter if provided
    if (barilgiinId) {
      // Consistent with orshinSuugch list route: look in top level OR toots array
      query.$or = [
        { barilgiinId: String(barilgiinId) },
        { "toots.barilgiinId": String(barilgiinId) },
      ];
    }

    // Apply additional filters if provided
    if (filters) {
      Object.assign(query, filters);
    }

    // Fetch residents from erunkhiiKholbolt
    const orshinSuugchList = await OrshinSuugch(db.erunkhiiKholbolt)
      .find(query)
      .lean()
      .sort({ createdAt: -1 });

    if (!orshinSuugchList || orshinSuugchList.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Оршин суугчийн мэдээлэл олдсонгүй",
      });
    }

    // Format data for Excel
    const formattedData = orshinSuugchList.map((item, index) => ({
      dugaar: index + 1,
      ovog: item.ovog || "",
      ner: item.ner || "",
      utas: item.utas || "",
      mail: item.mail || "",
      orts: item.orts || "1",
      davkhar: item.davkhar || "",
      toot: item.toot || "",
      bairniiNer: item.bairniiNer || "",
      duureg: item.duureg || "",
      horoo:
        typeof item.horoo === "object"
          ? item.horoo?.ner || ""
          : item.horoo || "",
      soh: item.soh || "",
    }));

    // Set data for download
    req.body.data = formattedData;
    req.body.headers = [
      { key: "dugaar", label: "№" },
      { key: "ovog", label: "Овог" },
      { key: "ner", label: "Нэр" },
      { key: "utas", label: "Утас" },
      { key: "mail", label: "Имэйл" },
      { key: "orts", label: "Орц" },
      { key: "davkhar", label: "Давхар" },
      { key: "toot", label: "Тоот" },
      { key: "bairniiNer", label: "Барилгын нэр" },
      { key: "duureg", label: "Дүүрэг" },
      { key: "horoo", label: "Хороо" },
      { key: "soh", label: "СӨХ" },
    ];
    req.body.fileName = req.body.fileName || `orshinSuugch_${Date.now()}`;
    req.body.sheetName = req.body.sheetName || "Оршин суугчид";
    req.body.colWidths = [10, 20, 20, 15, 25, 10, 10, 10, 25, 15, 15, 20];

    // Call downloadExcelList function directly
    return exports.downloadExcelList(req, res, next);
  } catch (error) {
    next(error);
  }
});

exports.downloadExcelList = asyncHandler(async (req, res, next) => {
  try {
    const { data, headers, fileName, sheetName, colWidths } = req.body;

    if (!data || !Array.isArray(data)) {
      throw new aldaa("Мэдээлэл оруулах шаардлагатай!");
    }

    let headerLabels = [];
    let headerKeys = [];

    if (headers && Array.isArray(headers) && headers.length > 0) {
      headers.forEach((h) => {
        if (typeof h === "string") {
          headerKeys.push(h);
          headerLabels.push(h);
        } else if (typeof h === "object" && h !== null) {
          headerKeys.push(h.key || h.field || "");
          headerLabels.push(h.label || h.key || h.field || "");
        }
      });
    } else {
      // Require headers to be specified - don't extract all keys automatically
      throw new aldaa(
        "'headers' заавал зааж өгөх шаардлагатай! (headers: [{key: 'field', label: 'Label'}] эсвэл ['field1', 'field2'])",
      );
    }

    // Helper function to format row data
    const formatRow = (item) => {
      return headerKeys.map((key) => {
        let value;
        if (key.includes(".")) {
          value = key.split(".").reduce((obj, prop) => {
            if (obj && obj[prop] !== undefined) {
              return obj[prop];
            }
            return null;
          }, item);
        } else {
          value = item[key];
        }

        if (value === null || value === undefined) {
          return "";
        }
        if (Array.isArray(value)) {
          return value.join(", ");
        }
        if (typeof value === "object" && !(value instanceof Date)) {
          if (value.ner && value.kod) {
            return `${value.ner} (${value.kod})`;
          }
          return JSON.stringify(value);
        }
        if (value instanceof Date) {
          return value.toISOString().split("T")[0];
        }
        return String(value);
      });
    };

    const wb = XLSX.utils.book_new();

    // Check if data has barilgiinId field and separate by it
    const hasBarilgiinId = data.some(
      (item) =>
        item &&
        item.barilgiinId !== undefined &&
        item.barilgiinId !== null &&
        item.barilgiinId !== "",
    );

    if (hasBarilgiinId) {
      // Group data by barilgiinId
      const groupedData = {};
      data.forEach((item) => {
        const barilgiinId = item?.barilgiinId || "Бусад";
        if (!groupedData[barilgiinId]) {
          groupedData[barilgiinId] = [];
        }
        groupedData[barilgiinId].push(item);
      });

      // Create a sheet for each barilgiinId
      const barilgiinIds = Object.keys(groupedData).sort();
      barilgiinIds.forEach((barilgiinId, index) => {
        const groupData = groupedData[barilgiinId];
        const rows = groupData.map(formatRow);

        const ws = XLSX.utils.aoa_to_sheet([headerLabels, ...rows]);

        if (colWidths && Array.isArray(colWidths)) {
          ws["!cols"] = colWidths.map((w) => ({
            wch: typeof w === "number" ? w : 15,
          }));
        } else {
          ws["!cols"] = headerLabels.map(() => ({ wch: 15 }));
        }

        // Create sheet name from barilgiinId (Excel sheet names have limitations)
        let sheetNameForBarilga = barilgiinId;
        if (sheetNameForBarilga.length > 31) {
          sheetNameForBarilga = sheetNameForBarilga.substring(0, 28) + "...";
        }
        // Replace invalid characters for Excel sheet names
        sheetNameForBarilga = sheetNameForBarilga.replace(
          /[\\\/\?\*\[\]:]/g,
          "_",
        );

        // If we have a base sheetName, use it with barilgiinId
        const finalSheetName = sheetName
          ? `${sheetName}_${index + 1}`
          : barilgiinIds.length > 1
            ? sheetNameForBarilga
            : sheetName || "Sheet1";

        XLSX.utils.book_append_sheet(wb, ws, finalSheetName);
      });
    } else {
      // No barilgiinId, create single sheet as before
      const rows = data.map(formatRow);
      const ws = XLSX.utils.aoa_to_sheet([headerLabels, ...rows]);

      if (colWidths && Array.isArray(colWidths)) {
        ws["!cols"] = colWidths.map((w) => ({
          wch: typeof w === "number" ? w : 15,
        }));
      } else {
        ws["!cols"] = headerLabels.map(() => ({ wch: 15 }));
      }

      XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
    }

    const excelBuffer = XLSX.write(wb, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const encodedFileName = encodeURIComponent(fileName || `export_${Date.now()}`);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodedFileName}.xlsx"; filename*=UTF-8''${encodedFileName}.xlsx`,
    );

    res.send(excelBuffer);
  } catch (error) {
    next(error);
  }
});

exports.generateExcelTemplate = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const Baiguullaga = require("../models/baiguullaga");

    const { baiguullagiinId, barilgiinId } = req.query;

    let ortsList = ["1"]; // Default
    let davkharList = [];

    // Fetch building structure if IDs are provided
    if (baiguullagiinId && barilgiinId) {
      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        baiguullagiinId,
      );
      if (baiguullaga) {
        const targetBarilga = baiguullaga.barilguud?.find(
          (b) => String(b._id) === String(barilgiinId),
        );

        if (targetBarilga) {
          const davkhariinToonuud =
            targetBarilga.tokhirgoo?.davkhariinToonuud || {};
          const ortsSet = new Set();
          const davkharSet = new Set();

          Object.keys(davkhariinToonuud).forEach((key) => {
            if (key.includes("::")) {
              const parts = key.split("::");
              if (parts.length === 2) {
                ortsSet.add(parts[0].trim());
                davkharSet.add(parts[1].trim());
              }
            } else {
              davkharSet.add(key.trim());
            }
          });

          // Fallback to directly stored floors if set is empty
          if (davkharSet.size === 0 && targetBarilga.tokhirgoo?.davkhar) {
            targetBarilga.tokhirgoo.davkhar.forEach((f) =>
              davkharSet.add(String(f).trim()),
            );
          }

          if (ortsSet.size > 0) {
            ortsList = Array.from(ortsSet).sort((a, b) => {
              const numA = parseInt(a);
              const numB = parseInt(b);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return a.localeCompare(b);
            });
          }

          if (davkharSet.size > 0) {
            davkharList = Array.from(davkharSet).sort((a, b) => {
              const numA = parseInt(a);
              const numB = parseInt(b);
              if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
              return a.localeCompare(b);
            });
          }
        }
      }
    }

    const headers = [
      "Овог",
      "Нэр",
      "Утас",
      "Имэйл",
      "Орц",
      "Давхар",
      "Тоот",
      "Эхний үлдэгдэл",
      "Цахилгаан кВт (тариф ₮/кВт)",
      "Тайлбар",
    ];

    let workbook = new excel.Workbook();
    let worksheet = workbook.addWorksheet("Оршин суугч бүртгэх");

    worksheet.columns = headers.map((h, i) => ({
      header: h,
      key: h,
      width: [15, 15, 12, 25, 10, 10, 10, 15, 22, 22, 30][i] || 15,
    }));

    // Data validation for Orts (Column E) and Davkhar (Column F)
    const ortsFormula = `"${ortsList.join(",")}"`;
    const davkharFormula =
      davkharList.length > 0 ? `"${davkharList.join(",")}"` : null;

    // Apply to rows 2 to 2000
    if (ortsFormula && ortsFormula.length < 255) {
      worksheet.dataValidations.add("E2:E2000", {
        type: "list",
        allowBlank: true,
        formulae: [ortsFormula],
        showErrorMessage: true,
        errorStyle: "error",
        error: "Жагсаалтаас сонгоно уу!",
      });
    }

    if (davkharFormula && davkharFormula.length < 255) {
      worksheet.dataValidations.add("F2:F2000", {
        type: "list",
        allowBlank: true,
        formulae: [davkharFormula],
        showErrorMessage: true,
        errorStyle: "error",
        error: "Жагсаалтаас сонгоно уу!",
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="orshinSuugch_import_template_${Date.now()}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

exports.importUsersFromExcel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId } = req.body;

    if (!baiguullagiinId) {
      throw new aldaa("Байгууллагын ID хоосон");
    }

    if (!req.file) {
      throw new aldaa("Excel файл оруулах");
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });

    if (!data || data.length === 0) {
      throw new aldaa("Excel хоосон");
    }

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );

    if (!baiguullaga) {
      throw new aldaa("Байгууллага олдсонгүй");
    }

    const defaultBarilgiinId =
      barilgiinId ||
      (baiguullaga.barilguud && baiguullaga.barilguud.length > 0
        ? String(baiguullaga.barilguud[0]._id)
        : null);

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) => kholbolt.baiguullagiinId === baiguullaga._id.toString(),
    );

    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболт олдсонгүй");
    }

    // Note: ashiglaltiinZardluudData will be fetched per row from baiguullaga.barilguud[].tokhirgoo

    const results = {
      success: [],
      failed: [],
      total: data.length,
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        // Parse name field - extract ovog if not provided separately
        let ovog = row["Овог"]?.toString().trim() || "";
        let ner = row["Нэр"]?.toString().trim() || "";

        // If ovog is empty but ner contains a dot (.) or space, extract ovog from ner
        if (!ovog && ner) {
          // Check for pattern like "Б.Батбаяр" (with dot)
          const dotMatch = ner.match(/^([А-ЯЁа-яё]+)\.(.+)$/);
          if (dotMatch) {
            ovog = dotMatch[1] + "."; // Keep the dot in ovog
            ner = dotMatch[2].trim();
          } else {
            // Check for pattern like "Б Батбаяр" (with space, no dot)
            const spaceMatch = ner.match(/^([А-ЯЁа-яё]+)\s+(.+)$/);
            if (spaceMatch) {
              ovog = spaceMatch[1].trim();
              ner = spaceMatch[2].trim();
            }
          }
        }

        // Tariff (₮/кВт) — оршин суугчид; тоолуурын нийт заалт тусдаа баганаас
        const tariffKeys = [
          "Цахилгаан кВт (тариф ₮/кВт)",
          "Цахилгаан кВт",
        ];
        let tsahilgaaniiZaalt = 0;
        for (const k of tariffKeys) {
          if (
            row[k] !== undefined &&
            row[k] !== null &&
            String(row[k]).trim() !== ""
          ) {
            tsahilgaaniiZaalt = parseFloat(row[k]) || 0;
            break;
          }
        }

        // Хуучин загвар: зөвхөн "Цахилгаан кВт" байвал ихэнх нь тариф; тоолуурын утга ихэвчлэн 1000+
        const legacySingleCol =
          row["Цахилгаан кВт"] !== undefined &&
          row["Цахилгаан кВт"] !== null &&
          String(row["Цахилгаан кВт"]).trim() !== "" &&
          !row["Цахилгаан кВт (тариф ₮/кВт)"]
            ? parseFloat(row["Цахилгаан кВт"])
            : NaN;
        const initialMeterReading =
          Number.isFinite(legacySingleCol) && legacySingleCol >= 1000
            ? legacySingleCol
            : 0;

        const userData = {
          ovog: ovog,
          ner: ner,
          utas: row["Утас"]?.toString().trim() || "",
          mail: row["Имэйл"]?.toString().trim() || "",
          davkhar: row["Давхар"]?.toString().trim() || "",
          toot: row["Тоот"]?.toString().trim() || "",
          orts: row["Орц"]?.toString().trim() || "",
          ekhniiUldegdel: row["Эхний үлдэгдэл"]
            ? parseFloat(row["Эхний үлдэгдэл"]) || 0
            : 0,
          tsahilgaaniiZaalt, // Тариф ₮/кВт (оршин суугч)
          initialMeterReading, // Тоолуурын эхний нийт заалт (кВт·ц) — гэрээнд
          tailbar: row["Тайлбар"]?.toString().trim() || "",
        };

        // Check if this is an update-only row (only toot, davkhar, ekhniiUldegdel, and possibly tsahilgaaniiZaalt)
        const isUpdateOnlyRow =
          (!userData.ner || userData.ner.length === 0) &&
          (!userData.utas || userData.utas.length === 0) &&
          (!userData.mail || userData.mail.length === 0) &&
          (!userData.ovog || userData.ovog.length === 0) &&
          userData.toot &&
          userData.toot.length > 0 &&
          userData.davkhar &&
          userData.davkhar.length > 0 &&
          (userData.ekhniiUldegdel !== undefined ||
            userData.tsahilgaaniiZaalt !== undefined ||
            userData.initialMeterReading !== undefined);

        if (isUpdateOnlyRow) {
          // Find existing user by toot and davkhar
          const existingOrshinSuugch = await OrshinSuugch(
            db.erunkhiiKholbolt,
          ).findOne({
            toot: userData.toot.trim(),
            davkhar: userData.davkhar.trim(),
            baiguullagiinId: baiguullaga._id,
          });

          if (existingOrshinSuugch) {
            // Update only ekhniiUldegdel and tsahilgaaniiZaalt
            if (userData.ekhniiUldegdel !== undefined) {
              existingOrshinSuugch.ekhniiUldegdel = userData.ekhniiUldegdel;
            }
            if (userData.tsahilgaaniiZaalt !== undefined) {
              existingOrshinSuugch.tsahilgaaniiZaalt =
                userData.tsahilgaaniiZaalt;
            }
            await existingOrshinSuugch.save();

            // Keep active contracts in org DB aligned with updated resident opening balance.
            if (userData.ekhniiUldegdel !== undefined) {
              const tukhainBaaziinKholbolt = db.kholboltuud.find(
                (kholbolt) =>
                  String(kholbolt.baiguullagiinId) === String(baiguullaga._id),
              );

              if (tukhainBaaziinKholbolt) {
                const GereeModel = Geree(tukhainBaaziinKholbolt);
                const NekhemjlekhModel = require("../models/nekhemjlekhiinTuukh")(
                  tukhainBaaziinKholbolt,
                );
                const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");

                const affectedGerees = await GereeModel.find({
                  orshinSuugchId: existingOrshinSuugch._id.toString(),
                  baiguullagiinId: String(baiguullaga._id),
                  tuluv: "Идэвхтэй",
                }).select("_id");

                const GuilgeeAvlaguudTulukhModel = GuilgeeAvlaguud(tukhainBaaziinKholbolt);
                const targetEkhnii = Number(userData.ekhniiUldegdel) || 0;

                for (const g of affectedGerees) {
                  const rows = await GuilgeeAvlaguudTulukhModel.find({
                    gereeniiId: String(g._id),
                    baiguullagiinId: String(baiguullaga._id),
                    ekhniiUldegdelEsekh: true,
                  })
                    .sort({ createdAt: -1 })
                    .lean();

                  const currentTotal = rows.reduce(
                    (sum, r) => sum + (Number(r.undsenDun) || 0),
                    0,
                  );
                  const delta = Math.round((targetEkhnii - currentTotal) * 100) / 100;

                  if (delta > 0.01) {
                    if (rows.length > 0) {
                      await GuilgeeAvlaguudTulukhModel.updateOne(
                        { _id: rows[0]._id },
                        {
                          $inc: {
                            undsenDun: delta,
                            tulukhDun: delta,
                            // uldegdel removed
                            dun: delta,
                          },
                        },
                      );
                    } else {
                      const gereeDoc = await GereeModel.findById(g._id).lean();
                      await GuilgeeAvlaguudTulukhModel.create({
                        baiguullagiinId: String(baiguullaga._id),
                        baiguullagiinNer: gereeDoc?.baiguullagiinNer || "",
                        barilgiinId: gereeDoc?.barilgiinId || "",
                        gereeniiId: String(g._id),
                        gereeniiDugaar: gereeDoc?.gereeniiDugaar || "",
                        orshinSuugchId:
                          gereeDoc?.orshinSuugchId || existingOrshinSuugch._id.toString(),
                        ognoo: new Date(),
                        undsenDun: delta,
                        tulukhDun: delta,
                        uldegdel: delta,
                        turul: "avlaga",
                        zardliinNer: "Эхний үлдэгдэл",
                        ekhniiUldegdelEsekh: true,
                        source: "excel_import",
                        tailbar: "Excel-ээр засварласан эхний үлдэгдэл",
                        guilgeeKhiisenAjiltniiNer: "System",
                        guilgeeKhiisenAjiltniiId: null,
                      });
                    }
                  }

                }
              }
            }

            results.success.push({
              row: rowNumber,
              message: `Шинэчлэгдсэн: Тоот ${userData.toot}, Давхар ${userData.davkhar}`,
            });
            continue; // Skip the rest of the processing for this row
          } else {
            throw new Error(
              `Оршин суугч олдсонгүй: Тоот ${userData.toot}, Давхар ${userData.davkhar}`,
            );
          }
        }

        const validationErrors = [];

        if (!userData.ner || userData.ner.length === 0) {
          validationErrors.push("Нэр");
        }

        if (!userData.utas || userData.utas.length === 0) {
          validationErrors.push("Утас");
        } else {
          userData.utas = userData.utas.replace(/\s/g, "");
          if (userData.utas.length === 0) {
            validationErrors.push("Утас");
          } else if (!/^\d+$/.test(userData.utas)) {
            validationErrors.push("Утас буруу");
          } else if (userData.utas.length !== 8) {
            validationErrors.push("Утас 8 орон");
          }
        }

        if (!userData.davkhar || userData.davkhar.length === 0) {
          validationErrors.push("Давхар");
        } else {
          userData.davkhar = userData.davkhar.replace(/\s/g, "");
          if (userData.davkhar.length === 0) {
            validationErrors.push("Давхар");
          } else if (!/^\d+$/.test(userData.davkhar)) {
            validationErrors.push("Давхар буруу");
          }
        }

        if (!userData.toot || userData.toot.length === 0) {
          validationErrors.push("Тоот");
        } else {
          userData.toot = userData.toot.trim();
          if (userData.toot.length === 0) {
            validationErrors.push("Тоот");
          }
        }

        if (validationErrors.length > 0) {
          throw new Error(validationErrors.join(", ") + " хоосон эсвэл буруу");
        }

        // Determine the correct building for this user
        // Priority: 1) Excel "Барилга" column, 2) Match davkhar+orts+toot combination, 3) Default
        let finalBarilgiinId = barilgiinId || defaultBarilgiinId;

        // Check if Excel has "Барилга" or "Барилгын ID" column
        const excelBarilgaName =
          row["Барилга"]?.toString().trim() ||
          row["Барилгын нэр"]?.toString().trim() ||
          "";
        const excelBarilgiinId = row["Барилгын ID"]?.toString().trim() || "";

        if (excelBarilgiinId) {
          // If barilgiinId is provided in Excel, use it
          const matchingBarilga = baiguullaga.barilguud?.find(
            (b) => String(b._id) === String(excelBarilgiinId),
          );
          if (matchingBarilga) {
            finalBarilgiinId = String(matchingBarilga._id);
          }
        } else if (excelBarilgaName) {
          // If building name is provided in Excel, find by name
          const matchingBarilga = baiguullaga.barilguud?.find(
            (b) => String(b.ner).trim() === excelBarilgaName,
          );
          if (matchingBarilga) {
            finalBarilgiinId = String(matchingBarilga._id);
          }
        } else if (
          userData.toot &&
          userData.davkhar &&
          baiguullaga.barilguud &&
          baiguullaga.barilguud.length > 1
        ) {
          // Match based on davkhar + orts + toot combination
          // This ensures we find the exact building even if multiple buildings have the same toot
          // Support comma-separated toots like "101,69,1,2"
          const tootRaw = userData.toot.trim();
          const tootListToFind = tootRaw
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t && t.length > 0);

          const davkharToFind = userData.davkhar.trim();
          const ortsToFind = (userData.orts || "1").trim(); // Default to "1" if not provided
          const floorKey = `${ortsToFind}::${davkharToFind}`;

          let foundBuilding = null;
          let matchedToot = null;

          // Search through all buildings to find which one contains this exact combination
          for (const barilga of baiguullaga.barilguud) {
            const davkhariinToonuud =
              barilga.tokhirgoo?.davkhariinToonuud || {};

            // First, try exact floorKey match (orts::davkhar)
            if (davkhariinToonuud[floorKey]) {
              const tootArray = davkhariinToonuud[floorKey];

              if (
                tootArray &&
                Array.isArray(tootArray) &&
                tootArray.length > 0
              ) {
                let tootList = [];

                // Handle both formats: comma-separated string or array of strings
                if (
                  typeof tootArray[0] === "string" &&
                  tootArray[0].includes(",")
                ) {
                  tootList = tootArray[0]
                    .split(",")
                    .map((t) => t.trim())
                    .filter((t) => t);
                } else {
                  tootList = tootArray
                    .map((t) => String(t).trim())
                    .filter((t) => t);
                }

                // Check if ANY of the toots in tootListToFind is found in this building's tootList
                for (const tootToFind of tootListToFind) {
                  if (tootList.includes(tootToFind)) {
                    foundBuilding = barilga;
                    matchedToot = tootToFind;
                    break;
                  }
                }
              }
            }

            if (foundBuilding) {
              break;
            }
          }

          if (foundBuilding) {
            finalBarilgiinId = String(foundBuilding._id);
          }
        }

        // Integrate with Wallet API (same as website and mobile registration)
        // This ensures Excel-imported users are unified with website/mobile users
        const phoneNumber = userData.utas;
        let walletUserInfo = null;
        let walletUserId = null;

        // Try to integrate with Wallet API if email is provided
        if (userData.mail && userData.mail.trim()) {
          try {
            const email = userData.mail.trim();

            walletUserInfo = await walletApiService.getUserInfo(phoneNumber);

            if (walletUserInfo && walletUserInfo.userId) {
              walletUserId = walletUserInfo.userId;
            } else {
              walletUserInfo = await walletApiService.registerUser(
                phoneNumber,
                email,
              );

              if (walletUserInfo && walletUserInfo.userId) {
                walletUserId = walletUserInfo.userId;
              }
            }
          } catch (walletError) {}
        }

        // Check if user already exists (by phone number OR walletUserId - unified check)
        const existingUser = await OrshinSuugch(db.erunkhiiKholbolt).findOne({
          $or: [
            { utas: phoneNumber },
            ...(walletUserId ? [{ walletUserId: walletUserId }] : []),
          ],
        });

        // Prevent duplicate: one toot (optionally + davkhar) can have only one resident per building
        const tootRaw = userData.toot.trim();
        const davkharToCheck = userData.davkhar
          ? String(userData.davkhar).trim()
          : "";
        const tootListToCheck = tootRaw
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t && t.length > 0);
        for (const tootToCheck of tootListToCheck) {
          const baseMatch = {
            toot: tootToCheck,
            barilgiinId: finalBarilgiinId,
          };
          const baseTootMatch = {
            toot: tootToCheck,
            barilgiinId: finalBarilgiinId,
          };
          if (davkharToCheck) {
            baseMatch.davkhar = davkharToCheck;
            baseTootMatch.davkhar = davkharToCheck;
          }
          const duplicateQuery = {
            $or: [baseMatch, { toots: { $elemMatch: baseTootMatch } }],
          };
          if (existingUser) {
            duplicateQuery._id = { $ne: existingUser._id };
          }
          const duplicateResident = await OrshinSuugch(
            db.erunkhiiKholbolt,
          ).findOne(duplicateQuery);
          if (duplicateResident) {
            throw new Error(
              `"${tootToCheck}" тоот дээр оршин суугч аль хэдийн бүртгэгдсэн байна (мөр ${rowNumber}).`,
            );
          }
        }

        const targetBarilga = baiguullaga.barilguud?.find(
          (b) => String(b._id) === String(finalBarilgiinId),
        );

        if (!targetBarilga) {
          throw new Error("Барилга олдсонгүй");
        }

        if (userData.toot && userData.davkhar) {
          // Support comma-separated toots like "101,69,1,2"
          const tootRaw = userData.toot.trim();
          const tootListToValidate = tootRaw
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t && t.length > 0);

          const davkharToValidate = userData.davkhar.trim();
          const ortsToValidate = (userData.orts || "1").trim();
          const floorKey = `${ortsToValidate}::${davkharToValidate}`;

          const davkhariinToonuud =
            targetBarilga.tokhirgoo?.davkhariinToonuud || {};
          let tootArray = davkhariinToonuud[floorKey];
          let foundToonuud = [];

          // First, try exact floorKey match
          if (tootArray && Array.isArray(tootArray) && tootArray.length > 0) {
            let registeredToonuud = [];

            if (
              typeof tootArray[0] === "string" &&
              tootArray[0].includes(",")
            ) {
              registeredToonuud = tootArray[0]
                .split(",")
                .map((t) => t.trim())
                .filter((t) => t);
            } else {
              registeredToonuud = tootArray
                .map((t) => String(t).trim())
                .filter((t) => t);
            }

            // Validate each toot in the comma-separated list
            for (const tootToValidate of tootListToValidate) {
              if (registeredToonuud.includes(tootToValidate)) {
                foundToonuud.push(tootToValidate);
              }
            }
          }

          // If no toots were found, block import for this row
          if (foundToonuud.length === 0) {
            throw new Error(
              `"${userData.toot}" тоот бүртгэлгүй байна. Та барилгын тохиргооноос тоотыг шалгана уу.`,
            );
          } else if (foundToonuud.length < tootListToValidate.length) {
            const notFound = tootListToValidate.filter(
              (t) => !foundToonuud.includes(t),
            );
            throw new Error(
              `"${notFound.join(", ")}" тоотнууд бүртгэлгүй байна.`,
            );
          }
        }

        // Get ashiglaltiinZardluud and liftShalgaya from baiguullaga.barilguud[].tokhirgoo
        const targetBarilgaForRow = baiguullaga.barilguud?.find(
          (b) => String(b._id) === String(finalBarilgiinId),
        );

        const ashiglaltiinZardluudData = await AshiglaltiinZardluud(
          tukhainBaaziinKholbolt,
        ).find({
          baiguullagiinId: baiguullagiinId,
          barilgiinId: finalBarilgiinId,
        });
        const liftShalgayaData = targetBarilgaForRow?.tokhirgoo?.liftShalgaya;
        const choloolugdokhDavkhar =
          liftShalgayaData?.choloolugdokhDavkhar || [];

        const duuregNer = targetBarilga.tokhirgoo?.duuregNer || "";
        const horooData = targetBarilga.tokhirgoo?.horoo || {};
        const horooNer = horooData.ner || "";
        const sohNer = targetBarilga.tokhirgoo?.sohNer || "";

        const userObject = {
          ovog: userData.ovog || "",
          ner: userData.ner,
          utas: userData.utas,
          mail: walletUserInfo?.email || userData.mail || "", // Use email from Wallet API if available
          nuutsUg: "1234",
          baiguullagiinId: baiguullaga._id,
          baiguullagiinNer: baiguullaga.ner,
          barilgiinId: finalBarilgiinId,
          erkh: "OrshinSuugch",
          nevtrekhNer: userData.utas,
          duureg: duuregNer,
          horoo: horooData,
          soh: sohNer,
          davkhar: userData.davkhar,
          bairniiNer: targetBarilga.ner || "",
          toot: userData.toot || "", // Keep for backward compatibility
          orts: userData.orts || "",
          ekhniiUldegdel: userData.ekhniiUldegdel || 0,
          tsahilgaaniiZaalt: userData.tsahilgaaniiZaalt || 0, // Тариф ₮/кВт from Excel
          tailbar: userData.tailbar || "", // Save tailbar to orshinSuugch
          toots: [], // Initialize toots array
          // Link to Wallet API (unifies Excel-imported users with website/mobile users)
          ...(walletUserId ? { walletUserId: walletUserId } : {}),
        };

        // If user already exists, update it; otherwise create new
        let orshinSuugch;
        if (existingUser) {
          orshinSuugch = existingUser;
          // Update personal info
          if (userObject.ovog) orshinSuugch.ovog = userObject.ovog;
          if (userObject.ner) orshinSuugch.ner = userObject.ner;
          if (userObject.mail) orshinSuugch.mail = userObject.mail;
          if (walletUserId) orshinSuugch.walletUserId = walletUserId;

          // DO NOT overwrite baiguullagiinId, barilgiinId at top level
          // These are the resident's "primary" home.
          // New building links go into the toots array.
        } else {
          orshinSuugch = new OrshinSuugch(db.erunkhiiKholbolt)(userObject);
          // For new users, set the top-level fields
          orshinSuugch.baiguullagiinId = baiguullaga._id.toString();
          orshinSuugch.baiguullagiinNer = baiguullaga.ner;
          orshinSuugch.barilgiinId = finalBarilgiinId;
        }

        // Add toot(s) to toots array if provided
        // Support comma-separated toots like "101,69,1,2"
        if (userData.toot && finalBarilgiinId) {
          // Split comma-separated toots
          const tootRaw = userData.toot.trim();
          const tootList = tootRaw
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t && t.length > 0); // Filter out empty strings

          // Create a toot entry for each toot
          for (const individualToot of tootList) {
            const tootEntry = {
              toot: individualToot,
              source: "OWN_ORG",
              baiguullagiinId: baiguullaga._id.toString(),
              barilgiinId: finalBarilgiinId,
              davkhar: userData.davkhar || "",
              orts: userData.orts || "1",
              duureg: duuregNer,
              horoo: horooData,
              soh: sohNer,
              bairniiNer: targetBarilga.ner || "",
              createdAt: new Date(),
            };

            // Check if this toot already exists in user's toots array
            const existingTootIndex = orshinSuugch.toots?.findIndex(
              (t) =>
                t.toot === tootEntry.toot &&
                t.barilgiinId === tootEntry.barilgiinId,
            );

            if (existingTootIndex >= 0) {
              orshinSuugch.toots[existingTootIndex] = tootEntry;
            } else {
              orshinSuugch.toots.push(tootEntry);
            }
          }
        }

        await orshinSuugch.save();

        // --- AUTO CREATE GUEST SETTINGS (OrshinSuugchMashin) ---
        try {
          const OrshinSuugchMashin = require("../models/orshinSuugchMashin");
          const rowBuilding = baiguullaga.barilguud?.find(
            (b) => String(b._id) === String(finalBarilgiinId),
          );
          const buildingSettings = rowBuilding?.tokhirgoo?.zochinTokhirgoo;
          const orgSettings = baiguullaga.tokhirgoo?.zochinTokhirgoo;

          const defaultSettings =
            buildingSettings && buildingSettings.zochinUrikhEsekh !== undefined
              ? buildingSettings
              : orgSettings;

          if (defaultSettings) {
            const OrshinSuugchMashinModel = OrshinSuugchMashin(
              db.erunkhiiKholbolt,
            );

            // Check if settings already exist in central database
            const existingSettings = await OrshinSuugchMashinModel.findOne({
              orshinSuugchiinId: orshinSuugch._id.toString(),
              zochinTurul: "Оршин суугч",
            });

            if (!existingSettings) {
              const newSettings = new OrshinSuugchMashinModel({
                orshinSuugchiinId: orshinSuugch._id.toString(),
                baiguullagiinId: baiguullaga._id.toString(),
                barilgiinId: finalBarilgiinId,
                ezenToot: orshinSuugch.toot || userData.toot || "",
                zochinUrikhEsekh: defaultSettings.zochinUrikhEsekh !== false,
                zochinTurul: "Оршин суугч",
                zochinErkhiinToo: defaultSettings.zochinErkhiinToo || 0,
                zochinTusBurUneguiMinut:
                  defaultSettings.zochinTusBurUneguiMinut || 0,
                zochinNiitUneguiMinut:
                  defaultSettings.zochinNiitUneguiMinut || 0,
                zochinTailbar: defaultSettings.zochinTailbar || "",
                davtamjiinTurul: defaultSettings.davtamjiinTurul || "saraar",
                davtamjUtga: defaultSettings.davtamjUtga,
              });

              await newSettings.save();
            }
          }
        } catch (zochinErr) {
          // Error creating guest settings - silently continue
        }

        // Create gerees for all OWN_ORG toots that don't have gerees yet
        if (
          orshinSuugch.toots &&
          Array.isArray(orshinSuugch.toots) &&
          orshinSuugch.toots.length > 0
        ) {
          const ownOrgToots = orshinSuugch.toots.filter(
            (t) => t.source === "OWN_ORG" && t.baiguullagiinId && t.barilgiinId,
          );

          for (const tootEntry of ownOrgToots) {
            try {
              // Check if geree already exists for this specific toot (user + barilgiinId + toot combination)
              const GereeModel = Geree(tukhainBaaziinKholbolt);
              const existingGeree = await GereeModel.findOne({
                orshinSuugchId: orshinSuugch._id.toString(),
                barilgiinId: tootEntry.barilgiinId,
                toot: tootEntry.toot,
                tuluv: { $ne: "Цуцалсан" }, // Only check active gerees
              });

              if (existingGeree) {
                continue;
              }

              // Get ashiglaltiinZardluud from barilga
              const targetBarilgaForToot = baiguullaga.barilguud?.find(
                (b) => String(b._id) === String(tootEntry.barilgiinId),
              );

              if (!targetBarilgaForToot) {
                continue;
              }

              const ashiglaltiinZardluudData = await AshiglaltiinZardluud(
                tukhainBaaziinKholbolt,
              ).find({
                baiguullagiinId: baiguullagiinId,
                barilgiinId: tootEntry.barilgiinId,
              });
              const liftShalgayaData =
                targetBarilgaForToot.tokhirgoo?.liftShalgaya;
              const choloolugdokhDavkhar =
                liftShalgayaData?.choloolugdokhDavkhar || [];

              const zardluudArray = ashiglaltiinZardluudData.map((zardal) => ({
                ner: zardal.ner,
                turul: zardal.turul,
                zardliinTurul: zardal.zardliinTurul,
                tariff: zardal.tariff,
                tariffUsgeer: zardal.tariffUsgeer || "",
                tulukhDun: 0,
                dun: zardal.dun || 0,
                bodokhArga: zardal.bodokhArga || "",
                tseverUsDun: zardal.tseverUsDun || 0,
                bokhirUsDun: zardal.bokhirUsDun || 0,
                usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
                tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
                tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
                tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
                suuriKhuraamj: zardal.suuriKhuraamj || 0,
                nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
                ognoonuud: zardal.ognoonuud || [],
                barilgiinId: zardal.barilgiinId || tootEntry.barilgiinId || "",
              }));

              // Extract tailbar from ashiglaltiinZardluud (combine all tailbar values if multiple exist)
              const tailbarFromZardluud =
                ashiglaltiinZardluudData
                  .map((zardal) => zardal.tailbar)
                  .filter((tailbar) => tailbar && tailbar.trim())
                  .join("; ") || "";

              const niitTulbur = ashiglaltiinZardluudData.reduce(
                (total, zardal) => {
                  const tariff = zardal.tariff || 0;
                  const isLiftItem =
                    zardal.zardliinTurul && zardal.zardliinTurul === "Лифт";
                  if (
                    isLiftItem &&
                    tootEntry.davkhar &&
                    choloolugdokhDavkhar.includes(tootEntry.davkhar)
                  ) {
                    return total;
                  }
                  return total + tariff;
                },
                0,
              );

              const duuregNer =
                targetBarilgaForToot.tokhirgoo?.duuregNer ||
                tootEntry.duureg ||
                "";
              const horooData =
                targetBarilgaForToot.tokhirgoo?.horoo || tootEntry.horoo || {};
              const horooNer = horooData.ner || "";
              const sohNer =
                targetBarilgaForToot.tokhirgoo?.sohNer || tootEntry.soh || "";

              // Create geree (contract) for this specific toot
              // Use timestamp + microsecond precision to ensure uniqueness
              const uniqueSuffix = Date.now() + i;
              const contractData = {
                gereeniiDugaar: `ГД-${uniqueSuffix.toString().slice(-8)}`,
                gereeniiOgnoo: new Date(),
                turul: "Үндсэн",
                tuluv: "Идэвхтэй",
                ovog: userData.ovog || "",
                ner: userData.ner,
                utas: [userData.utas],
                mail: userData.mail || "",
                baiguullagiinId: baiguullaga._id,
                baiguullagiinNer: baiguullaga.ner,
                barilgiinId: tootEntry.barilgiinId,
                tulukhOgnoo: new Date(),
                ashiglaltiinZardal: niitTulbur,
                niitTulbur: niitTulbur,
                toot: tootEntry.toot,
                davkhar: tootEntry.davkhar || "",
                bairNer: targetBarilgaForToot.ner || "",
                sukhBairshil: `${duuregNer}, ${horooNer}, ${sohNer}`,
                duureg: duuregNer,
                horoo: horooData,
                sohNer: sohNer,
                orts: tootEntry.orts || "",
                burtgesenAjiltan: orshinSuugch._id,
                orshinSuugchId: orshinSuugch._id.toString(),
                temdeglel: `${userData.tailbar || "Excel файлаас автоматаар үүссэн гэрээ"} (Тоот: ${tootEntry.toot})`,
                tailbar: userData.tailbar || tailbarFromZardluud || "",
                actOgnoo: new Date(),
                // ekhniiUldegdel removed
                umnukhZaalt: userData.initialMeterReading || 0,
                suuliinZaalt: userData.initialMeterReading || 0,
                zaaltTog: 0, // Day reading (will be updated later)
                zaaltUs: 0, // Night reading (will be updated later)
                zardluud: zardluudArray,
                segmentuud: [],
                khungulultuud: [],
              };

              const geree = new Geree(tukhainBaaziinKholbolt)(contractData);
              await geree.save();

              // Update davkhar with toot if provided
              if (tootEntry.toot && tootEntry.davkhar) {
                const { updateDavkharWithToot } = require("./orshinSuugch");
                await updateDavkharWithToot(
                  baiguullaga,
                  tootEntry.barilgiinId,
                  tootEntry.davkhar,
                  tootEntry.toot,
                  tukhainBaaziinKholbolt,
                );
              }

              // Create invoice for this geree
              try {
                const invoiceResult = await invoiceService.createInvoiceForContract(
                  tukhainBaaziinKholbolt,
                  geree._id,
                  {
                    billingDate: new Date(),
                    forceEmpty: false
                  }
                );

                if (!invoiceResult.success) {
                }
              } catch (invoiceError) {}
            } catch (tootGereeError) {
              // Continue with next toot if this one fails
            }
          }
        } else {
          // Backward compatibility: if toots array is empty but old fields exist, create geree for primary toot

          // Include all charges for the baiguullaga (same as regular registration)
          const zardluudArray = ashiglaltiinZardluudData.map((zardal) => ({
            ner: zardal.ner,
            turul: zardal.turul,
            zardliinTurul: zardal.zardliinTurul,
            tariff: zardal.tariff,
            tariffUsgeer: zardal.tariffUsgeer || "",
            tulukhDun: 0,
            dun: zardal.dun || 0,
            bodokhArga: zardal.bodokhArga || "",
            tseverUsDun: zardal.tseverUsDun || 0,
            bokhirUsDun: zardal.bokhirUsDun || 0,
            usKhalaasniiDun: zardal.usKhalaasniiDun || 0,
            tsakhilgaanUrjver: zardal.tsakhilgaanUrjver || 1,
            tsakhilgaanChadal: zardal.tsakhilgaanChadal || 0,
            tsakhilgaanDemjikh: zardal.tsakhilgaanDemjikh || 0,
            suuriKhuraamj: zardal.suuriKhuraamj || 0,
            nuatNemekhEsekh: zardal.nuatNemekhEsekh || false,
            ognoonuud: zardal.ognoonuud || [],
            barilgiinId: zardal.barilgiinId || finalBarilgiinId || "",
          }));

          // Extract tailbar from ashiglaltiinZardluud (combine all tailbar values if multiple exist)
          const tailbarFromZardluud =
            ashiglaltiinZardluudData
              .map((zardal) => zardal.tailbar)
              .filter((tailbar) => tailbar && tailbar.trim())
              .join("; ") || "";

          const niitTulbur = ashiglaltiinZardluudData.reduce(
            (total, zardal) => {
              const tariff = zardal.tariff || 0;
              const isLiftItem =
                zardal.zardliinTurul && zardal.zardliinTurul === "Лифт";
              if (
                isLiftItem &&
                userData.davkhar &&
                choloolugdokhDavkhar.includes(userData.davkhar)
              ) {
                return total;
              }
              return total + tariff;
            },
            0,
          );

          // Use timestamp + microsecond precision to ensure uniqueness
          const uniqueSuffix = Date.now() + i;
          const contractData = {
            gereeniiDugaar: `ГД-${uniqueSuffix.toString().slice(-8)}`,
            gereeniiOgnoo: new Date(),
            turul: "Үндсэн",
            tuluv: "Идэвхтэй",
            ovog: userData.ovog || "",
            ner: userData.ner,
            utas: [userData.utas],
            mail: userData.mail || "",
            baiguullagiinId: baiguullaga._id,
            baiguullagiinNer: baiguullaga.ner,
            barilgiinId: finalBarilgiinId || "",
            tulukhOgnoo: new Date(),
            ashiglaltiinZardal: niitTulbur,
            niitTulbur: niitTulbur,
            toot: userObject.toot || "",
            davkhar: userData.davkhar || "",
            bairNer: targetBarilga.ner || "",
            sukhBairshil: `${duuregNer}, ${horooNer}, ${sohNer}`,
            duureg: duuregNer,
            horoo: horooData,
            sohNer: sohNer,
            orts: userData.orts || "",
            burtgesenAjiltan: orshinSuugch._id,
            orshinSuugchId: orshinSuugch._id.toString(),
            temdeglel:
              userData.tailbar || "Excel файлаас автоматаар үүссэн гэрээ",
            tailbar: userData.tailbar || tailbarFromZardluud || "",
            actOgnoo: new Date(),
            // ekhniiUldegdel removed
            umnukhZaalt: userData.initialMeterReading || 0,
            suuliinZaalt: userData.initialMeterReading || 0,
            zaaltTog: 0, // Day reading (will be updated later)
            zaaltUs: 0, // Night reading (will be updated later)
            zardluud: zardluudArray,
            segmentuud: [],
            khungulultuud: [],
          };

          const geree = new Geree(tukhainBaaziinKholbolt)(contractData);
          await geree.save();

          // Update davkhar with toot if provided
          if (userObject.toot && userData.davkhar) {
            const { updateDavkharWithToot } = require("./orshinSuugch");
            await updateDavkharWithToot(
              baiguullaga,
              finalBarilgiinId,
              userData.davkhar,
              userObject.toot,
              tukhainBaaziinKholbolt,
            );
          }

            try {
              const invoiceResult = await invoiceService.createInvoiceForContract(
                tukhainBaaziinKholbolt,
                geree._id,
                {
                  billingDate: new Date(),
                  forceEmpty: false
                }
              );

              if (!invoiceResult.success) {
              }
            } catch (invoiceError) {}
        }

        results.success.push({
          row: rowNumber,
          utas: userData.utas,
          ner: userData.ner,
          message: "Амжилттай бүртгэгдлээ",
        });
      } catch (error) {
        results.failed.push({
          row: rowNumber,
          utas: row["Утас"]?.toString().trim() || "Тодорхойгүй",
          ner: row["Нэр"]?.toString().trim() || "Тодорхойгүй",
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `${results.success.length} хэрэглэгчийн бүртгэл амжилттай орлоо, ${results.failed.length} хэрэглэгчийн бүртгэл алдаатай байна`,
      result: results,
    });
  } catch (error) {
    next(error);
  }
});

// TootBurtgel Excel Template Download
exports.generateTootBurtgelExcelTemplate = asyncHandler(
  async (req, res, next) => {
    try {
      const { db } = require("zevbackv2");
      const Baiguullaga = require("../models/baiguullaga");

      const { baiguullagiinId, barilgiinId } = req.query;

      if (!baiguullagiinId) {
        throw new aldaa("Байгууллагын ID хоосон");
      }

      if (!barilgiinId) {
        throw new aldaa("Барилгын ID хоосон");
      }

      // Fetch baiguullaga to get building configuration
      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        baiguullagiinId,
      );

      if (!baiguullaga) {
        throw new aldaa("Байгууллага олдсонгүй");
      }

      // Find target building
      const targetBarilga = baiguullaga.barilguud?.find(
        (b) => String(b._id) === String(barilgiinId),
      );

      if (!targetBarilga) {
        throw new aldaa("Барилга олдсонгүй");
      }

      // Determine number of orts (entrances) from building configuration
      // Method 1: Check davkhariinToonuud keys to find unique orts values
      const davkhariinToonuud =
        targetBarilga.tokhirgoo?.davkhariinToonuud || {};
      const ortsSet = new Set();

      // Extract orts from keys like "1::5", "2::5", etc.
      Object.keys(davkhariinToonuud).forEach((key) => {
        if (key.includes("::")) {
          const parts = key.split("::");
          if (parts.length === 2) {
            ortsSet.add(parts[0].trim());
          }
        }
      });

      // Method 2: Check if there's a direct orts field in tokhirgoo
      if (ortsSet.size === 0 && targetBarilga.tokhirgoo?.orts) {
        const ortsValue = targetBarilga.tokhirgoo.orts;

        // Try to parse as a number first (handles both number and numeric string like "2")
        const ortsAsNumber =
          typeof ortsValue === "number" ? ortsValue : parseInt(ortsValue);

        if (!isNaN(ortsAsNumber) && ortsAsNumber > 0) {
          // If orts is a number, create range from 1 to orts
          for (let i = 1; i <= ortsAsNumber; i++) {
            ortsSet.add(String(i));
          }
        } else if (typeof ortsValue === "string" && ortsValue.includes(",")) {
          // If it's a comma-separated string like "1,2,3"
          ortsValue.split(",").forEach((o) => {
            const trimmed = o.trim();
            if (trimmed) ortsSet.add(trimmed);
          });
        }
      }

      // If no orts found, default to 1
      const ortsList =
        ortsSet.size > 0
          ? Array.from(ortsSet).sort((a, b) => parseInt(a) - parseInt(b))
          : ["1"];

      const wb = XLSX.utils.book_new();
      const headers = ["Давхар", "Тоот"];

      const colWidths = [
        { wch: 12 }, // Давхар (floor)
        { wch: 20 }, // Тоот (apartment number - wider for comma-separated values)
      ];

      // Create a sheet for each orts
      ortsList.forEach((orts) => {
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        ws["!cols"] = colWidths;

        const sheetName = `Орц ${orts}`;
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      const excelBuffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="tootBurtgel_import_template_${Date.now()}.xlsx"`,
      );

      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  },
);
// TootBurtgel Excel Import
exports.importTootBurtgelFromExcel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const TootBurtgel = require("../models/tootBurtgel");
    const Baiguullaga = require("../models/baiguullaga");
    const { updateDavkharWithToot } = require("./orshinSuugch");
    const { shalguurValidate } = require("../components/shalguur");

    const { baiguullagiinId, barilgiinId } = req.body;

    if (!baiguullagiinId) {
      throw new aldaa("Байгууллагын ID хоосон");
    }

    if (!req.file) {
      throw new aldaa("Excel файл оруулах");
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

    // Check if file has any sheets
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new aldaa("Excel хоосон");
    }

    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      baiguullagiinId,
    );

    if (!baiguullaga) {
      throw new aldaa("Байгууллага олдсонгүй");
    }

    const defaultBarilgiinId =
      barilgiinId ||
      (baiguullaga.barilguud && baiguullaga.barilguud.length > 0
        ? String(baiguullaga.barilguud[0]._id)
        : null);

    if (!defaultBarilgiinId) {
      throw new aldaa("Барилгын ID олдсонгүй");
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) => kholbolt.baiguullagiinId === baiguullaga._id.toString(),
    );

    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболт олдсонгүй");
    }

    // Get target barilga
    const targetBarilga = baiguullaga.barilguud?.find(
      (b) => String(b._id) === String(defaultBarilgiinId),
    );

    if (!targetBarilga) {
      throw new aldaa("Барилга олдсонгүй");
    }

    // Get or initialize davkhar array and davkhariinToonuud object
    const barilgaIndex = baiguullaga.barilguud.findIndex(
      (b) => String(b._id) === String(defaultBarilgiinId),
    );

    if (!targetBarilga.tokhirgoo) {
      targetBarilga.tokhirgoo = {};
    }

    let davkharArray = targetBarilga.tokhirgoo.davkhar || [];
    let davkhariinToonuud = targetBarilga.tokhirgoo.davkhariinToonuud || {};

    const results = {
      success: [],
      failed: [],
      total: 0,
    };

    // Process each sheet (each sheet represents one orts/entrance)
    for (const sheetName of workbook.SheetNames) {
      // Extract orts from sheet name (e.g., "Орц 1" -> "1", "Орц 2" -> "2")
      let ortsFromSheet = "1"; // Default to 1
      const ortsMatch = sheetName.match(/Орц\s*(\d+)/i);
      if (ortsMatch && ortsMatch[1]) {
        ortsFromSheet = ortsMatch[1].trim();
      }

      const worksheet = workbook.Sheets[sheetName];

      // Check raw data first (array of arrays)
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (!rawRows || rawRows.length === 0) {
        continue;
      }

      const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });

      if (!data || data.length === 0) {
        continue;
      }

      results.total += data.length;

      // Validate that this sheet has the correct columns
      const firstRow = data[0] || {};
      const columnNames = Object.keys(firstRow);

      // Should have "Давхар" and "Тоот" columns
      const requiredColumns = ["Тоот", "Давхар"];
      const hasRequiredColumns = requiredColumns.every((col) =>
        columnNames.includes(col),
      );

      if (!hasRequiredColumns) {
        results.failed.push({
          sheet: sheetName,
          error: `Шаардлагатай багануудыг олдсонгүй: ${requiredColumns.join(", ")}. Олдсон: ${columnNames.join(", ")}`,
        });
        continue;
      }

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNumber = i + 2;

        try {
          const tootRaw = row["Тоот"]?.toString().trim() || "";
          const davkhar = row["Давхар"]?.toString().trim() || "";
          // Prioritize 'Орц' column if conflicting, otherwise use sheet name
          const orts = row["Орц"]?.toString().trim() || ortsFromSheet;

          const validationErrors = [];

          if (!tootRaw) {
            validationErrors.push("Тоот хоосон");
          }

          if (!davkhar) {
            validationErrors.push("Давхар хоосон");
          }

          if (validationErrors.length > 0) {
            throw new Error(validationErrors.join(", "));
          }

          // Split toot by comma to handle multiple toots in one field (e.g., "1,2,3,4,5")
          const tootList = tootRaw
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t && t.length > 0);

          if (tootList.length === 0) {
            throw new Error("Тоот хоосон");
          }

          // Validate each individual toot
          for (const toot of tootList) {
            if (!toot || typeof toot !== "string") {
              validationErrors.push(`Тоот "${toot}" буруу форматтай байна`);
              continue;
            }
            const tootValidationError = shalguurValidate(toot, "Тоот");
            if (tootValidationError) {
              validationErrors.push(`${tootValidationError} (Тоот: "${toot}")`);
            }
          }

          if (validationErrors.length > 0) {
            throw new Error(validationErrors.join(" "));
          }

          // Create a separate tootBurtgel record for each toot
          const createdTootBurtgelIds = [];
          for (const toot of tootList) {
            // Check if tootBurtgel already exists to prevent duplicates
            const existingToot = await TootBurtgel(
              tukhainBaaziinKholbolt,
            ).findOne({
              kharagdakhDugaar: toot,
              baiguullagiinId: baiguullaga._id.toString(),
              barilgiinId: defaultBarilgiinId || "",
            });

            if (existingToot) {
              createdTootBurtgelIds.push(existingToot._id.toString());
              continue;
            }

            const tootBurtgelData = {
              kharagdakhDugaar: toot,
              zaalt: "",
              khamragdsanGereenuud: [],
              khamaarakhKheseg: "",
              ashilgakhEsekh: "",
              baiguullagiinId: baiguullaga._id.toString(),
              baiguullagiinNer: baiguullaga.ner || "",
              barilgiinId: defaultBarilgiinId || "",
            };

            // Save tootBurtgel
            const tootBurtgel = new TootBurtgel(tukhainBaaziinKholbolt)(
              tootBurtgelData,
            );
            await tootBurtgel.save();
            createdTootBurtgelIds.push(tootBurtgel._id.toString());
          }

          // Update davkhar and davkhariinToonuud if davkhar and orts are provided
          if (davkhar && tootList.length > 0) {
            const davkharStr = String(davkhar).trim();
            const ortsStr = String(orts).trim();

            // Validate that davkhar already exists in barilga - do not allow creating new davkhar
            if (!davkharArray.includes(davkharStr)) {
              // Relaxing this constraint for import? Or keeping strict?
              // User wants valid import. If Excel has floor 5 but building has only 4, it should probably fail.
              // Keeping strict as per existing code.
              throw new Error(
                `Давхар "${davkharStr}" барилгын мэдээлэлд бүртгэгдээгүй байна. Зөвхөн одоо байгаа давхарт тоот оноох боломжтой.`,
              );
            }

            // Create key format: "orts::davkhar" (e.g., "1::1", "1::2")
            const floorKey = `${ortsStr}::${davkharStr}`;

            // Get or create toot array for this floor::entrance combination
            if (!davkhariinToonuud[floorKey]) {
              davkhariinToonuud[floorKey] = [];
            }

            // Get existing toot string for this floor::entrance
            const existingToonuud = davkhariinToonuud[floorKey][0] || "";
            let existingTootList = existingToonuud
              ? existingToonuud
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t)
              : [];

            // Add all toots from the list if not already present
            for (const toot of tootList) {
              if (!existingTootList.includes(toot)) {
                existingTootList.push(toot);
              }
            }

            // Sort toots
            existingTootList.sort((a, b) => {
              // Sort numerically if possible, otherwise alphabetically
              const numA = parseInt(a);
              const numB = parseInt(b);
              if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
              }
              return a.localeCompare(b);
            });

            // Update davkhariinToonuud - store as array with comma-separated string
            davkhariinToonuud[floorKey] = [existingTootList.join(",")];
          }

          results.success.push({
            sheet: sheetName,
            row: rowNumber,
            toot: tootList.join(","),
            davkhar: davkhar || "",
            orts: orts || "",
            id: createdTootBurtgelIds.join(","),
          });
        } catch (error) {
          results.failed.push({
            sheet: sheetName,
            row: rowNumber,
            error: error.message || "Алдаа гарлаа",
            data: row,
          });
        }
      }
    }

    // Update baiguullaga with davkhar and davkhariinToonuud
    // IMPORTANT: Check if we actually processed anything before saving
    if (results.total > 0 && barilgaIndex >= 0) {
      const davkharPath = `barilguud.${barilgaIndex}.tokhirgoo.davkhar`;
      const toonuudPath = `barilguud.${barilgaIndex}.tokhirgoo.davkhariinToonuud`;

      await Baiguullaga(db.erunkhiiKholbolt).findByIdAndUpdate(
        baiguullaga._id,
        {
          $set: {
            [davkharPath]: davkharArray,
            [toonuudPath]: davkhariinToonuud,
          },
        },
      );
    }

    // Check if total processed is 0 (Validation for empty/wrong file)
    if (results.total === 0) {
      return res.status(400).json({
        success: false,
        message: "Алдаатай өгөгдөл байна",
        results,
      });
    }

    res.json({
      success: true,
      message: `${results.success.length} тоот бүртгэл амжилттай импорт хийгдлээ`,
      results: results,
    });
  } catch (error) {
    next(error);
  }
});

exports.generateInitialBalanceTemplate = asyncHandler(
  async (req, res, next) => {
    try {
      const headers = ["Утас", "Гэрээний дугаар", "Тоот", "Эхний үлдэгдэл"];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers]);

      const colWidths = [
        { wch: 15 }, // Утас
        { wch: 20 }, // Гэрээний дугаар
        { wch: 10 }, // Тоот
        { wch: 15 }, // Эхний үлдэгдэл
      ];
      ws["!cols"] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, "Эхний үлдэгдэл");

      const excelBuffer = XLSX.write(wb, {
        type: "buffer",
        bookType: "xlsx",
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="initial_balance_template_${Date.now()}.xlsx"`,
      );

      res.send(excelBuffer);
    } catch (error) {
      next(error);
    }
  },
);

exports.importInitialBalanceFromExcel = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { baiguullagiinId, barilgiinId, ognoo } = req.body;

    if (!baiguullagiinId) {
      throw new aldaa("Байгууллагын ID хоосон");
    }

    if (!req.file) {
      throw new aldaa("Excel файл оруулах");
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });

    if (!data || data.length === 0) {
      throw new aldaa("Excel хоосон");
    }

    const tukhainBaaziinKholbolt = db.kholboltuud.find(
      (kholbolt) =>
        String(kholbolt.baiguullagiinId) === String(baiguullagiinId),
    );

    if (!tukhainBaaziinKholbolt) {
      throw new aldaa("Холболт олдсонгүй");
    }

    const GereeModel = Geree(tukhainBaaziinKholbolt);
    const GuilgeeAvlaguudTulukhModel = GuilgeeAvlaguud(tukhainBaaziinKholbolt);

    const results = {
      success: [],
      failed: [],
      total: data.length,
    };

    const importOgnoo = ognoo ? new Date(ognoo) : new Date();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNumber = i + 2;

      try {
        const utas = row["Утас"]?.toString().trim();
        const gereeniiDugaar = row["Гэрээний дугаар"]?.toString().trim();
        const toot = row["Тоот"]?.toString().trim();
        const amount = parseExcelNumber(row["Эхний үлдэгдэл"]);

        if (isNaN(amount) || amount === 0) {
          results.failed.push({
            row: rowNumber,
            reason: "Дүн хоосон эсвэл 0 байна",
          });
          continue;
        }

        // Find Geree
        let query = { baiguullagiinId: String(baiguullagiinId) };
        if (barilgiinId) query.barilgiinId = String(barilgiinId);

        const orConditions = [];
        if (utas) orConditions.push({ utas: utas });
        if (gereeniiDugaar)
          orConditions.push({ gereeniiDugaar: gereeniiDugaar });
        if (toot) orConditions.push({ toot: toot });

        if (orConditions.length === 0) {
          results.failed.push({
            row: rowNumber,
            reason:
              "Утас, Гэрээний дугаар, эсвэл Тоот-ын аль нэгийг бөглөнө үү",
          });
          continue;
        }

        query.$or = orConditions;

        const geree = await GereeModel.findOne(query);

        if (!geree) {
          results.failed.push({
            row: rowNumber,
            reason: "Гэрээ олдсонгүй (Утас/Дугаар/Тоот таарахгүй байна)",
          });
          continue;
        }

        // Create initial balance record
        const newAvlaga = new GuilgeeAvlaguudTulukhModel({
          baiguullagiinId: String(baiguullagiinId),
          baiguullagiinNer: geree.baiguullagiinNer,
          barilgiinId: geree.barilgiinId,
          gereeniiId: geree._id.toString(),
          gereeniiDugaar: geree.gereeniiDugaar,
          orshinSuugchId: geree.orshinSuugchId,
          ognoo: importOgnoo,
          dun: amount,
          turul: "avlaga",

          zardliinNer: "Эхний үлдэгдэл",
          ekhniiUldegdelEsekh: true,
          source: "gar",
          tailbar: "Excel-ээр оруулсан эхний үлдэгдэл",
          guilgeeKhiisenAjiltniiNer:
            req.body.nevtersenAjiltniiToken?.ner || "System",
          guilgeeKhiisenAjiltniiId: req.body.nevtersenAjiltniiToken?.id || null,
        });

        await newAvlaga.save();


        // Note: globalUldegdel on Geree is decommissioned. 
        // Balances are now tracked solely in GuilgeeAvlaguud.

        // Also update any existing UNPAID invoices for this contract to include
        // the initial balance. Without this, invoices created before the initial
        // balance import would show a lower amount than actually owed.
        try {
          const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
          const NekhemjlekhModel = NekhemjlekhiinTuukh(tukhainBaaziinKholbolt);

          const unpaidInvoices = await NekhemjlekhModel.find({
            gereeniiId: geree._id.toString(),
            baiguullagiinId: String(baiguullagiinId),
            tuluv: { $nin: ["Төлсөн", "Хүчингүй"] },
          }).lean();

          for (const invoice of unpaidInvoices) {
            const currentNiitTulbur = invoice.niitTulbur || 0;
            const currentUldegdel = invoice.uldegdel || 0;
            const newNiitTulbur = currentNiitTulbur + amount;
            const newUldegdel = currentUldegdel + amount;

            // Update the "Эхний үлдэгдэл" row inside medeelel.zardluud
            let hasEkhniiLine = false;
            const zardluud = (invoice.medeelel?.zardluud || []).map((z) => {
              if (z.isEkhniiUldegdel || z.ner === "Эхний үлдэгдэл") {
                hasEkhniiLine = true;
                return {
                  ...z,
                  tariff: (z.tariff || 0) + amount,
                  dun: (z.dun || 0) + amount,
                  tailbar: `Excel-ээр оруулсан эхний үлдэгдэл`,
                };
              }
              return z;
            });
            // If invoice doesn't already have an opening-balance zardal row,
            // append one so manual send/sync won't "lose" imported opening balance.
            if (!hasEkhniiLine) {
              zardluud.push({
                ner: "Эхний үлдэгдэл",
                zardliinTurul: "Авлага",
                dun: amount,
                tariff: amount,
                tulukhDun: amount,
                isEkhniiUldegdel: true,
                tailbar: "Excel-ээр оруулсан эхний үлдэгдэл",
              });
            }

            await NekhemjlekhModel.findByIdAndUpdate(invoice._id, {
              $set: {
                niitTulbur: newNiitTulbur,
                niitTulburOriginal:
                  (invoice.niitTulburOriginal || invoice.niitTulbur || 0) + amount,
                // uldegdel and ekhniiUldegdel removed
                "medeelel.zardluud": zardluud,
              },
            });
          }
          // Keep contract balance and invoice balances in sync after import.
          try {
            const NekhemjlekhiinTuukhModel = require("../models/nekhemjlekhiinTuukh");
            const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
          } catch (recalcError) {
            console.error(
              "Error recalculating globalUldegdel after initial balance import:",
              recalcError,
            );
          }
        } catch (invoiceUpdateError) {
          // Non-fatal: log but don't fail the import
          console.error(
            "Error updating unpaid invoices with initial balance:",
            invoiceUpdateError,
          );
        }

        results.success.push({
          row: rowNumber,
          gereeniiDugaar: geree.gereeniiDugaar,
          amount: amount,
        });
      } catch (rowError) {
        results.failed.push({
          row: rowNumber,
          reason: rowError.message,
        });
      }
    }

    res.json({
      success: true,
      message: `${results.success.length} эхний үлдэгдэл амжилттай импортлогдлоо`,
      results,
    });
  } catch (error) {
    next(error);
  }
});
