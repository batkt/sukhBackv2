const fs = require("fs");
const path = require("path");

function patchSdkService() {
  const targetPath = path.join(__dirname, "../node_modules/sukhParking-v1/lib/serivice/sdkService.js");

  if (!fs.existsSync(targetPath)) {
    console.warn(`⚠️ [PATCH] sdkService.js was not found at ${targetPath}. Skipping patch.`);
    return;
  }

  try {
    let content = fs.readFileSync(targetPath, "utf8");
    let changed = false;

    // 1. Patch: Stop auto-violation
    if (!content.includes("Patched: Stop auto-violation")) {
      const regexViolation = /return\s+\[4\s*\/\*\s*yield\s*\*\/,\s*uilchluulegch_1\.default\(body_1\.tukhainBaaziinKholbolt\)\.updateMany\([\s\S]*?zurchil:\s*['"]Гарсан цаг тодорхойгүй!['"][\s\S]*?\}\s*\)\s*\];/g;
      if (regexViolation.test(content)) {
        content = content.replace(regexViolation, `/* PATCHED: Stop auto-violation by skipping the updateMany violation marking so it gets cleaned up by deleteMany */
                    return [4 /*yield*/, Promise.resolve("Patched: Stop auto-violation")];`);
        changed = true;
        console.log("✅ [PATCH] Successfully patched sdkService.js to stop auto-violation 'Гарсан цаг тодорхойгүй!'");
      }
    }

    // 2. Patch: Fix overnight same-day exit fee calculation bug
    if (!content.includes("PATCHED: Accurate overnight fee calculation")) {
      const regexOvernight = /if\s*\(!\(zEndSec\s*<\s*zStartSec\)\)\s*return\s*\[3\s*\/\*\s*break\s*\*\/,\s*11\];[\s\S]*?case\s*10:\s*return\s*\[3\s*\/\*\s*break\s*\*\/,\s*19\];/;
      if (regexOvernight.test(content)) {
        const replacementOvernight = `if (!(zEndSec < zStartSec)) return [3 /*break*/, 11];
                                        /* PATCHED: Accurate overnight fee calculation for same-day evening exit */
                                        var bsanMin_ov = 0;
                                        if (zuruuMinut) {
                                            bsanMin_ov = zuruuMinut;
                                        } else if (orsonSec <= garsanSec) {
                                            var totalSec = 0;
                                            var start1 = Math.max(orsonSec, zStartSec);
                                            var end1 = Math.min(garsanSec, 86400);
                                            if (end1 > start1) totalSec += (end1 - start1);
                                            var start2 = Math.max(orsonSec, 0);
                                            var end2 = Math.min(garsanSec, zEndSec);
                                            if (end2 > start2) totalSec += (end2 - start2);
                                            bsanMin_ov = Math.trunc(totalSec / 60);
                                        } else {
                                            var totalSec = 0;
                                            var start1 = Math.max(orsonSec, zStartSec);
                                            if (86400 > start1) totalSec += (86400 - start1);
                                            var end2 = Math.min(garsanSec, zEndSec);
                                            if (end2 > 0) totalSec += end2;
                                            bsanMin_ov = Math.trunc(totalSec / 60);
                                        }
                                        if (bsanMin_ov <= 0) return [3 /*break*/, 10];
                                        return [4 /*yield*/, tariffTootsokh(x.tariff, bsanMin_ov)];
                                    case 7:
                                        tariff = _e.sent();
                                        if (tariff > 0)
                                            tulbur += tariff;
                                        return [3 /*break*/, 10];
                                    case 8:
                                    case 9:
                                        return [3 /*break*/, 10];
                                    case 10: return [3 /*break*/, 19];`;
        content = content.replace(regexOvernight, replacementOvernight);
        changed = true;
        console.log("✅ [PATCH] Successfully patched sdkService.js to fix overnight same-day exit fee calculation");
      }
    }

    if (changed) {
      fs.writeFileSync(targetPath, content, "utf8");
    } else {
      console.log("ℹ️ [PATCH] sdkService.js is already up-to-date with all patches");
    }
  } catch (error) {
    console.error(`❌ [PATCH] Error while patching sdkService.js: ${error.message}`);
  }
}

module.exports = patchSdkService;
if (require.main === module) {
  patchSdkService();
}
