require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');
const fs = require('fs');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections to load...");
  await new Promise(r => setTimeout(r, 3000));

  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');
  const EbarimtShine = require('../models/ebarimtShine');
  const Ebarimt = require('../models/ebarimt');

  const report = {
    totalTenantsScanned: db.kholboltuud.length,
    totalPaidInvoicesChecked: 0,
    totalMissingEbarimts: 0,
    tenantsReport: []
  };

  const scanStartDate = new Date("2026-01-01T00:00:00Z");

  console.log(`\nStarting system-wide audit of paid invoices since ${scanStartDate.toISOString().split('T')[0]}...`);

  for (const kh of db.kholboltuud) {
    const orgId = kh.baiguullagiinId;
    console.log(`Auditing Org ID: ${orgId}...`);

    try {
      // 1. Fetch all paid invoices since Jan 1st, 2026
      const invoices = await NekhemjlekhiinTuukh(kh).find({
        tuluv: "Төлсөн",
        createdAt: { $gte: scanStartDate }
      }).lean();

      if (invoices.length === 0) {
        console.log(`- No paid invoices found for this period.`);
        continue;
      }

      // 2. Fetch all ebarimts for these invoices
      const invoiceIds = invoices.map(i => i._id.toString());
      
      const newEbarimts = await EbarimtShine(kh).find({
        nekhemjlekhiinId: { $in: invoiceIds }
      }).select("nekhemjlekhiinId receiptId id").lean();

      const oldEbarimts = await Ebarimt(kh).find({
        nekhemjlekhiinId: { $in: invoiceIds }
      }).select("nekhemjlekhiinId billId id").lean();

      const processedIds = new Set([
        ...newEbarimts.map(e => e.nekhemjlekhiinId),
        ...oldEbarimts.map(e => e.nekhemjlekhiinId)
      ]);

      const missing = invoices.filter(i => !processedIds.has(i._id.toString()));

      report.totalPaidInvoicesChecked += invoices.length;
      report.totalMissingEbarimts += missing.length;

      const tenantStats = {
        orgId: orgId,
        paidInvoicesCount: invoices.length,
        missingEbarimtsCount: missing.length,
        missingPercentage: invoices.length > 0 ? ((missing.length / invoices.length) * 100).toFixed(1) + "%" : "0%"
      };

      if (missing.length > 0) {
        tenantStats.sampleMissing = missing.slice(0, 10).map(m => ({
          invoiceNo: m.nekhemjlekhiinDugaar,
          contractNo: m.gereeniiDugaar,
          amount: m.niitTulbur,
          toot: m.toot,
          paidDate: m.tulsunOgnoo || m.updatedAt
        }));
      }

      report.tenantsReport.push(tenantStats);
      console.log(`- Paid Invoices: ${invoices.length} | Missing Ebarimts: ${missing.length} (${tenantStats.missingPercentage})`);

    } catch (err) {
      console.error(`❌ Error auditing Org ID ${orgId}:`, err.message);
      report.tenantsReport.push({
        orgId: orgId,
        error: err.message
      });
    }
  }

  fs.writeFileSync("./audit_report.json", JSON.stringify(report, null, 2));
  console.log("\n========================================");
  console.log(`Audit finished!`);
  console.log(`Total Paid Invoices Checked: ${report.totalPaidInvoicesChecked}`);
  console.log(`Total Missing Ebarimts:      ${report.totalMissingEbarimts}`);
  console.log(`Overall Missing Rate:        ${((report.totalMissingEbarimts / report.totalPaidInvoicesChecked) * 100).toFixed(1)}%`);
  console.log(`Detailed audit report saved to audit_report.json`);
  
  process.exit(0);
}

main().catch(console.error);
