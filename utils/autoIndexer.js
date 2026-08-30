const mongoose = require("mongoose");

/**
 * Exact High-Performance Compound Indexes for AmarSukh Multi-Tenant MongoDB Databases.
 */
const INDEX_DEFINITIONS = {
  guilgeeavlaguud: [
    { spec: { baiguullagiinId: 1, barilgiinId: 1 }, options: { background: true, name: "idx_org_bldg" } },
    { spec: { baiguullagiinId: 1, barilgiinId: 1, ognoo: -1 }, options: { background: true, name: "idx_org_bldg_ognoo" } },
    { spec: { baiguullagiinId: 1, barilgiinId: 1, dun: 1 }, options: { background: true, name: "idx_org_bldg_dun" } },
    { spec: { baiguullagiinId: 1, gereeniiId: 1, ognoo: -1 }, options: { background: true, name: "idx_org_geree_ognoo" } },
    { spec: { baiguullagiinId: 1, gereeniiId: 1 }, options: { background: true, name: "idx_org_geree" } },
    { spec: { baiguullagiinId: 1, ognoo: -1 }, options: { background: true, name: "idx_org_ognoo" } },
    { spec: { baiguullagiinId: 1 }, options: { background: true, name: "idx_org" } },
    { spec: { gereeniiId: 1, ognoo: -1 }, options: { background: true, name: "idx_geree_ognoo" } },
    { spec: { gereeniiId: 1 }, options: { background: true, name: "idx_geree" } },
    { spec: { nekhemjlekhId: 1 }, options: { background: true, name: "idx_nekhemjlekhId" } },
    { spec: { baiguullagiinId: 1, dun: 1, ognoo: -1 }, options: { background: true, name: "idx_org_dun_ognoo" } },
    { spec: { bankniiGuilgeeId: 1 }, options: { background: true, name: "idx_bankniiGuilgeeId" } },
    { spec: { tulburGuilgeeId: 1 }, options: { background: true, name: "idx_tulburGuilgeeId" } },
  ],
  geree: [
    { spec: { baiguullagiinId: 1, barilgiinId: 1 }, options: { background: true, name: "idx_org_bldg" } },
    { spec: { baiguullagiinId: 1, barilgiinId: 1, tuluv: 1 }, options: { background: true, name: "idx_org_bldg_tuluv" } },
    { spec: { barilgiinId: 1 }, options: { background: true, name: "idx_barilgiinId" } },
    { spec: { baiguullagiinId: 1, gereeniiDugaar: 1 }, options: { background: true, name: "idx_org_gereeniiDugaar" } },
    { spec: { orshinSuugchId: 1 }, options: { background: true, name: "idx_orshinSuugchId" } },
    { spec: { baiguullagiinId: 1, toot: 1 }, options: { background: true, name: "idx_org_toot" } },
    { spec: { toot: 1 }, options: { background: true, name: "idx_toot" } },
  ],
  nekhemjlekh: [
    { spec: { baiguullagiinId: 1, barilgiinId: 1, ognoo: -1 }, options: { background: true, name: "idx_org_bldg_ognoo" } },
    { spec: { baiguullagiinId: 1, barilgiinId: 1 }, options: { background: true, name: "idx_org_bldg" } },
    { spec: { baiguullagiinId: 1, gereeniiId: 1, ognoo: -1 }, options: { background: true, name: "idx_org_geree_ognoo" } },
    { spec: { baiguullagiinId: 1, gereeniiId: 1 }, options: { background: true, name: "idx_org_geree" } },
    { spec: { gereeniiId: 1, ognoo: -1 }, options: { background: true, name: "idx_geree_ognoo" } },
    { spec: { ognoo: -1 }, options: { background: true, name: "idx_ognoo" } },
    { spec: { tuluv: 1 }, options: { background: true, name: "idx_tuluv" } },
    { spec: { baiguullagiinId: 1 }, options: { background: true, name: "idx_org" } },
  ],
  nekhemjlekhiintuukh: [
    { spec: { baiguullagiinId: 1, barilgiinId: 1, ognoo: -1 }, options: { background: true, name: "idx_org_bldg_ognoo" } },
    { spec: { baiguullagiinId: 1, barilgiinId: 1 }, options: { background: true, name: "idx_org_bldg" } },
    { spec: { baiguullagiinId: 1, gereeniiId: 1, ognoo: -1 }, options: { background: true, name: "idx_org_geree_ognoo" } },
    { spec: { baiguullagiinId: 1, gereeniiId: 1 }, options: { background: true, name: "idx_org_geree" } },
    { spec: { gereeniiId: 1, ognoo: -1 }, options: { background: true, name: "idx_geree_ognoo" } },
    { spec: { ognoo: -1 }, options: { background: true, name: "idx_ognoo" } },
    { spec: { tuluv: 1 }, options: { background: true, name: "idx_tuluv" } },
    { spec: { baiguullagiinId: 1, ognoo: -1, tuluv: 1 }, options: { background: true, name: "idx_org_ognoo_tuluv" } },
    { spec: { baiguullagiinId: 1 }, options: { background: true, name: "idx_org" } },
  ],
  orshinsuugch: [
    { spec: { baiguullagiinId: 1, barilgiinId: 1 }, options: { background: true, name: "idx_org_bldg" } },
    { spec: { baiguullagiinId: 1, utas: 1 }, options: { background: true, name: "idx_org_utas" } },
    { spec: { baiguullagiinId: 1, register: 1 }, options: { background: true, name: "idx_org_register" } },
    { spec: { barilgiinId: 1 }, options: { background: true, name: "idx_bldg" } },
  ],
  bankniiguilgee: [
    { spec: { baiguullagiinId: 1, ognoo: -1 }, options: { background: true, name: "idx_org_ognoo" } },
    { spec: { baiguullagiinId: 1, tulsunEsekh: 1 }, options: { background: true, name: "idx_org_tulsun" } },
    { spec: { journalId: 1 }, options: { background: true, name: "idx_journalId" } },
  ],
  toot: [
    { spec: { baiguullagiinId: 1, barilgiinId: 1, davkhar: 1, orts: 1 }, options: { background: true, name: "idx_org_bldg_davkhar_orts" } },
    { spec: { baiguullagiinId: 1, barilgiinId: 1 }, options: { background: true, name: "idx_org_bldg" } },
  ],
};

/**
 * Ensures indexes on a specific database connection.
 */
async function ensureConnectionIndexes(conn, dbLabel = "unknown") {
  if (!conn) return 0;
  let createdCount = 0;

  try {
    const rawDb = conn.db || (conn.connection && conn.connection.db);
    if (!rawDb) return 0;

    const collections = await rawDb.listCollections().toArray();

    for (const [collKey, indexes] of Object.entries(INDEX_DEFINITIONS)) {
      // Find matching collection (case-insensitive, handles singular/plural)
      const targetColl = collections.find(
        (c) =>
          c.name.toLowerCase() === collKey ||
          c.name.toLowerCase() === collKey + "s" ||
          c.name.toLowerCase() === collKey + "es" ||
          c.name.toLowerCase().replace(/s$/, "") === collKey
      );

      if (!targetColl) continue;

      const coll = rawDb.collection(targetColl.name);
      for (const { spec, options } of indexes) {
        try {
          await coll.createIndex(spec, options);
          createdCount++;
        } catch (idxErr) {
          if (!idxErr.message.includes("already exists") && idxErr.code !== 85 && idxErr.code !== 86) {
            console.warn(`⚠️ [INDEX] ${dbLabel} ${targetColl.name}: ${idxErr.message}`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`❌ [INDEX] Error syncing indexes for ${dbLabel}:`, err.message);
  }

  return createdCount;
}

/**
 * Scans all tenant databases and syncs all compound indexes.
 */
async function syncAllTenantIndexes() {
  console.log("⚡ [AUTO-INDEXER] Starting MongoDB index synchronization across all tenants...");
  const { db } = require("zevbackv2");
  let totalIndexedConnections = 0;
  let totalIndexesApplied = 0;

  // 1. Sync Erunkhii Kholbolt (Main DB)
  if (db.erunkhiiKholbolt) {
    const mainCount = await ensureConnectionIndexes(db.erunkhiiKholbolt, "MainDB");
    totalIndexesApplied += mainCount;
    totalIndexedConnections++;
  }

  // 2. Sync All Tenant Databases
  if (Array.isArray(db.kholboltuud) && db.kholboltuud.length > 0) {
    for (const tenant of db.kholboltuud) {
      const conn = tenant.kholbolt;
      const label = tenant.baiguullagiinNer || tenant.baiguullagiinId || "Tenant";
      const count = await ensureConnectionIndexes(conn, label);
      totalIndexesApplied += count;
      totalIndexedConnections++;
    }
  }

  console.log(
    `✅ [AUTO-INDEXER] Index sync completed: ${totalIndexesApplied} index specs checked across ${totalIndexedConnections} databases.`
  );
}

module.exports = {
  syncAllTenantIndexes,
  ensureConnectionIndexes,
  INDEX_DEFINITIONS,
};
