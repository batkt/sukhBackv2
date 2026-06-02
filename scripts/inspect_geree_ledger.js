require('dotenv').config({ path: '../tokhirgoo/tokhirgoo.env' });
const { db } = require('zevbackv2');

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
  db.kholboltUusgey(null, MONGODB_URI);
  await new Promise(r => setTimeout(r, 2000));

  const GuilgeeAvlaguud = require('../models/guilgeeAvlaguud');
  
  for (const kh of db.kholboltuud) {
    const list = await GuilgeeAvlaguud(kh).find({ gereeniiDugaar: 'ГД-67365413' }).lean();
    if (list.length > 0) {
      console.log(`Found ${list.length} ledger entries in org ${kh.baiguullagiinId}:`);
      list.forEach((item, idx) => {
        console.log(`${idx}: date=${item.ognoo?.toISOString() || item.createdAt?.toISOString()}, dun=${item.dun}, tailbar=${item.tailbar}, source=${item.source}, nekhemjlekhId=${item.nekhemjlekhId || 'null'}`);
      });
    }
  }
  process.exit(0);
}

main().catch(console.error);
