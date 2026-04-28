const { db } = require('zevbackv2');
setTimeout(() => {
  if (db.kholboltuud && db.kholboltuud.length > 0) {
     console.log("type:", typeof db.kholboltuud[0].baiguullagiinId, "value:", db.kholboltuud[0].baiguullagiinId);
  } else {
     console.log("not ready or empty");
  }
  process.exit();
}, 2000);
