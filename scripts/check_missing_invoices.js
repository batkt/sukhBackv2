require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  db.kholboltUusgey(null, MONGODB_URI);
  
  // Wait a bit for connections to initialize
  await new Promise(r => setTimeout(r, 2000));
  
  const Geree = require('../models/geree');
  const NekhemjlekhiinTuukh = require('../models/nekhemjlekhiinTuukh');
  
  const gereeNumbers = [
    'ГД-71813334',
    'ГД-71816195',
    'ГД-71821852',
    'ГД-71820060',
    'ГД-71836964',
    'ГД-71807637',
    'ГД-71821129',
    'ГД-71813705',
    'ГД-71808013',
    'ГД-71812301',
    'ГД-71823022',
    'ГД-71831989',
    'ГД-71847939',
    'ГД-71810502'
  ];
  
  for (const dugaar of gereeNumbers) {
    console.log(`\nChecking ${dugaar}...`);
    // Search across all tenants
    let found = false;
    for (const kh of db.kholboltuud) {
      const geree = await Geree(kh).findOne({ gereeniiDugaar: dugaar }).lean();
      if (geree) {
        found = true;
        console.log(`- Found in org: ${geree.baiguullagiinId}`);
        console.log(`- Tuluv (Status): ${geree.tuluv}`);
        
        // Check invoices for May
        const invoices = await NekhemjlekhiinTuukh(kh).find({
          gereeniiId: geree._id.toString(),
          ognoo: { 
            $gte: new Date('2026-05-01T00:00:00Z'), 
            $lte: new Date('2026-05-31T23:59:59Z') 
          }
        }).lean();
        
        console.log(`- Invoices in May: ${invoices.length}`);
        if (invoices.length > 0) {
          console.log(`  - Invoice IDs: ${invoices.map(i => i.nekhemjlekhiinDugaar).join(', ')}`);
        }
        
        // Check charges
        const invoiceService = require('../services/invoiceService');
        const { charges, total } = await invoiceService.calculateGereeCharges(kh, geree, { billingDate: new Date() });
        console.log(`- Calculated Total Charges: ${total}`);
      }
    }
    if (!found) {
      console.log(`- NOT FOUND in any tenant db.`);
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
