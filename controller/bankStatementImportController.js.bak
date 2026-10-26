const asyncHandler = require("express-async-handler");
const XLSX = require("xlsx");
const { db } = require("zevbackv2");
const BankniiGuilgee = require("../models/bankniiGuilgee");
const Geree = require("../models/geree");
const Baiguullaga = require("../models/baiguullaga");
const GuilgeeAvlaguud = require("../models/guilgeeAvlaguud");
const guilgeeService = require("../services/guilgeeService");
const aldaa = require("../components/aldaa");

/**
 * Helper to ensure model connection object has .kholbolt property
 */
function getSafeConnection(kholbolt, baiguullagiinId) {
  let conn =
    kholbolt ||
    (db.kholboltuud &&
      db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(baiguullagiinId)
      )) ||
    db.erunkhiiKholbolt;

  if (!conn) {
    throw new aldaa("Байгууллагын мэдээллийн сангийн холболт олдсонгүй");
  }
  // Models expect conn.kholbolt
  if (!conn.kholbolt) {
    conn = { kholbolt: conn, baiguullagiinId };
  }
  return conn;
}

/**
 * Clean strings for comparison
 */
function cleanStr(s) {
  if (!s) return "";
  return String(s).trim().toLowerCase().replace(/[\s\-_.,/]/g, "");
}

/**
 * Toot variants (e.g., "05" <-> "5")
 */
function tootiinKhuvilbaruud(toot) {
  const tsever = String(toot ?? "").trim();
  if (!tsever) return [];
  const jagsaalt = new Set([tsever]);
  const teggui = tsever.replace(/^0+/, "");
  if (teggui) jagsaalt.add(teggui);
  if (/^\d+$/.test(tsever)) jagsaalt.add(String(Number(tsever)));
  return Array.from(jagsaalt);
}

/**
 * Parse transaction description from United E-Bill / Bank statement
 */
function parseStatementDescription(desc) {
  if (!desc) return { type: "EMPTY" };
  const str = String(desc).trim();

  // 1. Fee / Charge / Operational skip
  if (
    /^fee$/i.test(str) ||
    /шимтгэл|хураамж/i.test(str) ||
    /данс хөтөлсний/i.test(str)
  ) {
    return { type: "FEE", isFee: true, skipSuggested: true };
  }

  // 2. 16-digit United E-bill barcode format:
  // e.g. "2003260218001490_Т.АРИУНАА_СӨХ_2025/12"
  // or "Алданги. 2003260219000490_Ц.ДАВААХҮҮ_СӨХ_2025/11"
  const isAldangi = /^алданги/i.test(str);
  const ebill = str.match(
    /(?:алданги[.\s]*)?(\d{7})(\d{3})(\d{5})(\d{1})_([^_]+)_([^_]+)_(\d{4}\/\d{1,2})/i
  );
  if (ebill) {
    return {
      type: "EBILL",
      isAldangi,
      orgCode: ebill[1],
      bair: ebill[2], // e.g. "218"
      toot: String(parseInt(ebill[3], 10)), // e.g. "149"
      residentName: ebill[5].trim(),
      period: ebill[7].trim(),
    };
  }

  // 3. Fallback ebill pattern with varying prefix length:
  const ebillAlt = str.match(
    /(?:алданги[.\s]*)?(\d{14,18})_([^_]+)_([^_]+)_(\d{4}\/\d{1,2})/i
  );
  if (ebillAlt) {
    const code = ebillAlt[1];
    let bair = null;
    let toot = null;
    if (code.length >= 15) {
      bair = code.substring(7, 10);
      toot = String(parseInt(code.substring(10, 15), 10));
    }
    return {
      type: "EBILL",
      isAldangi,
      bair,
      toot,
      residentName: ebillAlt[2].trim(),
      period: ebillAlt[4].trim(),
    };
  }

  // 4. Flexible building and toot:
  // e.g. "217-56 94192889", "219-Р БАЙР 66 ТООТ", "216 БАЙР . 125 ТООТ", "217*26 ТООТ", "218Н14ТООТ", "218 6TOOT"
  const flexible = str.match(
    /\b(21[0-9]|\d{1,3})\s*(?:-?[рr]|\s*ба[йи]р|\s*bair|\s*iin|\s*ийн|\s*н|\*|[-./])*\s*(\d{1,4})\s*(?:тоот|toot)?\b/i
  );
  if (flexible) {
    const phoneMatch = str.match(/[5-9]\d{7}/);
    return {
      type: "MANUAL_BAIR_TOOT",
      isAldangi,
      bair: flexible[1],
      toot: String(parseInt(flexible[2], 10)),
      phone: phoneMatch ? phoneMatch[0] : null,
    };
  }

  // 5. Reversed building & toot:
  // e.g. "БАЙР 216 ... 125 ТООТ" or "216 ... ТООТ 125"
  const rev =
    str.match(
      /(?:ба[йи]р|bair)\s*[:.]?\s*(\d{1,4}).*?(?:тоот|toot)\s*[:.]?\s*(\d{1,4})/i
    ) || str.match(/\b(21[0-9]).*?(?:тоот|toot)\s*[:.]?\s*(\d{1,4})/i);
  if (rev) {
    const phoneMatch = str.match(/[5-9]\d{7}/);
    return {
      type: "REVERSED_BAIR_TOOT",
      isAldangi,
      bair: rev[1],
      toot: String(parseInt(rev[2], 10)),
      phone: phoneMatch ? phoneMatch[0] : null,
    };
  }

  // 6. Generic toot only:
  // e.g. "143 тоот", "605TOOT"
  const tootMatch =
    str.match(/(\d{1,4})\s*(?:тоот|toot)\b/i) ||
    str.match(/(?:тоот|toot)\s*(\d{1,4})\b/i);
  if (tootMatch) {
    const phoneMatch = str.match(/[5-9]\d{7}/);
    return {
      type: "GENERIC_TOOT",
      isAldangi,
      toot: String(parseInt(tootMatch[1], 10)),
      phone: phoneMatch ? phoneMatch[0] : null,
    };
  }

  // 7. QPay
  if (/qpay/i.test(str)) {
    return { type: "QPAY", isQpay: true };
  }

  // 8. Other / Expense
  if (/харуул|lift|лифт|засвар|хүрэлхүүгээс өрөө/i.test(str)) {
    return { type: "OPERATIONAL_EXPENSE", skipSuggested: true };
  }

  return { type: "OTHER" };
}

/**
 * Generate compound deduplication key
 */
function makeGuilgeeCompoundKey(dansniiDugaar, journal, orlogo, zarlaga, date, time) {
  const j = String(journal || "").trim();
  const d = String(date || "").trim();
  const t = String(time || "").trim();
  const inc = Number(orlogo) || 0;
  const exp = Number(zarlaga) || 0;
  return `${dansniiDugaar || ""}_${j}_${inc}_${exp}_${d}_${t}`;
}

/**
 * POST /bankniiGuilgee/excelPreview
 * Parse uploaded Excel, cross-reference DB (Deduplication + Resident Matching), return preview
 */
exports.bankStatementPreview = asyncHandler(async (req, res, next) => {
  try {
    const baiguullagiinId =
      req.body.baiguullagiinId ||
      req.body.nevtersenAjiltniiToken?.baiguullagiinId;
    const { barilgiinId, dansniiDugaar, bank } = req.body;

    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон байна");
    if (!req.file || !req.file.buffer) {
      throw new aldaa("Excel файл сонгоно уу");
    }

    const safeConn = getSafeConnection(
      req.body.tukhainBaaziinKholbolt,
      baiguullagiinId
    );

    // Read Excel
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    if (!allRows || allRows.length === 0) {
      throw new aldaa("Excel файл хоосон байна");
    }

    // Determine if Row 0 is header or data
    let hasHeader = false;
    const row0 = allRows[0] || [];
    const r0Text = row0.map((c) => String(c).toLowerCase()).join(" ");
    if (
      r0Text.includes("огноо") ||
      r0Text.includes("утга") ||
      r0Text.includes("орлого")
    ) {
      hasHeader = true;
    }

    const startIdx = hasHeader ? 1 : 0;

    // Fetch existing BankniiGuilgee for deduplication
    const BankniiGuilgeeModel = BankniiGuilgee(safeConn, false);
    const existingGuilgeenuud = await BankniiGuilgeeModel.find({
      baiguullagiinId: String(baiguullagiinId),
    })
      .select(
        "record tranId amount Amt tranAmount income outcome postDate tranDate dansniiDugaar description time kholbosonTalbainId"
      )
      .lean();

    const existingJournalSet = new Set();
    const existingCompoundKeySet = new Set();

    existingGuilgeenuud.forEach((g) => {
      const rec = String(g.record || g.tranId || "").trim();
      if (rec) existingJournalSet.add(rec);

      const d = g.postDate || g.tranDate || "";
      const dStr = d ? new Date(d).toISOString().split("T")[0] : "";
      const inc = Number(g.income || (g.amount > 0 ? g.amount : 0) || 0);
      const exp = Number(
        g.outcome || (g.amount < 0 ? Math.abs(g.amount) : 0) || 0
      );
      const cKey = `${g.dansniiDugaar || ""}_${rec}_${inc}_${exp}_${dStr}_${
        g.time || ""
      }`;
      existingCompoundKeySet.add(cKey);
    });

    // Fetch active contracts for this organization
    const GereeModel = Geree(safeConn, false);
    const contractMatch = {
      baiguullagiinId: String(baiguullagiinId),
      tuluv: { $ne: "Цуцалсан" },
    };
    if (barilgiinId) contractMatch.barilgiinId = String(barilgiinId);

    const activeContracts = await GereeModel.find(contractMatch)
      .select(
        "_id gereeniiDugaar ovog ner utas toot davkhar bairNer barilgiinId orshinSuugchId updatedAt"
      )
      .lean();

    // Fetch organization & buildings for building name mapping
    const orgDoc = await Baiguullaga(db.erunkhiiKholbolt || safeConn)
      .findById(baiguullagiinId)
      .select("barilguud")
      .lean()
      .catch(() => null);

    const barilgaMap = new Map(); // id -> name, and name -> id
    if (orgDoc?.barilguud) {
      orgDoc.barilguud.forEach((b) => {
        const bId = String(b._id);
        const bNer = String(b.ner || "").trim();
        barilgaMap.set(bId, bNer);
        barilgaMap.set(bNer.toLowerCase(), bId);
        // Extract numeric part, e.g. "216-р байр" -> "216"
        const numMatch = bNer.match(/\b(21[0-9]|\d{1,4})\b/);
        if (numMatch) {
          barilgaMap.set(numMatch[1], bId);
        }
      });
    }

    // Build indexing for fast & accurate contract matching
    // Index 1: "bair_toot" -> contracts[]
    // Index 2: "toot" -> contracts[]
    const contractsByBairToot = new Map();
    const contractsByToot = new Map();

    activeContracts.forEach((g) => {
      const tootVariants = tootiinKhuvilbaruud(g.toot);
      const bNer = String(
        g.bairNer || barilgaMap.get(String(g.barilgiinId)) || ""
      ).trim();
      const numMatch = bNer.match(/\b(21[0-9]|\d{1,4})\b/);
      const bairNum = numMatch ? numMatch[1] : bNer;

      tootVariants.forEach((tv) => {
        // Toot index
        if (!contractsByToot.has(tv)) contractsByToot.set(tv, []);
        contractsByToot.get(tv).push(g);

        // Bair + Toot index
        if (bairNum) {
          const key = `${bairNum}_${tv}`;
          if (!contractsByBairToot.has(key)) contractsByBairToot.set(key, []);
          contractsByBairToot.get(key).push(g);
        }
      });
    });

    const parsedRows = [];
    let exactCount = 0;
    let multiCount = 0;
    let unmatchedCount = 0;
    let alreadyImportedCount = 0;
    let skipCount = 0;
    let totalIncome = 0;
    let totalExpense = 0;

    for (let i = startIdx; i < allRows.length; i++) {
      const r = allRows[i];
      if (!r || !r.some((c) => c !== undefined && c !== null && c !== "")) {
        continue;
      }

      const dateStr = String(r[0] || "").trim();
      const timeStr = String(r[1] || "").trim();
      const journal = String(r[2] || "").trim();
      const branch = String(r[3] || "").trim();
      const desc = String(r[4] || "").trim();
      const orlogoRaw = Number(r[5]) || 0;
      const zarlagaRaw = Number(r[6]) || 0;
      const balance = Number(r[7]) || 0;
      const relatedAccount = String(r[8] || "").trim();
      const accName = String(r[9] || "").trim();
      const rowBank = String(r[10] || bank || "").trim();

      // Check corrupted float decimals (like 53453.902759...)
      const isCorrupted =
        (!Number.isInteger(orlogoRaw) &&
          String(orlogoRaw).split(".")[1]?.length > 4) ||
        (!Number.isInteger(zarlagaRaw) &&
          String(zarlagaRaw).split(".")[1]?.length > 4);

      if (isCorrupted) {
        // Skip corrupted row completely
        continue;
      }

      const isOrlogo = orlogoRaw > 0;
      const amount = isOrlogo ? orlogoRaw : zarlagaRaw;
      if (isOrlogo) totalIncome += orlogoRaw;
      else totalExpense += zarlagaRaw;

      // Deduplication check
      const compoundKey = makeGuilgeeCompoundKey(
        dansniiDugaar,
        journal,
        orlogoRaw,
        zarlagaRaw,
        dateStr,
        timeStr
      );

      const isAlreadyImported =
        (journal && existingJournalSet.has(journal)) ||
        existingCompoundKeySet.has(compoundKey);

      // Parse description
      const parsedDesc = parseStatementDescription(desc);

      let status = "UNMATCHED";
      let action = isOrlogo ? "IMPORT_AND_PAY" : "IMPORT_ONLY";
      let matchedGeree = null;
      let candidateGerees = [];
      let matchReason = "";

      if (isAlreadyImported) {
        status = "ALREADY_IMPORTED";
        action = "SKIP";
        matchReason = "Өмнө нь системд бүртгэгдсэн гүйлгээ";
        alreadyImportedCount++;
      } else if (parsedDesc.skipSuggested || !isOrlogo || parsedDesc.isFee) {
        status = "SKIP";
        action = "SKIP";
        matchReason = parsedDesc.isFee
          ? "Банкны шимтгэл"
          : "Зарлага / Үйл ажиллагааны зардал";
        skipCount++;
      } else {
        // Match against contracts
        let candidates = [];
        const detectedBair = parsedDesc.bair;
        const detectedToot = parsedDesc.toot;

        if (detectedBair && detectedToot) {
          const key = `${detectedBair}_${detectedToot}`;
          candidates = contractsByBairToot.get(key) || [];
        } else if (detectedToot) {
          candidates = contractsByToot.get(detectedToot) || [];
        }

        if (candidates.length === 1) {
          matchedGeree = candidates[0];
          status = "EXACT";
          matchReason = `${detectedBair ? detectedBair + "-р байр, " : ""}${detectedToot} тоот таарсан`;
          exactCount++;
        } else if (candidates.length > 1) {
          // Tiebreaker: match by resident name or phone
          const targetName = cleanStr(parsedDesc.residentName || accName);
          const targetPhone = parsedDesc.phone;

          const exactNameMatches = candidates.filter((c) => {
            const cName = cleanStr(c.ner);
            const cOvog = cleanStr(c.ovog);
            if (
              targetPhone &&
              c.utas &&
              c.utas.some((u) => String(u).includes(targetPhone))
            ) {
              return true;
            }
            if (
              targetName &&
              (cName.includes(targetName) ||
                targetName.includes(cName) ||
                cOvog.includes(targetName))
            ) {
              return true;
            }
            return false;
          });

          if (exactNameMatches.length === 1) {
            matchedGeree = exactNameMatches[0];
            status = "EXACT";
            matchReason = `${detectedBair ? detectedBair + "-р байр, " : ""}${detectedToot} тоот, нэр таарсан`;
            exactCount++;
          } else {
            status = "MULTI";
            candidateGerees = candidates.map((c) => ({
              _id: c._id,
              gereeniiDugaar: c.gereeniiDugaar,
              bairNer:
                c.bairNer || barilgaMap.get(String(c.barilgiinId)) || "",
              toot: c.toot,
              ovog: c.ovog || "",
              ner: c.ner || "",
              utas: c.utas || [],
            }));
            matchedGeree = candidates[0]; // Preselect latest
            matchReason = `Тухайн тоот дээр ${candidates.length} гэрээ олдлоо`;
            multiCount++;
          }
        } else {
          status = "UNMATCHED";
          action = "IMPORT_ONLY";
          matchReason = detectedToot
            ? `Тоот (${detectedToot}) тодорхой боловч гэрээ олдсонгүй`
            : "Тоот тодорхойгүй";
          unmatchedCount++;
        }
      }

      parsedRows.push({
        rowNumber: i + 1,
        date: dateStr,
        time: timeStr,
        journal,
        branch,
        description: desc,
        orlogo: orlogoRaw,
        zarlaga: zarlagaRaw,
        amount,
        balance,
        relatedAccount,
        accName,
        bank: rowBank,
        detectedBair: parsedDesc.bair || "",
        detectedToot: parsedDesc.toot || "",
        detectedName: parsedDesc.residentName || "",
        isAldangi: parsedDesc.isAldangi || false,
        status, // "EXACT" | "MULTI" | "UNMATCHED" | "ALREADY_IMPORTED" | "SKIP"
        action, // "IMPORT_AND_PAY" | "IMPORT_ONLY" | "SKIP"
        matchReason,
        matchedGeree: matchedGeree
          ? {
              _id: matchedGeree._id,
              gereeniiDugaar: matchedGeree.gereeniiDugaar,
              bairNer:
                matchedGeree.bairNer ||
                barilgaMap.get(String(matchedGeree.barilgiinId)) ||
                "",
              toot: matchedGeree.toot,
              ovog: matchedGeree.ovog || "",
              ner: matchedGeree.ner || "",
              utas: matchedGeree.utas || [],
              orshinSuugchId: matchedGeree.orshinSuugchId || "",
              barilgiinId: matchedGeree.barilgiinId || "",
            }
          : null,
        candidateGerees,
      });
    }

    res.json({
      success: true,
      summary: {
        totalRows: parsedRows.length,
        exactCount,
        multiCount,
        unmatchedCount,
        alreadyImportedCount,
        skipCount,
        totalIncome,
        totalExpense,
        payableAmount: parsedRows
          .filter((r) => r.status === "EXACT" && r.action === "IMPORT_AND_PAY")
          .reduce((sum, r) => sum + r.amount, 0),
      },
      rows: parsedRows,
    });
  } catch (error) {
    console.error("❌ [EXCEL PREVIEW ALDAA]:", error);
    res.status(400).json({
      success: false,
      aldaa: error.message || "Хуулга уншихад алдаа гарлаа",
    });
  }
});

/**
 * POST /bankniiGuilgee/excelConfirmImport
 * Commit confirmed rows to BankniiGuilgee and record payments in GuilgeeAvlaguud
 */
exports.bankStatementConfirmImport = asyncHandler(async (req, res, next) => {
  try {
    const baiguullagiinId =
      req.body.baiguullagiinId ||
      req.body.nevtersenAjiltniiToken?.baiguullagiinId;
    const { barilgiinId, dansniiDugaar, bank, rows } = req.body;

    if (!baiguullagiinId) throw new aldaa("Байгууллагын ID хоосон байна");
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new aldaa("Бүртгэх гүйлгээ сонгогдоогүй байна");
    }

    const safeConn = getSafeConnection(
      req.body.tukhainBaaziinKholbolt,
      baiguullagiinId
    );

    const BankniiGuilgeeModel = BankniiGuilgee(safeConn);
    const GuilgeeAvlaguudModel = GuilgeeAvlaguud(safeConn);
    const GereeModel = Geree(safeConn, false);
    const ajiltan = req.body.nevtersenAjiltniiToken || {};

    let importedCount = 0;
    let paidCount = 0;
    let skippedCount = 0;
    let alreadyExistedCount = 0;
    const errors = [];

    for (const r of rows) {
      if (r.action === "SKIP") {
        skippedCount++;
        continue;
      }

      try {
        const journal = String(r.journal || "").trim();
        const dateStr = String(r.date || "").trim();
        const timeStr = String(r.time || "").trim();
        const orlogo = Number(r.orlogo) || 0;
        const zarlaga = Number(r.zarlaga) || 0;
        const amount = Number(r.amount) || Math.abs(orlogo || zarlaga);
        const isOrlogo = orlogo > 0;
        const signedAmount = isOrlogo ? amount : -amount;

        // Parse date
        let postDate = new Date();
        if (dateStr) {
          const d = new Date(
            dateStr.replace(/\./g, "-") + (timeStr ? `T${timeStr}` : "")
          );
          if (!isNaN(d.getTime())) postDate = d;
        }

        // Deduplication check: check if BankniiGuilgee already exists
        let existingBankRecord = null;
        if (journal) {
          existingBankRecord = await BankniiGuilgeeModel.findOne({
            baiguullagiinId: String(baiguullagiinId),
            $or: [{ record: journal }, { tranId: journal }],
          });
        }

        let savedBankGuilgee = null;
        if (existingBankRecord) {
          savedBankGuilgee = existingBankRecord;
          alreadyExistedCount++;
        } else {
          // Create new BankniiGuilgee
          const recordId = journal || `EXCEL-${Date.now()}-${importedCount}`;
          savedBankGuilgee = await BankniiGuilgeeModel.create({
            baiguullagiinId: String(baiguullagiinId),
            barilgiinId: barilgiinId
              ? String(barilgiinId)
              : r.matchedGeree?.barilgiinId || "",
            dansniiDugaar: String(dansniiDugaar || ""),
            bank: bank || r.bank || "khanbank",
            record: recordId,
            tranId: recordId,
            postDate,
            tranDate: postDate,
            time: timeStr,
            description: r.description || "Дансны хуулга Excel",
            amount: signedAmount,
            Amt: signedAmount,
            tranAmount: amount,
            income: isOrlogo ? amount : 0,
            outcome: isOrlogo ? 0 : amount,
            drOrCr: isOrlogo ? "Credit" : "Debit",
            relatedAccount: r.relatedAccount || "",
            accName: r.accName || "",
            kholbosonTalbainId: [],
            kholbosonGereeniiId: [],
            // Prevent duplicate ebarimt generation for united ebill payments
            ebarimtAvsanEsekh: true,
          });
          importedCount++;
        }

        // Record payment in GuilgeeAvlaguud if action === "IMPORT_AND_PAY"
        const targetGereeId = r.matchedGeree?._id || r.matchedGereeId;
        if (r.action === "IMPORT_AND_PAY" && targetGereeId) {
          // Check if payment already recorded for this bank transaction
          const existingPayment = await GuilgeeAvlaguudModel.findOne({
            baiguullagiinId: String(baiguullagiinId),
            bankniiGuilgeeId: String(savedBankGuilgee._id),
          }).lean();

          if (!existingPayment) {
            const gereeDoc = await GereeModel.findById(targetGereeId).lean();
            if (gereeDoc) {
              await guilgeeService.recordPayment(safeConn, {
                baiguullagiinId: String(baiguullagiinId),
                baiguullagiinNer: gereeDoc.baiguullagiinNer || "",
                barilgiinId: String(gereeDoc.barilgiinId || barilgiinId || ""),
                gereeniiId: String(gereeDoc._id),
                gereeniiDugaar: gereeDoc.gereeniiDugaar || "",
                orshinSuugchId: gereeDoc.orshinSuugchId || "",
                toot: gereeDoc.toot || r.detectedToot || "",
                ognoo: postDate,
                dun: -Math.abs(amount),
                tailbar:
                  r.description ||
                  `Дансны хуулга ${gereeDoc.toot || ""} тоот`,
                source: "bank_excel",
                bankniiGuilgeeId: String(savedBankGuilgee._id),
                dansniiDugaar: String(dansniiDugaar || ""),
                guilgeeKhiisenAjiltniiNer: ajiltan.ner || "System",
                guilgeeKhiisenAjiltniiId: ajiltan.id || null,
              });

              // Link to contract on BankniiGuilgee
              await BankniiGuilgeeModel.findByIdAndUpdate(
                savedBankGuilgee._id,
                {
                  $addToSet: {
                    kholbosonTalbainId: String(gereeDoc._id),
                    kholbosonGereeniiId: String(gereeDoc._id),
                  },
                  $set: {
                    kholbosonAjiltniiNer: ajiltan.ner || "",
                    kholbosonAjiltniiId: ajiltan.id ? String(ajiltan.id) : "",
                  },
                }
              );

              paidCount++;
            }
          }
        }
      } catch (rowErr) {
        errors.push({ rowNumber: r.rowNumber, error: rowErr.message });
      }
    }

    // Emit socket event to notify frontend
    const io = req.app.get("socketio");
    if (io) {
      io.emit("baiguullagiin" + baiguullagiinId, {
        turul: "bankniiGuilgeeShine",
      });
    }

    res.json({
      success: true,
      message: `Амжилттай боловсрууллаа: ${importedCount} шинэ гүйлгээ оруулж, ${paidCount} төлөлт холболоо.`,
      stats: {
        importedCount,
        paidCount,
        skippedCount,
        alreadyExistedCount,
        errorCount: errors.length,
      },
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("❌ [EXCEL CONFIRM IMPORT ALDAA]:", error);
    res.status(400).json({
      success: false,
      aldaa: error.message || "Гүйлгээ баталгаажуулахад алдаа гарлаа",
    });
  }
});
