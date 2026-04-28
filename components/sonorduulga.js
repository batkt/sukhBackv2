const Sonorduulga = require("../models/sonorduulga");

async function ilgeeye(io, medegdel, tukhainBaaziinKholbolt) {
  let sonorduulga = new Sonorduulga(tukhainBaaziinKholbolt)();
  sonorduulga.baiguullagiinId = medegdel.baiguullagiinId;
  sonorduulga.barilgiinId = medegdel.barilgiinId;
  if (medegdel.barilgiinId && medegdel.turul != "daalgavar")
    sonorduulga.khuleenAvagchiinId = medegdel.barilgiinId;
  else if (medegdel.turul == "daalgavar")
    sonorduulga.khuleenAvagchiinId = medegdel.khuleenAvagchiinId;
  sonorduulga.turul = medegdel.turul;
  sonorduulga.ognoo = new Date();
  sonorduulga.object = medegdel;
  sonorduulga
    .save()
    .then((result) => {
      io.emit("baiguullaga" + medegdel.baiguullagiinId, medegdel);
    })
    .catch((err) => {
      
    });
}

async function sonorduulgauzsenbolgoyo(id, tukhainBaaziinKholbolt) {
  Sonorduulga(tukhainBaaziinKholbolt)
    .updateMany({ _id: id }, { $set: { kharsanEsekh: true } })
    .then((res) => {});
}
module.exports = {
  ilgeeye,
  sonorduulgauzsenbolgoyo,
};
