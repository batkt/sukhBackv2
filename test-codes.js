const { db } = require('./zevbackv2');
setTimeout(async () => {
   if (!db.kholboltuud || db.kholboltuud.length === 0) {
      console.log("No kholboltuud");
      process.exit();
   }
   console.log("Checking DB...");
   for (let k of db.kholboltuud) {
       const BatalgaajuulahCode = require('./models/batalgaajuulahCode')(k);
       // Find anything inserted in the last 60 minutes
       const tenMinsAgo = new Date(Date.now() - 60 * 60 * 1000);
       const codes = await BatalgaajuulahCode.find({ createdAt: { $gt: tenMinsAgo } }).lean();
       if (codes.length > 0) {
           console.log("Found codes in baiguullagiinId:", k.baiguullagiinId);
           console.log(codes);
       }
   }
   process.exit();
}, 2000);
