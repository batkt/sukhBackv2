const dotEnv = require("dotenv");
dotEnv.config({ path: "./tokhirgoo/tokhirgoo.env" });

module.exports = {
  PORT: process.env.PORT,
  DB_URL: process.env.MONGODB_URI,
  APP_SECRET: process.env.APP_SECRET,
  UNDSEN_IP: process.env.UNDSEN_IP,
  BAAZ: process.env.BAAZ,
  MSG_SERVER: process.env.MSG_SERVER,
  TOKI_SERVER: process.env.TOKI_SERVER,
  TOKI_USERNAME: process.env.TOKI_USERNAME,
  TOKI_PASSWORD: process.env.TOKI_PASSWORD,
  TOKI_3RD_PARTY: process.env.TOKI_3RD_PARTY,
};
