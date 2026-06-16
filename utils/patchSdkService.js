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

    // Check if already patched
    if (content.includes("Patched: Stop auto-violation")) {
      console.log("ℹ️ [PATCH] sdkService.js is already patched");
      return;
    }

    // Regex to match the return [4 /*yield*/, uilchluulegch_1.default(...).updateMany(...)]; block
    // that sets the violation 'Гарсан цаг тодорхойгүй!'
    const regex = /return\s+\[4\s*\/\*\s*yield\s*\*\/,\s*uilchluulegch_1\.default\(body_1\.tukhainBaaziinKholbolt\)\.updateMany\([\s\S]*?zurchil:\s*['"]Гарсан цаг тодорхойгүй!['"][\s\S]*?\}\s*\)\s*\];/g;

    if (regex.test(content)) {
      content = content.replace(regex, `/* PATCHED: Stop auto-violation by skipping the updateMany violation marking so it gets cleaned up by deleteMany */
                    return [4 /*yield*/, Promise.resolve("Patched: Stop auto-violation")];`);
      fs.writeFileSync(targetPath, content, "utf8");
      console.log("✅ [PATCH] Successfully patched sdkService.js to stop auto-violation 'Гарсан цаг тодорхойгүй!'");
    } else {
      console.error("❌ [PATCH] Could not find the target updateMany block in sdkService.js to patch. Please check the library code structure.");
    }
  } catch (error) {
    console.error(`❌ [PATCH] Error while patching sdkService.js: ${error.message}`);
  }
}

module.exports = patchSdkService;
if (require.main === module) {
  patchSdkService();
}
