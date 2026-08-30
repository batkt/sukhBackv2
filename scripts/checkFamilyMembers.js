const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Parse tokhirgoo.env manually
const envPath = path.join(__dirname, "../tokhirgoo/tokhirgoo.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...vals] = line.split("=");
    if (key && vals.length) {
      process.env[key.trim()] = vals.join("=").trim();
    }
  });
}

async function checkFamilyMembers() {
  const uri =
    process.env.MONGODB_URI ||
    "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";

  console.log("Connecting to:", uri.replace(/:([^:@]+)@/, ":****@"));
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // 1. Check gerBuliinUrilga collection
  const collections = await db.listCollections().toArray();
  const collNames = collections.map((c) => c.name);
  console.log("Available collections:", collNames.filter((n) => n.toLowerCase().includes("gerbul") || n.toLowerCase().includes("orshin")));

  const urilgaColl = db.collection("gerBuliinUrilga");
  const urilguud = await urilgaColl.find({}).toArray();

  console.log("\n========================================================");
  console.log("📨 1. ГЭР БҮЛИЙН УРИЛГУУД (gerBuliinUrilga):");
  console.log("Нийт урилгын тоо:", urilguud.length);
  if (urilguud.length > 0) {
    urilguud.forEach((u, i) => {
      console.log(`[${i + 1}] Утас: ${u.utas} | Нэр: ${u.ner || "-"} | Холбоо: ${u.kholboo || "-"} | Төлөв: ${u.tuluv} | Эрх: ${u.erkh} | Огноо: ${u.createdAt}`);
    });
  }

  // 2. Check confirmed members in orshinSuugch with undsenId
  const residentColl = db.collection("orshinSuugch");
  const subMembers = await residentColl
    .find({ undsenId: { $exists: true, $ne: null } })
    .toArray();

  console.log("\n========================================================");
  console.log("👨‍👩‍👧‍👦 2. БАТАЛГААЖСАН ГИШҮҮД (orshinSuugch.undsenId-тэй):");
  console.log("Нийт баталгаажсан гишүүдийн тоо:", subMembers.length);
  if (subMembers.length > 0) {
    subMembers.forEach((m, i) => {
      console.log(`[${i + 1}] Нэр: ${m.ner || "-"} (${m.ovog || ""}) | Утас: ${m.utas} | Тоот: ${m.toot || "-"} | Холбоо: ${m.gishuuniiKholboo || "-"} | Эрх: ${m.gishuuniiErkh || "-"} | Үндсэн эзэн ID: ${m.undsenId}`);
    });
  }

  // 3. Also check if any orshinSuugch has a family members array or related fields
  const sampleWithFamily = await residentColl
    .find({
      $or: [
        { gerBul: { $exists: true, $ne: [] } },
        { gishuud: { $exists: true, $ne: [] } },
        { familyMembers: { $exists: true, $ne: [] } },
      ],
    })
    .toArray();

  if (sampleWithFamily.length > 0) {
    console.log("\n========================================================");
    console.log("👥 3. ARRAY БАЙДЛААР ХАДГАЛАГДСАН ГИШҮҮД:");
    console.log("Тоо:", sampleWithFamily.length);
    console.log(JSON.stringify(sampleWithFamily, null, 2));
  }

  console.log("========================================================\n");

  await mongoose.disconnect();
}

checkFamilyMembers().catch(console.error);
