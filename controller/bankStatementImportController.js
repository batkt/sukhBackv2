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
  return String(s).trim().toLowerCase().replace(/[\s\-_.,/()]/g, "");
}

/**
 * Robust money / number parser
 * Handles commas, spaces, currency symbols: e.g. "50,000" -> 50000, " 48,600.00 " -> 48600
 */
function parseMoney(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  const clean = String(val).replace(/,/g, "").replace(/\s/g, "").replace(/[^0-9.-]/g, "").trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
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
  const originalStr = String(desc).trim();

  // 1. Fee / Charge / Operational skip
  if (
    /^fee$/i.test(originalStr) ||
    /шимтгэл|хураамж/i.test(originalStr) ||
    /данс хөтөлсний/i.test(originalStr)
  ) {
    return { type: "FEE", isFee: true, skipSuggested: true };
  }

  const isAldangi = /^алданги/i.test(originalStr);

  // 2. 16-digit United E-bill barcode format:
  // e.g. "2003260218001490_Т.АРИУНАА_СӨХ_2025/12"
  const ebill = originalStr.match(
    /(?:алданги[.\s]*)?(\d{7})(\d{3})(\d{5})(\d{1})_([^_]+)_([^_]+)_(\d{4}\/\d{1,2})/i
  );
  if (ebill) {
    return {
      type: "EBILL",
      isAldangi,
      orgCode: ebill[1],
      bair: ebill[2],
      toot: String(parseInt(ebill[3], 10)),
      residentName: ebill[5].trim(),
      period: ebill[7].trim(),
    };
  }

  // 3. Fallback ebill pattern:
  const ebillAlt = originalStr.match(
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

  // Phone match
  const phoneMatch = originalStr.match(/\b[5-9]\d{7}\b/);
  const phone = phoneMatch ? phoneMatch[0] : null;

  // Clean a working copy of the string to avoid dates/months matching as buildings/toots
  let clean = originalStr;

  // Remove parentheses like "(ХААН БАНК ...)"
  clean = clean.replace(/\([^)]*\)/g, " ");

  // Remove QPAY and GD prefixes
  clean = clean.replace(/qpay\s*\d+/gi, " ").replace(/гд[-:]?\d+/gi, " ").replace(/ap\/\d+\/\d+/gi, " ");

  // Remove full year or year-month e.g. 2025-10, 2026.01, 2026/12, 2025/11, 2026
  clean = clean.replace(/\b202[0-9][-/.](?:0?[1-9]|1[0-2])\b/g, " ");
  clean = clean.replace(/\b202[0-9]\b/g, " ");

  // Remove month indicators e.g. "10 сар", "9 сарын", "12-R SAR", "1,2 SAR", "5-12 SAR", "10 CAP"
  clean = clean.replace(/\b(?:\d{1,2}(?:\s*,\s*\d{1,2})*|\d{1,2}\s*-\s*\d{1,2})\s*(?:-[рr]\s*)?(?:сар|cap|sar)[а-яөүёa-z]*/gi, " ");
  clean = clean.replace(/\b(?:\d{1,2})\s*(?:-[рr]\s*)?(?:сар|cap|sar)[а-яөүёa-z]*/gi, " ");

  // 4. Look for explicit bair + toot:
  // e.g. "217-56", "219-Р БАЙР 66 ТООТ", "216 БАЙР . 125 ТООТ", "217*26 ТООТ", "218Н14ТООТ", "218 6TOOT"
  const bairToot = clean.match(
    /\b(21[6-9]|\d{1,3})\s*(?:-?[рr]\s*байр|\s*ба[йи]р|\s*bair|\s*iin|\s*ийн|\s*н|\*|[-./])\s*(\d{1,4}[А-Яа-яA-Za-z]?)\s*(?:тоот|toot)?\b/i
  );
  if (bairToot) {
    return {
      type: "BAIR_TOOT",
      isAldangi,
      bair: bairToot[1],
      toot: String(bairToot[2]).replace(/^0+/, "") || bairToot[2],
      phone,
    };
  }

  // 5. Look for explicit "тоот" / "toot": e.g. "66 тоот", "502тоот", "151А тоот"
  const tootWord = clean.match(/\b(\d{1,4}[А-Яа-яA-Za-z]?)\s*(?:тоот|toot)\b/i) ||
    clean.match(/(?:тоот|toot)\s*[:.]?\s*(\d{1,4}[А-Яа-яA-Za-z]?)\b/i);
  if (tootWord) {
    return {
      type: "EXPLICIT_TOOT",
      isAldangi,
      toot: String(tootWord[1]).replace(/^0+/, "") || tootWord[1],
      phone,
    };
  }

  // 6. Look for standalone apartment numbers: e.g. "- 903", "-502", "303 -", "903"
  const standaloneToot = clean.match(/(?:^|[-_#\s])([1-9]\d{1,3}[А-Яа-яA-Za-z]?)(?:[-_#\s]|$)/);
  if (standaloneToot) {
    const candidate = standaloneToot[1];
    if (candidate.length <= 4 && Number(candidate.replace(/[^\d]/g, "")) <= 2500) {
      return {
        type: "STANDALONE_TOOT",
        isAldangi,
        toot: candidate,
        phone,
      };
    }
  }

  // 7. Operational Expense Check
  if (/харуул|lift|лифт|засвар|хүрэлхүүгээс өрөө|цалин|хог|тээвэр/i.test(originalStr)) {
    return { type: "OPERATIONAL_EXPENSE", skipSuggested: true };
  }

  return { type: "OTHER", isAldangi, phone };
}

/**
 * Compound key for deduplication
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

    // Dynamic Header Row Detection across first 15 rows
    let headerRowIdx = -1;
    for (let rIdx = 0; rIdx < Math.min(allRows.length, 15); rIdx++) {
      const row = allRows[rIdx] || [];
      const rowText = row.map((c) => String(c).toLowerCase()).join(" ");
      if (
        (rowText.includes("огноо") || rowText.includes("date")) &&
        (rowText.includes("утга") || rowText.includes("орлого") || rowText.includes("гүйлгээ") || rowText.includes("credit") || rowText.includes("description"))
      ) {
        headerRowIdx = rIdx;
        break;
      }
    }

    let dateIdx = 0;
    let timeIdx = 1;
    let journalIdx = 2;
    let branchIdx = 3;
    let descIdx = 4;
    let orlogoIdx = 5;
    let zarlagaIdx = 6;
    let balanceIdx = 7;
    let relatedAccountIdx = 8;
    let accNameIdx = 9;
    let bankIdx = 10;

    let detectedBankFromHeader = bank || "";
    let detectedAccountFromHeader = dansniiDugaar || "";

    // Extract potential metadata before header row
    for (let rIdx = 0; rIdx < (headerRowIdx !== -1 ? headerRowIdx : Math.min(allRows.length, 5)); rIdx++) {
      const rowStr = (allRows[rIdx] || []).map(String).join(" ");
      const dansMatch = rowStr.match(/(?:данс|харилцах данс|account)[\s:]*([0-9]{9,16})/i);
      if (dansMatch && !detectedAccountFromHeader) detectedAccountFromHeader = dansMatch[1];
      if (!detectedBankFromHeader) {
        if (/худалдаа хөгжил|tdb/i.test(rowStr)) detectedBankFromHeader = "tdb";
        else if (/хаан|khan/i.test(rowStr)) detectedBankFromHeader = "khanbank";
        else if (/голомт|golomt/i.test(rowStr)) detectedBankFromHeader = "golomt";
        else if (/төрийн банк|state bank/i.test(rowStr)) detectedBankFromHeader = "statebank";
        else if (/хас|xac/i.test(rowStr)) detectedBankFromHeader = "xacbank";
      }
    }

    // Map column indices from header row
    if (headerRowIdx !== -1) {
      const hRow = allRows[headerRowIdx] || [];
      hRow.forEach((cell, idx) => {
        const text = String(cell || "").toLowerCase().trim();
        if (text.includes("тайлант огноо") || text.includes("гүйлгээний огноо") || text.includes("огноо") || text === "date") {
          dateIdx = idx;
        } else if (text.includes("цаг") || text === "time") {
          timeIdx = idx;
        } else if (text.includes("журнал") || text.includes("баримтын дугаар") || text.includes("гүйлгээний дугаар") || text.includes("journal") || text.includes("tran id")) {
          journalIdx = idx;
        } else if (text.includes("салбар") || text.includes("байршил") || text.includes("branch")) {
          branchIdx = idx;
        } else if (text.includes("утга") || text.includes("тайлбар") || text.includes("description") || text.includes("гүйлгээний утга")) {
          descIdx = idx;
        } else if (text.includes("орлого") || text.includes("credit") || text.includes("орлогын дүн")) {
          orlogoIdx = idx;
        } else if (text.includes("зарлага") || text.includes("debit") || text.includes("зарлагын дүн")) {
          zarlagaIdx = idx;
        } else if (text.includes("үлдэгдэл") || text.includes("balance")) {
          balanceIdx = idx;
        } else if (text.includes("харьцсан данс") || text.includes("харьцсан дансны дугаар") || text.includes("related account")) {
          relatedAccountIdx = idx;
        } else if (text.includes("дансны нэр") || text.includes("харилцагчийн нэр") || text.includes("account name")) {
          accNameIdx = idx;
        } else if (text.includes("банкны нэр") || text === "банк" || text.includes("bank")) {
          bankIdx = idx;
        }
      });
    }

    const startIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

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
      const cKey = `${g.dansniiDugaar || ""}_${rec}_${inc}_${exp}_${dStr}_${g.time || ""
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

    const barilgaMap = new Map();
    if (orgDoc?.barilguud) {
      orgDoc.barilguud.forEach((b) => {
        const bId = String(b._id);
        const bNer = String(b.ner || "").trim();
        barilgaMap.set(bId, bNer);
        barilgaMap.set(bNer.toLowerCase(), bId);
        const numMatch = bNer.match(/\b(21[0-9]|\d{1,4})\b/);
        if (numMatch) {
          barilgaMap.set(numMatch[1], bId);
        }
      });
    }

    // Build indexing for contract matching
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
        if (!contractsByToot.has(tv)) contractsByToot.set(tv, []);
        contractsByToot.get(tv).push(g);

        if (bairNum) {
          const key = `${bairNum}_${tv}`;
          if (!contractsByBairToot.has(key)) contractsByBairToot.set(key, []);
          contractsByBairToot.get(key).push(g);
        }
      });
    });

    const parsedRows = [];
    let exactCount = 0;
    let exactAmount = 0;
    let multiCount = 0;
    let multiAmount = 0;
    let unmatchedCount = 0;
    let unmatchedAmount = 0;
    let alreadyImportedCount = 0;
    let alreadyImportedAmount = 0;
    let skipCount = 0;
    let skipAmount = 0;
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    let otherCount = 0;

    let minDate = "";
    let maxDate = "";

    for (let i = startIdx; i < allRows.length; i++) {
      const r = allRows[i];
      if (!r || !r.some((c) => c !== undefined && c !== null && c !== "")) {
        continue;
      }

      const dateStr = String(r[dateIdx] || "").trim();
      const timeStr = timeIdx !== -1 ? String(r[timeIdx] || "").trim() : "";
      const journal = journalIdx !== -1 ? String(r[journalIdx] || "").trim() : "";
      const branch = branchIdx !== -1 ? String(r[branchIdx] || "").trim() : "";
      const desc = descIdx !== -1 ? String(r[descIdx] || "").trim() : "";
      const orlogoRaw = orlogoIdx !== -1 ? parseMoney(r[orlogoIdx]) : 0;
      const zarlagaRaw = zarlagaIdx !== -1 ? parseMoney(r[zarlagaIdx]) : 0;
      const balance = balanceIdx !== -1 ? parseMoney(r[balanceIdx]) : 0;
      const relatedAccount = relatedAccountIdx !== -1 ? String(r[relatedAccountIdx] || "").trim() : "";
      const accName = accNameIdx !== -1 ? String(r[accNameIdx] || "").trim() : "";
      const rowBank = bankIdx !== -1 ? String(r[bankIdx] || detectedBankFromHeader || "").trim() : detectedBankFromHeader || "";

      // Check corrupted float decimals
      const isCorrupted =
        (!Number.isInteger(orlogoRaw) &&
          String(orlogoRaw).split(".")[1]?.length > 4) ||
        (!Number.isInteger(zarlagaRaw) &&
          String(zarlagaRaw).split(".")[1]?.length > 4);

      if (isCorrupted) {
        continue;
      }

      // Track min/max dates
      if (dateStr) {
        if (!minDate || dateStr < minDate) minDate = dateStr;
        if (!maxDate || dateStr > maxDate) maxDate = dateStr;
      }

      // If orlogoRaw > 0, it is an INCOME transaction!
      const isOrlogo = orlogoRaw > 0;
      const isExpense = !isOrlogo && zarlagaRaw > 0;
      const amount = isOrlogo ? orlogoRaw : zarlagaRaw;

      if (isOrlogo) {
        totalIncome += orlogoRaw;
        incomeCount++;
      } else if (isExpense) {
        totalExpense += zarlagaRaw;
        expenseCount++;
      } else {
        otherCount++;
      }

      // Deduplication check
      const compoundKey = makeGuilgeeCompoundKey(
        detectedAccountFromHeader || dansniiDugaar,
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
      let action = isOrlogo ? "IMPORT_AND_PAY" : "SKIP";
      let matchedGeree = null;
      let candidateGerees = [];
      let matchReason = "";

      let detectedBair = parsedDesc.bair || "";
      let detectedToot = parsedDesc.toot || "";
      let detectedName = parsedDesc.residentName || "";

      if (isAlreadyImported) {
        status = "ALREADY_IMPORTED";
        action = "SKIP";
        matchReason = "Өмнө нь системд бүртгэгдсэн гүйлгээ";
        alreadyImportedCount++;
        alreadyImportedAmount += amount;
      } else if (parsedDesc.isFee || parsedDesc.skipSuggested || !isOrlogo) {
        status = "SKIP";
        action = "SKIP";
        matchReason = parsedDesc.isFee
          ? "Банкны шимтгэл"
          : "Зарлага / Үйл ажиллагааны зардал";
        skipCount++;
        skipAmount += amount;
      } else {
        // Contract matching
        let candidates = [];

        if (detectedBair && detectedToot) {
          const key = `${detectedBair}_${detectedToot}`;
          candidates = contractsByBairToot.get(key) || [];
        } else if (detectedToot) {
          candidates = contractsByToot.get(detectedToot) || [];
        }

        // If toot was not detected in description, try matching resident name or phone
        if (!detectedToot || candidates.length === 0) {
          const searchName = cleanStr(parsedDesc.residentName || accName);
          const searchPhone = parsedDesc.phone;

          let nameMatched = [];
          if (searchPhone) {
            nameMatched = activeContracts.filter((c) =>
              c.utas && c.utas.some((u) => String(u).includes(searchPhone))
            );
          }

          if (nameMatched.length === 0 && searchName && searchName.length >= 3) {
            nameMatched = activeContracts.filter((c) => {
              const cName = cleanStr(c.ner);
              const cOvog = cleanStr(c.ovog);
              return (
                (cName && (searchName.includes(cName) || cName.includes(searchName))) ||
                (cOvog && searchName.includes(cOvog))
              );
            });
          }

          if (nameMatched.length > 0) {
            candidates = nameMatched;
            detectedToot = candidates[0].toot;
            const bNer = candidates[0].bairNer || barilgaMap.get(String(candidates[0].barilgiinId)) || "";
            const numMatch = bNer.match(/\b(21[0-9]|\d{1,4})\b/);
            if (numMatch) detectedBair = numMatch[1];
          }
        }

        if (candidates.length === 1) {
          matchedGeree = candidates[0];
          status = "EXACT";
          matchReason = `${detectedBair ? detectedBair + "-р байр, " : ""}${detectedToot} тоот таарсан`;
          exactCount++;
          exactAmount += amount;
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
            exactAmount += amount;
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
            multiAmount += amount;
          }
        } else {
          status = "UNMATCHED";
          action = "IMPORT_ONLY";
          matchReason = detectedToot
            ? `Тоот (${detectedToot}) тодорхой боловч гэрээ олдсонгүй`
            : "Тоот тодорхойгүй";
          unmatchedCount++;
          unmatchedAmount += amount;
        }
      }

      parsedRows.push({
        rowNumber: i + 1 - startIdx,
        originalIndex: i,
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
        detectedBair,
        detectedToot,
        detectedName,
        isAldangi: parsedDesc.isAldangi || false,
        status,
        action,
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
        exactAmount,
        multiCount,
        multiAmount,
        unmatchedCount,
        unmatchedAmount,
        alreadyImportedCount,
        alreadyImportedAmount,
        skipCount,
        skipAmount,
        incomeCount,
        expenseCount,
        otherCount,
        totalIncome,
        totalExpense,
        totalAmount: totalIncome + totalExpense,
        payableAmount: exactAmount,
        detectedAccount: detectedAccountFromHeader,
        detectedBank: detectedBankFromHeader,
        dateRange: { start: minDate, end: maxDate },
      },
      rows: parsedRows,
      activeContracts: activeContracts.map((c) => ({
        _id: c._id,
        gereeniiDugaar: c.gereeniiDugaar,
        bairNer: c.bairNer,
        toot: c.toot,
        ovog: c.orshinSuugchId?.ovog,
        ner: c.orshinSuugchId?.ner || c.ner,
        utas: c.orshinSuugchId?.utas,
        sarBuriinTulbur: c.sarBuriinTulbur || c.nekhemjlekhDun || 0,
      })),
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
        const orlogo = parseMoney(r.orlogo);
        const zarlaga = parseMoney(r.zarlaga);
        const amount = parseMoney(r.amount) || Math.abs(orlogo || zarlaga);
        const isOrlogo = orlogo > 0 || (orlogo === 0 && zarlaga === 0 && Number(r.amount) > 0);
        const signedAmount = isOrlogo ? amount : -amount;

        let postDate = new Date();
        if (dateStr) {
          let normalizedDate = dateStr.replace(/\./g, "-");
          // Prepend year if missing (e.g. "09-01" -> "2026-09-01")
          if (!/^\d{4}/.test(normalizedDate)) {
            const currentYear = new Date().getFullYear();
            normalizedDate = `${currentYear}-${normalizedDate}`;
          }
          const d = new Date(
            normalizedDate + (timeStr ? `T${timeStr}` : "")
          );
          if (!isNaN(d.getTime())) {
            postDate = d;
          }
        }

        let existingBankRecord = null;
        if (journal && !journal.startsWith("J-") && !journal.startsWith("EXCEL-")) {
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
          const recordId = (journal && !journal.startsWith("J-") && !journal.startsWith("EXCEL-"))
            ? journal
            : `EXCEL-${Date.now()}-${importedCount}-${Math.random().toString(36).substring(2, 6)}`;
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
            ebarimtAvsanEsekh: true,
          });
          importedCount++;
        }

        // Record payment in GuilgeeAvlaguud if action === "IMPORT_AND_PAY"
        const targetGereeId = r.matchedGeree?._id || r.matchedGereeId;
        if (r.action === "IMPORT_AND_PAY" && targetGereeId) {
          const existingPayment = await GuilgeeAvlaguudModel.findOne({
            baiguullagiinId: String(baiguullagiinId),
            bankniiGuilgeeId: String(savedBankGuilgee._id),
            gereeniiId: String(targetGereeId),
          }).lean();

          if (!existingPayment) {
            const gereeDoc = await GereeModel.findById(targetGereeId).lean();
            if (gereeDoc) {
              const y = postDate.getFullYear();
              const m = String(postDate.getMonth() + 1).padStart(2, "0");
              const day = String(postDate.getDate()).padStart(2, "0");
              const dateFormatted = `${y}.${m}.${day}`;
              const tootStr = gereeDoc.toot || r.detectedToot || "";
              const paymentTailbar = r.tailbar || `Банк тулгалт - ${dateFormatted}${tootStr ? ` - ${tootStr} тоот` : ""}`;

              await guilgeeService.recordPayment(safeConn, {
                baiguullagiinId: String(baiguullagiinId),
                baiguullagiinNer: gereeDoc.baiguullagiinNer || "",
                barilgiinId: String(gereeDoc.barilgiinId || barilgiinId || ""),
                gereeniiId: String(gereeDoc._id),
                gereeniiDugaar: gereeDoc.gereeniiDugaar || "",
                orshinSuugchId: gereeDoc.orshinSuugchId || "",
                toot: tootStr,
                ognoo: postDate,
                dun: -Math.abs(amount),
                tailbar: paymentTailbar,
                source: "bank",
                bankniiGuilgeeId: String(savedBankGuilgee._id),
                dansniiDugaar: String(dansniiDugaar || ""),
                guilgeeKhiisenAjiltniiNer: ajiltan.ner || "System",
                guilgeeKhiisenAjiltniiId: ajiltan.id || null,
              });

              await BankniiGuilgeeModel.findByIdAndUpdate(
                savedBankGuilgee._id,
                {
                  $addToSet: {
                    kholbosonTalbainId: String(gereeDoc._id),
                    kholbosonGereeniiId: String(gereeDoc._id),
                  },
                  $set: {
                    kholbosonDun: amount,
                    kholbosonAjiltniiNer: ajiltan.ner || "Бүртгэл",
                    kholbosonAjiltniiId: ajiltan.id ? String(ajiltan.id) : "",
                    tuluv: "Төлсөн",
                    status: "Холбогдсон",
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

    const io = req.app.get("socketio");
    if (io) {
      io.emit("baiguullagiin" + baiguullagiinId, {
        turul: "bankniiGuilgeeShine",
      });
    }

    if (errors.length > 0 && paidCount === 0 && importedCount === 0) {
      return res.status(400).json({
        success: false,
        aldaa: errors[0]?.error || "Гүйлгээ бүртгэхэд алдаа гарлаа",
        stats: {
          importedCount,
          paidCount,
          skippedCount,
          alreadyExistedCount,
          errorCount: errors.length,
        },
        errors: errors.slice(0, 10),
      });
    }

    res.json({
      success: true,
      message: `Амжилттай боловсрууллаа: ${importedCount} шинэ гүйлгээ оруулж, ${paidCount} төлөлт холболоо.${errors.length > 0 ? ` (${errors.length} гүйлгээ алдаатай)` : ""}`,
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
