const FormData = require("form-data");
const axios = require("axios");
const fs = require("fs");

module.exports.backAvya = async function backAvya() {
  try {
    const { exec } = require("child_process");
    try {
      fs.unlinkSync("dump.tar");
    } catch (err) {
      throw err;
    }
    const { db } = require("zevbackv2");
    var backupDB = exec(
      "mongodump --host=" +
        "localhost" +
        " --port=" +
        "27017" +
        " --db=" +
        "ikhnayd" +
        " --archive=dump.tar" +
        "  --gzip",
      (err, stdout, stderr) => {
        if (stderr) {
          if (stderr.includes("error"))
            throw new Error("Back авах боломжгүй байна! exec aldaa");
          else {
            if (!fs.existsSync("dump.tar"))
              throw new Error("Back авах боломжгүй байна! exists aldaa");

            const form = new FormData();
            form.append("system", process.env.SYSTEM_NAME);
            form.append("ognoo", new Date().toString());
            form.append("file", fs.createReadStream("dump.tar"));
            axios({
              method: "post",
              url: "http://103.236.194.50:8282/backAvya",
              data: form,
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
              headers: { ...form.getHeaders() },
            })
              .then((response) => {
                // Handle response
              })
              .catch((error) => {
                // Handle error
              });
          }
        }
      }
    );
  } catch (err) {}
};
