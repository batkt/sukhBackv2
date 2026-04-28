const asyncHandler = require("express-async-handler");
const GereeniiZagvar = require("../models/gereeniiZagvar");
const Geree = require("../models/geree");
const OrshinSuugch = require("../models/orshinSuugch");
const Baiguullaga = require("../models/baiguullaga");
const NekhemjlekhiinTuukh = require("../models/nekhemjlekhiinTuukh");
const AshiglaltiinZardluud = require("../models/ashiglaltiinZardluud");
const { toWords } = require("mon_num");

// Helper function to get value from geree, orshinSuugch, baiguullaga, nekhemjlekh, or ashiglaltiinZardluud based on tag type
function getVariableValue(
  tagType,
  geree,
  orshinSuugch,
  baiguullaga,
  nekhemjlekh,
  ashiglaltiinZardluud
) {
  // Format date to Mongolian format (YYYY оны MM сарын DD)
  function formatDate(date) {
    if (!date) return "";
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year} оны ${month} сарын ${day}`;
  }

  // Format date to simple format (YYYY-MM-DD)
  function formatDateSimple(date) {
    if (!date) return "";
    return new Date(date).toISOString().split("T")[0];
  }

  // Format number to currency
  function formatCurrency(amount) {
    if (!amount && amount !== 0) return "0";
    return Number(amount).toLocaleString("mn-MN");
  }

  // Convert number to words (Mongolian)
  function numberToWords(number, bukhel = "төгрөг", butarhai = "мөнгө") {
    if (!number && number !== 0) return "";
    const fixed = 2;
    let resValue = "";
    const value = Number(number).toFixed(fixed).toString();
    if (value.includes(".")) {
      resValue = toWords(Number(value.split(".")[0]), { suffix: "n" });
      if (bukhel) resValue += ` ${bukhel}`;
      if (Number(value.split(".")[1]) > 0) {
        resValue += ` ${toWords(Number(value.split(".")[1]), { suffix: "n" })}`;
        if (butarhai) resValue += ` ${butarhai}`;
      }
    } else {
      resValue = toWords(Number(value), { suffix: "n" });
      if (bukhel) resValue += ` ${bukhel}`;
    }
    return resValue;
  }

  // Handle arrays (like utas)
  function formatArray(arr) {
    if (!arr) return "";
    if (Array.isArray(arr)) {
      return arr.join(", ");
    }
    return String(arr);
  }

  // Handle nested objects (like horoo)
  function formatObject(obj) {
    if (!obj) return "";
    if (typeof obj === "object" && obj.ner) {
      return obj.ner;
    }
    if (typeof obj === "object" && obj.kod) {
      return obj.kod;
    }
    return String(obj);
  }

  // Calculate contract duration in months
  function calculateKhugatsaa(ekhlekhOgnoo, duusakhOgnoo) {
    if (!ekhlekhOgnoo || !duusakhOgnoo) return "";
    const start = new Date(ekhlekhOgnoo);
    const end = new Date(duusakhOgnoo);
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    return months > 0 ? `${months} сар` : "";
  }

  let value = null;

  // Special handling for specific variables
  switch (tagType) {
    // Basic information
    case "ovog":
      value = geree?.ovog || orshinSuugch?.ovog || "";
      break;
    case "ner":
      value = geree?.ner || orshinSuugch?.ner || "";
      break;
    case "utas":
      value = geree?.utas || orshinSuugch?.utas || "";
      if (Array.isArray(value)) value = formatArray(value);
      break;
    case "mail":
      value = geree?.mail || orshinSuugch?.mail || "";
      break;
    case "khayag":
      value = geree?.sukhBairshil || orshinSuugch?.khayag || "";
      break;
    case "baingiinKhayag":
      value = geree?.baingiinKhayag || "";
      break;
    case "register":
      value = geree?.register || orshinSuugch?.register || "";
      break;
    case "gereeniiDugaar":
      value = geree?.gereeniiDugaar || "";
      break;
    case "gereeniiOgnoo":
      // Get from nekhemjlekh.ognoo (invoice date) first, then fallback to geree.gereeniiOgnoo
      value = nekhemjlekh?.ognoo || geree?.gereeniiOgnoo || "";
      if (value) return formatDate(value);
      return "";
    case "turul":
      value = geree?.turul || "";
      break;

    // SUH information (from baiguullaga - baiguullaga is SUH)
    case "suhNer":
      value = baiguullaga?.ner || geree?.suhNer || "";
      break;
    case "suhRegister":
      value = baiguullaga?.register || geree?.suhRegister || "";
      break;
    case "suhUtas":
      value = baiguullaga?.utas || geree?.suhUtas || "";
      if (Array.isArray(value)) value = formatArray(value);
      break;
    case "suhMail":
      value = baiguullaga?.mail || geree?.suhMail || "";
      if (Array.isArray(value)) value = formatArray(value);
      break;

    // Duration
    case "khugatsaa":
      value = geree?.khugatsaa || "";
      if (value) return `${value} сар`;
      return "";
    case "tulukhOgnoo":
      value = geree?.tulukhOgnoo || "";
      if (value) return formatDate(value);
      return "";
    case "gereeniiKhugatsaa":
      // Calculate from ekhlekhOgnoo and duusakhOgnoo
      const ekhlekhOgnoo = geree?.ekhlekhOgnoo || geree?.gereeniiOgnoo;
      const duusakhOgnoo = geree?.duusakhOgnoo;
      if (ekhlekhOgnoo && duusakhOgnoo) {
        value = calculateKhugatsaa(ekhlekhOgnoo, duusakhOgnoo);
      } else if (geree?.khugatsaa) {
        // Fallback to khugatsaa field if dates not available
        value = `${geree.khugatsaa} сар`;
      }
      if (value) return value;
      return "";
    case "TulultHiigdehOgnoo":
      value = geree?.tulukhOgnoo || "";
      if (value) return formatDate(value);
      return "";

    // Payment (from ashiglaltiinZardluud - expense/charge configuration)
    case "suhTulbur":
      // Get suhTulbur from ashiglaltiinZardluud where zardliinTurul is "СӨХ"
      if (ashiglaltiinZardluud && Array.isArray(ashiglaltiinZardluud)) {
        value = ashiglaltiinZardluud
          .filter(
            (z) =>
              z.zardliinTurul === "СӨХ" || z.ner?.toLowerCase().includes("suh")
          )
          .reduce((sum, z) => sum + (z.tariff || z.dun || 0), 0);
      } else if (nekhemjlekh?.medeelel?.zardluud) {
        const suhZardal = nekhemjlekh.medeelel.zardluud.find(
          (z) =>
            z.zardliinTurul === "СӨХ" || z.ner?.toLowerCase().includes("suh")
        );
        value = suhZardal?.tariff || suhZardal?.tulukhDun || 0;
      } else {
        value = geree?.suhTulbur || 0;
      }
      if (value || value === 0) return formatCurrency(value);
      return "0";
    case "suhTulburUsgeer":
      if (ashiglaltiinZardluud && Array.isArray(ashiglaltiinZardluud)) {
        value = ashiglaltiinZardluud
          .filter(
            (z) =>
              z.zardliinTurul === "СӨХ" || z.ner?.toLowerCase().includes("suh")
          )
          .reduce((sum, z) => sum + (z.tariff || z.dun || 0), 0);
      } else if (nekhemjlekh?.medeelel?.zardluud) {
        const suhZardal = nekhemjlekh.medeelel.zardluud.find(
          (z) =>
            z.zardliinTurul === "СӨХ" || z.ner?.toLowerCase().includes("suh")
        );
        value = suhZardal?.tariff || suhZardal?.tulukhDun || 0;
      } else {
        value = geree?.suhTulbur || 0;
      }
      if (value || value === 0) return numberToWords(value);
      return "";
    case "ashiglaltiinZardal":
      // Get ashiglaltiinZardal from ashiglaltiinZardluud (sum of all non-SUH zardluud)
      if (ashiglaltiinZardluud && Array.isArray(ashiglaltiinZardluud)) {
        value = ashiglaltiinZardluud
          .filter(
            (z) =>
              z.zardliinTurul !== "СӨХ" && !z.ner?.toLowerCase().includes("suh")
          )
          .reduce((sum, z) => sum + (z.tariff || z.dun || 0), 0);
      } else if (nekhemjlekh?.medeelel?.zardluud) {
        value = nekhemjlekh.medeelel.zardluud
          .filter(
            (z) =>
              z.zardliinTurul !== "СӨХ" && !z.ner?.toLowerCase().includes("suh")
          )
          .reduce((sum, z) => sum + (z.tariff || z.tulukhDun || 0), 0);
      } else {
        value = geree?.ashiglaltiinZardal || 0;
      }
      if (value || value === 0) return formatCurrency(value);
      return "0";
    case "ashiglaltiinZardalUsgeer":
      if (ashiglaltiinZardluud && Array.isArray(ashiglaltiinZardluud)) {
        value = ashiglaltiinZardluud
          .filter(
            (z) =>
              z.zardliinTurul !== "СӨХ" && !z.ner?.toLowerCase().includes("suh")
          )
          .reduce((sum, z) => sum + (z.tariff || z.dun || 0), 0);
      } else if (nekhemjlekh?.medeelel?.zardluud) {
        value = nekhemjlekh.medeelel.zardluud
          .filter(
            (z) =>
              z.zardliinTurul !== "СӨХ" && !z.ner?.toLowerCase().includes("suh")
          )
          .reduce((sum, z) => sum + (z.tariff || z.tulukhDun || 0), 0);
      } else {
        value = geree?.ashiglaltiinZardal || 0;
      }
      if (value || value === 0) return numberToWords(value);
      return "";
    case "niitTulbur":
      // Get niitTulbur from ashiglaltiinZardluud (sum of all tariff/dun)
      if (ashiglaltiinZardluud && Array.isArray(ashiglaltiinZardluud)) {
        value = ashiglaltiinZardluud.reduce(
          (sum, z) => sum + (z.tariff || z.dun || 0),
          0
        );
      } else if (nekhemjlekh?.niitTulbur) {
        value = nekhemjlekh.niitTulbur;
      } else {
        value = geree?.niitTulbur || 0;
      }
      if (value || value === 0) return formatCurrency(value);
      return "0";
    case "niitTulburUsgeer":
      if (ashiglaltiinZardluud && Array.isArray(ashiglaltiinZardluud)) {
        value = ashiglaltiinZardluud.reduce(
          (sum, z) => sum + (z.tariff || z.dun || 0),
          0
        );
      } else if (nekhemjlekh?.niitTulbur) {
        value = nekhemjlekh.niitTulbur;
      } else {
        value = geree?.niitTulbur || 0;
      }
      if (value || value === 0) return numberToWords(value);
      return "";

    // Property information
    case "bairNer":
      value = geree?.bairNer || orshinSuugch?.bairniiNer || "";
      break;
    case "orts":
      value = geree?.orts || orshinSuugch?.orts || "";
      break;
    case "toot":
      value = geree?.toot || orshinSuugch?.toot || "";
      break;
    case "davkhar":
      value = geree?.davkhar || orshinSuugch?.davkhar || "";
      break;

    // Additional information
    case "burtgesenAjiltan":
      value = geree?.burtgesenAjiltan || "";
      break;
    case "temdeglel":
      value = geree?.temdeglel || "";
      break;

    // Location information
    case "duureg":
      value = geree?.duureg || orshinSuugch?.duureg || "";
      break;
    case "horoo":
      // Handle horoo from geree (object) or orshinSuugch (might be string or object)
      value = geree?.horoo || orshinSuugch?.horoo || "";
      if (typeof value === "object" && value !== null) {
        return formatObject(value);
      }
      // If horoo is a string in orshinSuugch, try to parse it
      if (typeof value === "string" && value.trim().startsWith("{")) {
        try {
          // Try to parse the string representation (handles both JSON and object-like strings)
          // First try JSON.parse (if it's valid JSON)
          let parsed = null;
          try {
            parsed = JSON.parse(value);
          } catch (jsonError) {
            // If JSON.parse fails, try to extract values using regex
            const nerMatch = value.match(/ner:\s*['"]([^'"]+)['"]/);
            const kodMatch = value.match(/kod:\s*['"]([^'"]+)['"]/);
            if (nerMatch || kodMatch) {
              parsed = {
                ner: nerMatch ? nerMatch[1] : "",
                kod: kodMatch ? kodMatch[1] : "",
              };
            }
          }
          if (parsed && typeof parsed === "object") {
            return formatObject(parsed);
          }
        } catch (e) {
          // If parsing fails, return the string as is
          console.log(`Warning: Could not parse horoo string: ${value}`);
        }
      }
      break;
    case "soh":
      value = geree?.sohNer || orshinSuugch?.soh || "";
      break;

    // Default: try direct field access
    default:
      // Direct geree fields
      if (geree && geree[tagType] !== undefined && geree[tagType] !== null) {
        value = geree[tagType];
      }
      // Direct orshinSuugch fields
      else if (
        orshinSuugch &&
        orshinSuugch[tagType] !== undefined &&
        orshinSuugch[tagType] !== null
      ) {
        value = orshinSuugch[tagType];
      }
      // Nested properties (e.g., "horoo.ner")
      else if (tagType.includes(".")) {
        const parts = tagType.split(".");
        let source = geree || orshinSuugch;
        for (const part of parts) {
          if (source && source[part] !== undefined) {
            source = source[part];
          } else {
            source = null;
            break;
          }
        }
        value = source;
      }
      break;
  }

  // Format the value based on type
  if (value === null || value === undefined) {
    return "";
  }

  // Handle empty strings for certain fields (return empty instead of "undefined")
  if (
    value === "" &&
    (tagType.includes("Tulbur") || tagType.includes("Zardal"))
  ) {
    return "0";
  }

  // Date formatting (for any remaining date fields)
  if (tagType.includes("Ognoo") || tagType.includes("ognoo")) {
    if (
      value instanceof Date ||
      (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}/))
    ) {
      return formatDate(value);
    }
  }

  // Array formatting
  if (Array.isArray(value)) {
    return formatArray(value);
  }

  // Object formatting
  if (typeof value === "object" && value !== null) {
    return formatObject(value);
  }

  // Number formatting for currency fields (if not already formatted)
  if (
    (tagType.includes("Tulbur") ||
      tagType.includes("Zardal") ||
      tagType.includes("Dun")) &&
    !tagType.includes("Usgeer")
  ) {
    if (
      typeof value === "number" ||
      (typeof value === "string" && !isNaN(value) && value !== "")
    ) {
      return formatCurrency(value);
    }
  }

  // Return string value, but handle empty strings
  const stringValue = String(value);
  return stringValue === "undefined" || stringValue === "null"
    ? ""
    : stringValue;
}

// Helper function to extract all variable tags from HTML
function extractVariableTags(htmlContent) {
  if (!htmlContent) return [];

  const tagRegex =
    /<span\s+[^>]*data-tag-type=["']([^"']+)["'][^>]*class=["']custom-tag["'][^>]*\/?>\s*<\/span>/gi;

  const tags = [];
  let match;
  while ((match = tagRegex.exec(htmlContent)) !== null) {
    const tagType = match[1].trim();
    if (!tags.includes(tagType)) {
      tags.push(tagType);
    }
  }

  return tags;
}

// Main function to replace data-tag-type variables in HTML
function replaceTemplateVariables(
  htmlContent,
  geree,
  orshinSuugch,
  baiguullaga,
  nekhemjlekh,
  ashiglaltiinZardluud
) {
  if (!htmlContent) return "";

  // More flexible regex to match variable tags
  // Handles various formats:
  // - <span data-tag-type="var" class="custom-tag"></span>
  // - <span class="custom-tag" data-tag-type="var"></span>
  // - <span data-tag-type='var' class='custom-tag'></span>
  // - Self-closing tags
  const tagRegex =
    /<span\s+[^>]*data-tag-type=["']([^"']+)["'][^>]*class=["']custom-tag["'][^>]*\/?>\s*<\/span>/gi;

  // Extract all variable tags first for debugging
  const foundTags = extractVariableTags(htmlContent);
  console.log(
    `Found ${foundTags.length} variable tags in template:`,
    foundTags
  );

  let processedContent = htmlContent;
  let replacementCount = 0;
  const replacementLog = [];

  // Replace all variable tags
  processedContent = processedContent.replace(tagRegex, (match, tagType) => {
    const trimmedTagType = tagType.trim();
    const value = getVariableValue(
      trimmedTagType,
      geree,
      orshinSuugch,
      baiguullaga,
      nekhemjlekh,
      ashiglaltiinZardluud
    );

    // Debug logging
    if (value) {
      replacementCount++;
      replacementLog.push({
        tag: trimmedTagType,
        value: value.substring(0, 50),
      });
      console.log(
        `✓ Replacing [${trimmedTagType}] with: "${value.substring(0, 50)}${
          value.length > 50 ? "..." : ""
        }"`
      );
    } else {
      replacementLog.push({ tag: trimmedTagType, value: null });
      console.log(`✗ Variable [${trimmedTagType}] not found or empty`);
    }

    return value || ""; // Return empty string if value not found
  });

  console.log(`Total replacements: ${replacementCount}/${foundTags.length}`);
  if (replacementCount < foundTags.length) {
    const missing = foundTags.filter(
      (tag) => !replacementLog.find((r) => r.tag === tag && r.value)
    );
    console.log(`Missing values for:`, missing);
  }

  return processedContent;
}

// Unified endpoint to get processed contract template(s)
// Can handle single geree or multiple geree based on request
exports.gereeniiZagvarSoliyo = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const {
      gereeniiZagvariinId,
      gereeniiId, // Single geree ID (optional)
      baiguullagiinId, // For multiple geree
      barilgiinId, // Optional filter for multiple geree
    } = req.body;

    // Determine if single or multiple geree request
    const isSingleGeree = !!gereeniiId;
    const isMultipleGeree = !!baiguullagiinId && !gereeniiId;

    if (!gereeniiZagvariinId) {
      return res.status(400).json({
        success: false,
        message: "Гэрээний загварын ID заавал бөглөх шаардлагатай!",
      });
    }

    if (!isSingleGeree && !isMultipleGeree) {
      return res.status(400).json({
        success: false,
        message:
          "Гэрээний ID эсвэл Байгууллагын ID заавал бөглөх шаардлагатай!",
      });
    }

    // Get connection
    let kholbolt = null;
    let finalBaiguullagiinId = baiguullagiinId;

    if (isSingleGeree) {
      // For single geree, find connection by searching for geree
      if (!finalBaiguullagiinId) {
        for (const conn of db.kholboltuud) {
          try {
            const tempGeree = await Geree(conn).findById(gereeniiId);
            if (tempGeree) {
              finalBaiguullagiinId = tempGeree.baiguullagiinId;
              kholbolt = conn;
              break;
            }
          } catch (e) {
            // Continue searching
          }
        }
      } else {
        kholbolt = db.kholboltuud.find(
          (k) => String(k.baiguullagiinId) === String(finalBaiguullagiinId)
        );
      }
    } else {
      // For multiple geree, use provided baiguullagiinId
      kholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(finalBaiguullagiinId)
      );
    }

    if (!kholbolt) {
      return res.status(404).json({
        success: false,
        message: "Холболтын мэдээлэл олдсонгүй!",
      });
    }

    // Get template
    const zagvar = await GereeniiZagvar(kholbolt).findById(gereeniiZagvariinId);

    if (!zagvar) {
      return res.status(404).json({
        success: false,
        message: "Гэрээний загвар олдсонгүй!",
      });
    }

    // Get baiguullaga (SUH) data
    const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
      finalBaiguullagiinId
    );

    // Helper function to process a single geree
    const processGeree = async (geree) => {
      // Get orshinSuugch if orshinSuugchId exists
      let orshinSuugch = null;
      if (geree.orshinSuugchId) {
        orshinSuugch = await OrshinSuugch(kholbolt).findById(
          geree.orshinSuugchId
        );
      }

      // Get latest nekhemjlekh (invoice) for this geree
      let nekhemjlekh = null;
      if (geree._id) {
        nekhemjlekh = await NekhemjlekhiinTuukh(kholbolt)
          .findOne({
            gereeniiId: String(geree._id),
          })
          .sort({ createdAt: -1 }); // Get the latest invoice
      }

      // Get ashiglaltiinZardluud from baiguullaga.barilguud[].tokhirgoo
      let ashiglaltiinZardluud = [];
      if (geree.baiguullagiinId && geree.barilgiinId) {
        const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
          geree.baiguullagiinId
        );
        const targetBarilga = baiguullaga?.barilguud?.find(
          (b) => String(b._id) === String(geree.barilgiinId)
        );
        ashiglaltiinZardluud =
          targetBarilga?.tokhirgoo?.ashiglaltiinZardluud || [];
      }

      // Process all template fields
      return {
        aguulga: replaceTemplateVariables(
          zagvar.aguulga || "",
          geree,
          orshinSuugch,
          baiguullaga,
          nekhemjlekh,
          ashiglaltiinZardluud
        ),
        tolgoi: replaceTemplateVariables(
          zagvar.tolgoi || "",
          geree,
          orshinSuugch,
          baiguullaga,
          nekhemjlekh,
          ashiglaltiinZardluud
        ),
        baruunTolgoi: replaceTemplateVariables(
          zagvar.baruunTolgoi || "",
          geree,
          orshinSuugch,
          baiguullaga,
          nekhemjlekh,
          ashiglaltiinZardluud
        ),
        zuunTolgoi: replaceTemplateVariables(
          zagvar.zuunTolgoi || "",
          geree,
          orshinSuugch,
          baiguullaga,
          nekhemjlekh,
          ashiglaltiinZardluud
        ),
        baruunKhul: replaceTemplateVariables(
          zagvar.baruunKhul || "",
          geree,
          orshinSuugch,
          baiguullaga,
          nekhemjlekh,
          ashiglaltiinZardluud
        ),
        zuunKhul: replaceTemplateVariables(
          zagvar.zuunKhul || "",
          geree,
          orshinSuugch,
          baiguullaga,
          nekhemjlekh,
          ashiglaltiinZardluud
        ),
      };
    };

    if (isSingleGeree) {
      // Single geree processing
      const geree = await Geree(kholbolt).findById(gereeniiId);

      if (!geree) {
        return res.status(404).json({
          success: false,
          message: "Гэрээ олдсонгүй!",
        });
      }

      const processedTemplate = await processGeree(geree);

      res.json({
        success: true,
        message: "Гэрээний загвар боловсруулагдлаа",
        result: {
          _id: zagvar._id,
          ner: zagvar.ner,
          tailbar: zagvar.tailbar,
          ...processedTemplate,
          turul: zagvar.turul,
          dedKhesguud: zagvar.dedKhesguud || [],
          geree: {
            _id: geree._id,
            gereeniiDugaar: geree.gereeniiDugaar,
            gereeniiOgnoo: geree.gereeniiOgnoo,
            ner: geree.ner,
            ovog: geree.ovog,
            utas: geree.utas,
            toot: geree.toot,
            davkhar: geree.davkhar,
          },
        },
      });
    } else {
      // Multiple geree processing (for list view with eye icon)
      // Build query for geree
      const gereeQuery = {
        baiguullagiinId: finalBaiguullagiinId,
      };

      if (barilgiinId) {
        gereeQuery.barilgiinId = barilgiinId;
      }

      // Get all geree
      const gereenuud = await Geree(kholbolt).find(gereeQuery).sort({
        createdAt: -1,
      });

      // Get all orshinSuugch IDs to fetch in batch
      const orshinSuugchIds = gereenuud
        .map((g) => g.orshinSuugchId)
        .filter((id) => id);

      // Fetch all orshinSuugch in one query
      const orshinSuugchuud = await OrshinSuugch(kholbolt).find({
        _id: { $in: orshinSuugchIds },
      });

      // Create a map for quick lookup
      const orshinSuugchMap = new Map();
      orshinSuugchuud.forEach((os) => {
        orshinSuugchMap.set(String(os._id), os);
      });

      // Get all geree IDs to fetch nekhemjlekh in batch
      const gereeniiIds = gereenuud
        .map((g) => String(g._id))
        .filter((id) => id);

      // Fetch all latest nekhemjlekh for each geree
      const nekhemjlekhuud = await NekhemjlekhiinTuukh(kholbolt)
        .find({
          gereeniiId: { $in: gereeniiIds },
        })
        .sort({ createdAt: -1 });

      // Create a map for quick lookup (latest invoice per geree)
      const nekhemjlekhMap = new Map();
      nekhemjlekhuud.forEach((nk) => {
        const gereeniiId = String(nk.gereeniiId);
        // Only keep the latest invoice for each geree
        if (!nekhemjlekhMap.has(gereeniiId)) {
          nekhemjlekhMap.set(gereeniiId, nk);
        }
      });

      // Get unique barilgiinId and baiguullagiinId combinations for ashiglaltiinZardluud
      const barilgaCombinations = new Set();
      gereenuud.forEach((g) => {
        if (g.baiguullagiinId && g.barilgiinId) {
          barilgaCombinations.add(`${g.baiguullagiinId}|${g.barilgiinId}`);
        }
      });

      // Fetch all ashiglaltiinZardluud from baiguullaga.barilguud[].tokhirgoo in batch
      const ashiglaltiinZardluudArray = [];
      const baiguullagaMap = new Map();

      for (const combo of barilgaCombinations) {
        const [baiguullagiinId, barilgiinId] = combo.split("|");

        // Get baiguullaga if not already fetched
        if (!baiguullagaMap.has(baiguullagiinId)) {
          const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
            baiguullagiinId
          );
          baiguullagaMap.set(baiguullagiinId, baiguullaga);
        }

        const baiguullaga = baiguullagaMap.get(baiguullagiinId);
        const targetBarilga = baiguullaga?.barilguud?.find(
          (b) => String(b._id) === String(barilgiinId)
        );
        const zardluud = targetBarilga?.tokhirgoo?.ashiglaltiinZardluud || [];

        ashiglaltiinZardluudArray.push(
          ...zardluud.map((z) => ({
            ...z,
            key: combo,
          }))
        );
      }

      // Create a map for quick lookup (ashiglaltiinZardluud per barilga)
      const ashiglaltiinZardluudMap = new Map();
      ashiglaltiinZardluudArray.forEach((z) => {
        const key = z.key;
        if (!ashiglaltiinZardluudMap.has(key)) {
          ashiglaltiinZardluudMap.set(key, []);
        }
        const { key: _, ...zardal } = z;
        ashiglaltiinZardluudMap.get(key).push(zardal);
      });

      // Process each geree with its template
      const processedGereenuud = await Promise.all(
        gereenuud.map(async (geree) => {
          const orshinSuugch = geree.orshinSuugchId
            ? orshinSuugchMap.get(String(geree.orshinSuugchId))
            : null;

          // Get latest nekhemjlekh for this geree
          const nekhemjlekh = nekhemjlekhMap.get(String(geree._id)) || null;

          // Get ashiglaltiinZardluud for this barilga
          const ashiglaltiinZardluudKey =
            geree.baiguullagiinId && geree.barilgiinId
              ? `${geree.baiguullagiinId}|${geree.barilgiinId}`
              : null;
          const ashiglaltiinZardluud = ashiglaltiinZardluudKey
            ? ashiglaltiinZardluudMap.get(ashiglaltiinZardluudKey) || []
            : [];

          // Process template
          const processedTemplate = {
            aguulga: replaceTemplateVariables(
              zagvar.aguulga || "",
              geree,
              orshinSuugch,
              baiguullaga,
              nekhemjlekh,
              ashiglaltiinZardluud
            ),
            tolgoi: replaceTemplateVariables(
              zagvar.tolgoi || "",
              geree,
              orshinSuugch,
              baiguullaga,
              nekhemjlekh,
              ashiglaltiinZardluud
            ),
            baruunTolgoi: replaceTemplateVariables(
              zagvar.baruunTolgoi || "",
              geree,
              orshinSuugch,
              baiguullaga,
              nekhemjlekh,
              ashiglaltiinZardluud
            ),
            zuunTolgoi: replaceTemplateVariables(
              zagvar.zuunTolgoi || "",
              geree,
              orshinSuugch,
              baiguullaga,
              nekhemjlekh,
              ashiglaltiinZardluud
            ),
            baruunKhul: replaceTemplateVariables(
              zagvar.baruunKhul || "",
              geree,
              orshinSuugch,
              baiguullaga,
              nekhemjlekh,
              ashiglaltiinZardluud
            ),
            zuunKhul: replaceTemplateVariables(
              zagvar.zuunKhul || "",
              geree,
              orshinSuugch,
              baiguullaga,
              nekhemjlekh,
              ashiglaltiinZardluud
            ),
          };

          // Return geree data with processed template
          return {
            _id: geree._id,
            gereeniiDugaar: geree.gereeniiDugaar,
            gereeniiOgnoo: geree.gereeniiOgnoo,
            ner: geree.ner,
            ovog: geree.ovog,
            utas: geree.utas,
            mail: geree.mail,
            toot: geree.toot,
            davkhar: geree.davkhar,
            bairNer: geree.bairNer,
            niitTulbur: geree.niitTulbur,
            ashiglaltiinZardal: geree.ashiglaltiinZardal,
            ekhlekhOgnoo: geree.ekhlekhOgnoo,
            duusakhOgnoo: geree.duusakhOgnoo,
            baiguullagiinId: geree.baiguullagiinId,
            baiguullagiinNer: geree.baiguullagiinNer,
            barilgiinId: geree.barilgiinId,
            orshinSuugchId: geree.orshinSuugchId,
            createdAt: geree.createdAt,
            updatedAt: geree.updatedAt,
            // Processed template data (90% same structure, different values)
            processedTemplate: processedTemplate,
            // Original geree data for reference
            gereeData: {
              register: geree.register,
              duureg: geree.duureg,
              horoo: geree.horoo,
              sohNer: geree.sohNer,
              sukhBairshil: geree.sukhBairshil,
              temdeglel: geree.temdeglel,
            },
          };
        })
      );

      res.json({
        success: true,
        message: "Гэрээний жагсаалт амжилттай",
        result: {
          gereenuud: processedGereenuud,
          niitToo: processedGereenuud.length,
          zagvariinNer: zagvar.ner,
          zagvariinId: zagvar._id,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

// Endpoint to get variable values - can list all available or get specific variable value
exports.gereeniiZagvarHuvisagchAvya = asyncHandler(async (req, res, next) => {
  try {
    const { db } = require("zevbackv2");
    const { gereeniiId, variableName, baiguullagiinId } = req.body;

    // Get connection
    let kholbolt = null;
    let finalBaiguullagiinId = baiguullagiinId;

    if (gereeniiId) {
      // Find connection by searching for geree
      if (!finalBaiguullagiinId) {
        for (const conn of db.kholboltuud) {
          try {
            const tempGeree = await Geree(conn).findById(gereeniiId);
            if (tempGeree) {
              finalBaiguullagiinId = tempGeree.baiguullagiinId;
              kholbolt = conn;
              break;
            }
          } catch (e) {
            // Continue searching
          }
        }
      } else {
        kholbolt = db.kholboltuud.find(
          (k) => String(k.baiguullagiinId) === String(finalBaiguullagiinId)
        );
      }
    } else if (finalBaiguullagiinId) {
      kholbolt = db.kholboltuud.find(
        (k) => String(k.baiguullagiinId) === String(finalBaiguullagiinId)
      );
    }

    if (!kholbolt && gereeniiId) {
      return res.status(404).json({
        success: false,
        message: "Холболтын мэдээлэл олдсонгүй!",
      });
    }

    // If specific variable name requested with geree
    if (variableName && gereeniiId) {
      const geree = await Geree(kholbolt).findById(gereeniiId);

      if (!geree) {
        return res.status(404).json({
          success: false,
          message: "Гэрээ олдсонгүй!",
        });
      }

      // Get orshinSuugch if exists
      let orshinSuugch = null;
      if (geree.orshinSuugchId) {
        orshinSuugch = await OrshinSuugch(kholbolt).findById(
          geree.orshinSuugchId
        );
      }

      // Get baiguullaga (SUH) data
      const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        geree.baiguullagiinId
      );

      // Get latest nekhemjlekh (invoice) for this geree
      let nekhemjlekh = null;
      if (geree._id) {
        nekhemjlekh = await NekhemjlekhiinTuukh(kholbolt)
          .findOne({
            gereeniiId: String(geree._id),
          })
          .sort({ createdAt: -1 }); // Get the latest invoice
      }

      // Get ashiglaltiinZardluud (expense/charge configuration) for this barilga
      let ashiglaltiinZardluud = [];
      if (geree.baiguullagiinId && geree.barilgiinId) {
        ashiglaltiinZardluud = await AshiglaltiinZardluud(kholbolt).find({
          baiguullagiinId: String(geree.baiguullagiinId),
          barilgiinId: String(geree.barilgiinId),
        });
      }

      // Get variable value
      const value = getVariableValue(
        variableName,
        geree,
        orshinSuugch,
        baiguullaga,
        nekhemjlekh,
        ashiglaltiinZardluud
      );

      res.json({
        success: true,
        message: "Хувьсагчийн утга амжилттай",
        result: {
          variableName: variableName,
          value: value,
          gereeId: gereeniiId,
        },
      });
      return;
    }

    // If no specific variable, return list of available variables
    // Get sample geree to show structure
    let sampleGeree = null;
    let sampleOrshinSuugch = null;
    let sampleBaiguullaga = null;
    let sampleNekhemjlekh = null;
    let sampleAshiglaltiinZardluud = [];

    if (gereeniiId && kholbolt) {
      sampleGeree = await Geree(kholbolt).findById(gereeniiId);
      if (sampleGeree) {
        if (sampleGeree.orshinSuugchId) {
          sampleOrshinSuugch = await OrshinSuugch(kholbolt).findById(
            sampleGeree.orshinSuugchId
          );
        }
        // Get baiguullaga (SUH) data
        if (sampleGeree.baiguullagiinId) {
          sampleBaiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
            sampleGeree.baiguullagiinId
          );
        }
        // Get latest nekhemjlekh (invoice) for this geree
        if (sampleGeree._id) {
          sampleNekhemjlekh = await NekhemjlekhiinTuukh(kholbolt)
            .findOne({
              gereeniiId: String(sampleGeree._id),
            })
            .sort({ createdAt: -1 });
        }
        // Get ashiglaltiinZardluud from baiguullaga.barilguud[].tokhirgoo
        if (sampleGeree.baiguullagiinId && sampleGeree.barilgiinId) {
          const baiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
            sampleGeree.baiguullagiinId
          );
          const targetBarilga = baiguullaga?.barilguud?.find(
            (b) => String(b._id) === String(sampleGeree.barilgiinId)
          );
          sampleAshiglaltiinZardluud =
            targetBarilga?.tokhirgoo?.ashiglaltiinZardluud || [];
        }
      }
    } else if (finalBaiguullagiinId) {
      // If only baiguullagiinId provided, get baiguullaga
      sampleBaiguullaga = await Baiguullaga(db.erunkhiiKholbolt).findById(
        finalBaiguullagiinId
      );
    }

    // List of all available variables matching tagCategories structure
    const allVariables = [
      // Basic information
      "ovog",
      "ner",
      "utas",
      "mail",
      "khayag",
      "baingiinKhayag",
      "register",
      "gereeniiDugaar",
      "gereeniiOgnoo",
      "turul",
      // SUH information
      "suhNer",
      "suhRegister",
      "suhUtas",
      "suhMail",
      // Duration
      "khugatsaa",
      "tulukhOgnoo",
      "gereeniiKhugatsaa",
      "TulultHiigdehOgnoo",
      // Payment
      "suhTulbur",
      "suhTulburUsgeer",
      "ashiglaltiinZardal",
      "ashiglaltiinZardalUsgeer",
      "niitTulbur",
      "niitTulburUsgeer",
      // Property information
      "bairNer",
      "orts",
      "toot",
      "davkhar",
      // Additional information
      "burtgesenAjiltan",
      "temdeglel",
      // Location information
      "duureg",
      "horoo",
      "soh",
    ];

    // Variables that can come from both geree and orshinSuugch
    const sharedVariables = [
      "ovog",
      "ner",
      "utas",
      "mail",
      "toot",
      "davkhar",
      "duureg",
      "horoo",
      "orts",
    ];

    // Variables specific to geree
    const gereeVariables = allVariables.filter(
      (v) => !sharedVariables.includes(v) || v === "register"
    );

    // Variables specific to orshinSuugch (these are already in sharedVariables)
    const orshinSuugchVariables = sharedVariables.filter(
      (v) => v !== "register"
    );

    // Get example values if sample geree exists
    const exampleValues = {};
    if (
      sampleGeree ||
      sampleOrshinSuugch ||
      sampleBaiguullaga ||
      sampleNekhemjlekh ||
      sampleAshiglaltiinZardluud.length > 0
    ) {
      allVariables.forEach((varName) => {
        const value = getVariableValue(
          varName,
          sampleGeree,
          sampleOrshinSuugch,
          sampleBaiguullaga,
          sampleNekhemjlekh,
          sampleAshiglaltiinZardluud
        );
        if (value) {
          exampleValues[varName] = value;
        }
      });
    }

    res.json({
      success: true,
      message: "Боломжтой хувьсагчдын жагсаалт",
      result: {
        allVariables: allVariables.map((name) => ({
          name: name,
          exampleValue: exampleValues[name] || null,
          description: getVariableDescription(name),
        })),
        gereeVariables: gereeVariables.map((name) => ({
          name: name,
          description: getVariableDescription(name),
          exampleValue: exampleValues[name] || null,
        })),
        orshinSuugchVariables: orshinSuugchVariables.map((name) => ({
          name: name,
          description: getVariableDescription(name),
          exampleValue: exampleValues[name] || null,
        })),
        usage: {
          singleValue:
            "POST with gereeniiId and variableName to get specific value",
          allVariables:
            "POST with gereeniiId (optional) to get list of all variables",
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to get variable description
function getVariableDescription(variableName) {
  const descriptions = {
    // Basic information
    ovog: "Овог",
    ner: "Нэр",
    utas: "Утас",
    mail: "И-мэйл",
    khayag: "Хаяг",
    baingiinKhayag: "Байнгын хаяг",
    register: "Регистр",
    gereeniiDugaar: "Гэрээний дугаар",
    gereeniiOgnoo: "Гэрээний огноо",
    turul: "Төрөл",
    // SUH information
    suhNer: "СӨХ-ийн нэр",
    suhRegister: "СӨХ-ийн регистр",
    suhUtas: "СӨХ-ийн утас",
    suhMail: "СӨХ-ийн и-мэйл",
    // Duration
    khugatsaa: "Хугацаа",
    tulukhOgnoo: "Төлөх огноо",
    gereeniiKhugatsaa: "Гэрээний хугацаа",
    TulultHiigdehOgnoo: "Төлөлт хийгдэх огноо",
    // Payment
    suhTulbur: "СӨХ хураамж",
    suhTulburUsgeer: "СӨХ хураамж үсгээр",
    ashiglaltiinZardal: "Ашиглалтын зардал",
    ashiglaltiinZardalUsgeer: "Ашиглалт үсгээр",
    niitTulbur: "Нийт төлбөр",
    niitTulburUsgeer: "Нийт төлбөр үсгээр",
    // Property information
    bairNer: "Байрны нэр",
    orts: "Орц",
    toot: "Тоот",
    davkhar: "Давхар",
    // Additional information
    burtgesenAjiltan: "Бүртгэсэн ажилтан",
    temdeglel: "Тэмдэглэл",
    // Location information
    duureg: "Дүүрэг",
    horoo: "Хороо",
    soh: "СӨХ",
  };

  return descriptions[variableName] || variableName;
}

// Export helper function for use in other controllers
exports.replaceTemplateVariables = replaceTemplateVariables;
exports.getVariableValue = getVariableValue;
