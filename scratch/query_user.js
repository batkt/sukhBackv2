require('dotenv').config({ path: require('path').resolve(__dirname, '../tokhirgoo/tokhirgoo.env') });
const { db } = require('zevbackv2');
const mongoose = require('mongoose');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  console.log("Connecting database...");
  db.kholboltUusgey(null, MONGODB_URI);
  
  console.log("Waiting 3s for connections to load...");
  await new Promise(r => setTimeout(r, 3000));

  const Geree = require('../models/geree');
  const GuilgeeAvlaguud = require('../models/guilgeeAvlaguud');
  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');

  // Let's search across all tenant connections
  for (const kh of db.kholboltuud) {
    console.log(`Checking Org: ${kh.baiguullagiinId}...`);
    const GereeModel = Geree(kh);
    
    // Search by name "Акэркэ" or phone "99099403"
    const contracts = await GereeModel.find({
      $or: [
        { ner: /Акэркэ/i },
        { ovog: /Акэркэ/i },
        { utas: "99099403" },
        { gereeniiDugaar: /ГД-52382382/i }
      ]
    }).lean();

    if (contracts.length > 0) {
      console.log(`\n========================================`);
      console.log(`Found ${contracts.length} matching contract(s) in Org ${kh.baiguullagiinId}:`);
      
      for (const contract of contracts) {
        console.log(`- Contract ID: ${contract._id}`);
        console.log(`- Name: ${contract.ovog} ${contract.ner}`);
        console.log(`- Room (Toot): ${contract.toot}`);
        console.log(`- Phone: ${contract.utas}`);
        console.log(`- Contract No: ${contract.gereeniiDugaar}`);
        console.log(`- Status: ${contract.tuluv}`);

        // Fetch GuilgeeAvlaguud (ledger entries)
        const GuilgeeModel = GuilgeeAvlaguud(kh);
        const entries = await GuilgeeModel.find({ gereeniiId: String(contract._id) })
          .sort({ ognoo: 1, createdAt: 1 })
          .lean();

        console.log(`\nLedger Entries (${entries.length}):`);
        let sumTulbur = 0;
        let sumTulsun = 0;
        entries.forEach((e, idx) => {
          const type = e.dun > 0 ? "avlaga" : "toloht";
          const amount = Math.abs(e.dun);
          if (e.dun > 0) sumTulbur += e.dun;
          else sumTulsun += amount;

          console.log(`  [${idx}] Date: ${e.ognoo ? e.ognoo.toISOString().split('T')[0] : 'N/A'} | Dun: ${e.dun} | Type: ${e.turul || type} | Desc: ${e.tailbar || e.zardliinNer} | invoiceId: ${e.nekhemjlekhId || 'null'}`);
        });

        console.log(`\nSummary:`);
        console.log(`  - Total Tulbur: ${sumTulbur}`);
        console.log(`  - Total Tulsun: ${sumTulsun}`);
        console.log(`  - Uldegdel (Total): ${sumTulbur - sumTulsun}`);

        // Let's run the exact logic of uldegdelBodyo
        console.log(`\nSimulating uldegdelBodyo logic...`);
        let totalTulbur = 0;
        let totalTulsun = 0;
        const invoiceCharges = {};

        entries.forEach((it) => {
          const dun = Number(it.dun || 0);
          const invId = it.nekhemjlekhId ? String(it.nekhemjlekhId) : null;

          if (dun > 0) {
            totalTulbur += dun;
            if (invId) {
              if (!invoiceCharges[invId]) {
                invoiceCharges[invId] = { charges: 0, date: it.ognoo || it.createdAt, id: invId };
              }
              invoiceCharges[invId].charges += dun;
            }
          } else {
            totalTulsun += Math.abs(dun);
          }
        });

        const sortedInvoices = Object.values(invoiceCharges).sort((a, b) => new Date(a.date) - new Date(b.date));
        console.log(`  Sorted Invoices to pay:`, JSON.stringify(sortedInvoices, null, 2));
        console.log(`  Available Funds for Invoices: ${totalTulsun}`);

        const nekhemjlekhuud = [];
        let availableFunds = totalTulsun;

        for (const inv of sortedInvoices) {
          const targetAmount = inv.charges;
          const isPaid = availableFunds + 0.1 >= targetAmount;
          const uld = isPaid ? 0 : Math.max(0, targetAmount - availableFunds);
          const status = (isPaid && targetAmount > 0) ? "Төлсөн" : "Төлөөгүй";

          nekhemjlekhuud.push({
            nekhemjlekhId: inv.id,
            niitTulbur: inv.charges,
            uldegdel: Number(uld.toFixed(2)),
            tuluv: status
          });

          if (isPaid) {
            availableFunds -= targetAmount;
          } else {
            availableFunds = 0;
          }
        }

        console.log(`  Resulting nekhemjlekhuud:`, JSON.stringify(nekhemjlekhuud, null, 2));
        console.log(`  Resulting Summary:`);
        console.log(`    totalTulbur: ${Number(totalTulbur.toFixed(2))}`);
        console.log(`    totalTulsun: ${Number(totalTulsun.toFixed(2))}`);
        console.log(`    uldegdel: ${Number((totalTulbur - totalTulsun).toFixed(2))}`);
      }
      break;
    }
  }

  process.exit(0);
}

main().catch(console.error);
