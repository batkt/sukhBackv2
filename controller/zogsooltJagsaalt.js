const Uilchluulegch = require("sukhParking-v1");

module.exports.archiveUilchluulegch = async function archiveUilchluulegch() {
  try {
    const { db } = require("zevbackv2");
    const kholboltuud = db.kholboltuud;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (!kholboltuud || kholboltuud.length === 0) {
      return;
    }

    for (const kholbolt of kholboltuud) {
      try {
        

        // Find all distinct months in the collection
        const months = await Uilchluulegch(kholbolt).aggregate([
          {
            $project: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
          },
          { $group: { _id: { year: "$year", month: "$month" } } },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ]);

        

        for (const { _id } of months) {
          const y = _id.year;
          const m = _id.month;

          // Skip current month
          if (y === currentYear && m === currentMonth) {
            continue;
          }

          const archiveName = `Uilchluulegch${y}${String(m).padStart(2, "0")}`;
         
          // Count documents in main collection for this month
          const mainCount = await Uilchluulegch(kholbolt).countDocuments({
            "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
            createdAt: { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) },
          });

          // Count documents already in archive
          const archiveCount = await Uilchluulegch(
            kholbolt,
            false,
            archiveName
          ).countDocuments();

          // Check if archiving is already complete
          if (archiveCount > 0 && archiveCount === mainCount) {
            continue;
          }

          // Skip if no documents to archive
          if (mainCount === 0) {
            continue;
          }

          // Fetch documents to archive
          const data = await Uilchluulegch(kholbolt)
            .find({
              "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
              createdAt: {
                $gte: new Date(y, m - 1, 1),
                $lt: new Date(y, m, 1),
              },
            })
            .lean();

          if (!data || data.length === 0) {
            continue;
          }


          // Insert into archive collection
          const insertResult = await Uilchluulegch(
            kholbolt,
            false,
            archiveName
          ).insertMany(data, {
            ordered: false, // Continue on duplicate key errors
          });

          const insertedCount =
            insertResult?.insertedCount || insertResult?.length || 0;
          
          // Verify insertion before deleting
          if (insertedCount !== data.length) {
            continue;
          }

          // Delete from main collection
          const deleteResult = await Uilchluulegch(kholbolt).deleteMany({
            "tuukh.0.tsagiinTuukh.0.garsanTsag": { $exists: true },
            createdAt: { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) },
          });
        }
      } catch (kholboltError) {
        
      }
    }
  } catch (error) {
    
  }
};
