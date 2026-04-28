/**
 * Smoke tests for nekhemjlekh refactor: ensure services and controller export
 * the expected functions with correct names. Run from project root:
 *   node tests/unit/nekhemjlekh-services-smoke.js
 * Requires npm install (mongoose/zevbackv2 deps). Does not require DB connection.
 */

const path = require("path");
const projectRoot = path.join(__dirname, "../..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function run() {
  console.log("Loading utils...");
  const { getKholboltByBaiguullagiinId } = require(
    path.join(projectRoot, "utils/dbConnection.js"),
  );
  const {
    normalizeTurul,
    normalizeZardluudTurul,
    deduplicateZardluud,
  } = require(path.join(projectRoot, "utils/zardalUtils.js"));
  assert(typeof getKholboltByBaiguullagiinId === "function");
  assert(typeof normalizeTurul === "function");
  assert(typeof normalizeZardluudTurul === "function");
  assert(typeof deduplicateZardluud === "function");
  console.log("  utils OK");

  console.log("Loading invoiceCreationService...");
  const creation = require(
    path.join(projectRoot, "services/invoiceCreationService.js"),
  );
  assert(typeof creation.gereeNeesNekhemjlekhUusgekh === "function");
  console.log("  invoiceCreationService OK");

  console.log("Loading invoicePreviewService...");
  const preview = require(
    path.join(projectRoot, "services/invoicePreviewService.js"),
  );
  assert(typeof preview.previewInvoice === "function");
  console.log("  invoicePreviewService OK");

  console.log("Loading invoiceSendService...");
  const send = require(
    path.join(projectRoot, "services/invoiceSendService.js"),
  );
  assert(typeof send.manualSendInvoice === "function");
  assert(typeof send.manualSendMassInvoices === "function");
  assert(typeof send.manualSendSelectedInvoices === "function");
  console.log("  invoiceSendService OK");

  console.log("Loading invoiceZardalService...");
  const zardal = require(
    path.join(projectRoot, "services/invoiceZardalService.js"),
  );
  assert(typeof zardal.updateGereeAndNekhemjlekhFromZardluud === "function");
  assert(typeof zardal.deleteInvoiceZardal === "function");
  assert(typeof zardal.recalculateGereeBalance === "function");
  console.log("  invoiceZardalService OK");

  console.log("Loading invoiceDeletionService...");
  const deletion = require(
    path.join(projectRoot, "services/invoiceDeletionService.js"),
  );
  assert(typeof deletion.runDeleteSideEffects === "function");
  assert(typeof deletion.deleteInvoice === "function");
  assert(typeof deletion.deleteAllInvoicesForOrg === "function");
  console.log("  invoiceDeletionService OK");

  console.log("Loading nekhemjlekhController...");
  const controller = require(
    path.join(projectRoot, "controller/nekhemjlekhController.js"),
  );
  const expectedExports = [
    "gereeNeesNekhemjlekhUusgekh",
    "updateGereeAndNekhemjlekhFromZardluud",
    "markInvoicesAsPaid",
    "previewInvoice",
    "manualSendInvoice",
    "manualSendMassInvoices",
    "manualSendSelectedInvoices",
    "deleteInvoiceZardal",
    "recalculateGereeBalance",
    "deleteInvoice",
  ];
  for (const name of expectedExports) {
    assert(controller[name] !== undefined, `Controller should export ${name}`);
  }
  console.log("  nekhemjlekhController OK (all exports present)");

  console.log("\nAll smoke tests passed.");
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
