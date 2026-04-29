const { db } = require("zevbackv2");
const mongoose = require("mongoose");
const express = require("express");
const app = express();

async function listOrgs() {
  try {
    const MONGODB_URI = "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
    await db.kholboltUusgey(app, MONGODB_URI);
    
    // Give it a moment to connect
    await new Promise(resolve => setTimeout(resolve, 2000));

    const Baiguullaga = require("./models/baiguullaga");
    const organizations = await Baiguullaga(db.erunkhiiKholbolt).find({}).lean();
    
    console.log(`Found ${organizations.length} organizations in current system:`);
    organizations.forEach(org => {
      console.log(`- ${org.ner} (ID: ${org._id}, Register: ${org.register})`);
      const kholbolt = db.kholboltuud?.find(k => String(k.baiguullagiinId) === String(org._id));
      if (kholbolt) {
        console.log(`  Connection: ${kholbolt.baaziinNer} (${kholbolt.clusterUrl})`);
      } else {
        console.log(`  No connection found in db.kholboltuud`);
      }
    });

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

listOrgs();
