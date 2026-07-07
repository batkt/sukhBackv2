const express = require("express");
const app = express();
const http = require("http");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const server = http.Server(app);
const io = require("socket.io")(server, {
  pingTimeout: 20000,
  pingInterval: 10000,
});
const { createAdapter } = require("@socket.io/redis-adapter");
const { pubClient, subClient, connectRedis } = require("./utils/redisClient");

const dotenv = require("dotenv");
const cron = require("node-cron");

dotenv.config({ path: "./tokhirgoo/tokhirgoo.env" });

const baiguullagaRoute = require("./routes/baiguullagaRoute");
const ajiltanRoute = require("./routes/ajiltanRoute");
const orshinSuugchRoute = require("./routes/orshinSuugchRoute");
const khariltsagchRoute = require("./routes/khariltsagchRoute");
const walletRoute = require("./routes/walletRoute");
const licenseRoute = require("./routes/licenseRoute");
const nekhemjlekhiinZagvarRoute = require("./routes/nekhemjlekhiinZagvarRoute");
const bankniiGuilgeeRoute = require("./routes/bankniiGuilgeeRoute");
const gereeRoute = require("./routes/gereeRoute");
const dansRoute = require("./routes/dansRoute");
const gereeniiZagvarRoute = require("./routes/gereeniiZagvarRoute");
const nekhemjlekhRoute = require("./routes/nekhemjlekhRoute");
const nekhemjlekhCronRoute = require("./routes/cronScheduleRoute");
const qpayRoute = require("./routes/qpayRoute");
const ebarimtRoute = require("./routes/ebarimtRoute");
const tailanRoute = require("./routes/tailanRoute");
const pdfRoute = require("./routes/pdfRoute");
const medegdelRoute = require("./routes/medegdelRoute");
const msgRoute = require("./routes/msgRoute");
const mailRoute = require("./routes/mailRoute");
const ashiglaltiinZardluudRoute = require("./routes/ashiglaltiinZardluudRoute");
const zogsoolRoute = require("./routes/zogsoolRoute");
const parkingRoute = require("./routes/parkingRoute");
const uneguiMashinRoute = require("./routes/uneguiMashinRoute");
const zochinUrikhRoute = require("./routes/zochinUrikhRoute");
const auditRoute = require("./routes/auditRoute");
const transformationRoute = require("./routes/transformationRoute");
const walletQpayRoute = require("./routes/walletQpayRoute");
const appVersionRoute = require("./routes/appVersionRoute");
const blogRoute = require("./routes/blogRoute");
const cameraRoute = require("./routes/cameraRoute");
const neeyeRoute = require("./routes/neeyeRoute");



const { db } = require("zevbackv2");

const aldaaBarigch = require("./middleware/aldaaBarigch");
const { requestContextMiddleware } = require("./middleware/requestContext");
const { requestTimingMiddleware } = require("./middleware/requestTiming");
const { enableSlowQueryMonitor } = require("./utils/slowQueryMonitor");
const aiOpsAnalyzer = require("./utils/aiOpsAnalyzer");
const nekhemjlekhiinZagvar = require("./models/nekhemjlekhiinZagvar");
const nekhemjlekhController = require("./controller/nekhemjlekhController");
const NekhemjlekhCron = require("./models/cronSchedule");

process.setMaxListeners(0);
process.env.UV_THREADPOOL_SIZE = 20;

(async () => {
  try {
    console.log("🛠️ [INIT] Starting AmarSukh server initialization...");

    // Run self-healing patch for sdkService to stop auto-violation "Гарсан цаг тодорхойгүй!"
    try {
      const patchSdkService = require("./utils/patchSdkService");
      patchSdkService();
    } catch (patchErr) {
      console.error("❌ [INIT] Failed to run sdkService patch:", patchErr.message);
    }

    // Diagnostic: log any MongoDB query/aggregate slower than SLOW_QUERY_MS (default 500ms)
    enableSlowQueryMonitor();

    // 1. Connect to Redis (async). Required for Socket.IO to work correctly across
    // multiple PM2 cluster workers - without it, rooms/broadcasts (camera signaling,
    // tulburUpdated/baiguullagiin events) only reach sockets on the same worker.
    // Non-fatal if it fails: the server still boots and works correctly in
    // single-instance/fork mode, just without cross-worker socket support.
    console.log("🛠️ [INIT] Connecting to Redis...");
    const redisOk = await connectRedis();

    if (redisOk) {
      try {
        io.adapter(createAdapter(pubClient, subClient));
        console.log("✅ [INIT] Socket.IO Redis adapter attached");
      } catch (adapterErr) {
        console.error("❌ [INIT] Failed to attach Socket.IO Redis adapter:", adapterErr.message);
      }
    } else {
      console.warn(
        "⚠️ [INIT] Redis unavailable - Socket.IO running with in-memory adapter only. " +
        "Do NOT run this app with more than 1 PM2 instance until Redis is confirmed working, " +
        "or camera signaling / socket broadcasts will silently fail across workers.",
      );
    }

    // 3. Connect to MongoDB (zevbackv2) - Moved inside to catch errors
    const MONGODB_URI =
      process.env.MONGODB_URI ||
      "mongodb://admin:Br1stelback1@127.0.0.1:27017/amarSukh?authSource=admin";
    const maskedUri = MONGODB_URI.replace(/:([^:@]+)@/, ":****@");
    console.log(`🔌 [INIT] Connecting to MongoDB: ${maskedUri}`);

    db.kholboltUusgey(app, MONGODB_URI);
    console.log("✅ MongoDB initialization started");

    // --- DISABLE BROWSER CACHING ---
    app.use((req, res, next) => {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      next();
    });

    // 4. Final settings
    process.env.TZ = "Asia/Ulaanbaatar";
    app.set("socketio", io);

    // --- GATE WORKER SOCKET REGISTRATION ---
    io.on("connection", (socket) => {
      socket.on("register-gate-worker", (barilgiinId) => {
        socket.join(`gate-room-${barilgiinId}`);
        console.log(`🏠 [SOCKET] Local Gate Worker registered for Building: ${barilgiinId}`);
      });

      // Handle WebRTC answers from local workers
      socket.on("webrtc-answer", (data) => {
        cameraRoute.handleWebRTCAnswer(data);
      });
    });


    // 5. Start the HTTP server
    const PORT = process.env.PORT || 8084;
    console.log(`🚀 [INIT] Opening server on port ${PORT}...`);
    server.listen(PORT, () => {
      console.log(`✅ SUCCESS: AmarSukh server listening on port ${PORT}`);
      console.log(`🌐 [CONFIG] UNDSEN_SERVER: ${process.env.UNDSEN_SERVER || "NOT SET"}`);
    });
  } catch (err) {
    console.error("❌ CRITICAL: Failed to initialize server:", err);
    // Print stack trace in logs for easier debugging
    console.error(err.stack);
    process.exit(1);
  }
})();

// Safety for unhandled async errors
process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("❌ UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-real-ip",
      "Origin",
      "Accept",
      "X-Requested-With",
      "Cache-Control",
      "Pragma",
      "userId",
      "X-Org-Only",
    ],
  })
);

app.use(
  express.json({
    limit: "50mb",
    extended: true,
  }),
);

// db.kholboltUusgey moved inside init block for crash safety

app.use(
  express.urlencoded({ limit: "50mb", extended: true, parameterLimit: 50000 }),
);

app.use((req, res, next) => {
  if (!req.body) {
    req.body = {};
  }
  next();
});

// Block common exploit bot scanning patterns to keep logs clean
app.use((req, res, next) => {
  const urlLower = req.url.toLowerCase();

  // Check for common sensitive file targets
  if (
    urlLower.includes(".env") ||
    urlLower.includes("tokhirgoo") ||
    urlLower.includes("database.") ||
    urlLower.includes(".sql") ||
    urlLower.includes(".ini") ||
    urlLower.includes(".aws/") ||
    urlLower.includes("/aws") ||
    urlLower.includes(".git/")
  ) {
    // Immediately terminate the request with 404
    return res.status(404).end();
  }

  next();
});

app.use(requestContextMiddleware);
app.use(requestTimingMiddleware);

const {
  getMedegdelRoots,
  getMedegdelPublicRoot,
} = require("./config/medegdelPaths");
const serveMedegdelImage = (req, res, next) => {
  const fileName = (req.params.ner || "").replace(/\.\./g, "");
  const baiguullagiinId = (req.params.baiguullagiinId || "").replace(
    /\.\./g,
    "",
  );
  if (!fileName || !baiguullagiinId) {
    return res.status(404).json({ success: false, message: "Зураг олдсонгүй" });
  }
  const roots = getMedegdelRoots();
  let filePath = null;
  for (const root of roots) {
    const candidate = path.join(root, baiguullagiinId, fileName);
    if (fs.existsSync(candidate)) {
      filePath = path.resolve(candidate);
      break;
    }
    // Fallback: multer sometimes saves to root when baiguullagiinId isn't parsed yet (form field order)
    const fallback = path.join(root, fileName);
    if (fs.existsSync(fallback)) {
      filePath = path.resolve(fallback);
      break;
    }
  }

  if (filePath) {
    res.sendFile(filePath);
  } else {
    if (fileName.match(/\.(jpg|jpeg|png|gif|pdf|webp|webm|m4a)$/i)) {
      const tried = roots.map((r) => path.join(r, baiguullagiinId, fileName));
      console.log(
        `❌ [INDEX DEBUG] File not found (404). Tried: ${tried.join("; ")}`,
      );
      const body = { success: false, message: "Зураг олдсонгүй" };
      if (req.query.debug === "1") {
        body.tried = tried;
        body.uploadRoot = getMedegdelPublicRoot();
      }
      res.status(404).json(body);
    } else {
      next();
    }
  }
};

// Medegdel API (thread, reply, etc.) must be tried before image route so /medegdel/thread/:id is not matched as image
app.use("/wallet", walletRoute);
app.use(cameraRoute);
app.use(neeyeRoute);
app.use(walletQpayRoute);
app.use(baiguullagaRoute);
app.use(ajiltanRoute);
app.use(licenseRoute);
app.use(orshinSuugchRoute);
app.use(khariltsagchRoute);
app.use(gereeRoute);
app.use(gereeniiZagvarRoute);
app.use(nekhemjlekhiinZagvarRoute);
app.use(bankniiGuilgeeRoute);
app.use(dansRoute);
app.use(ebarimtRoute);
app.use("/nekhemjlekhCron", nekhemjlekhCronRoute);
app.use(medegdelRoute);
// Serve medegdel images only after API routes; otherwise /medegdel/thread/:id would be caught as :baiguullagiinId/:ner
app.get("/medegdel/:baiguullagiinId/:ner", serveMedegdelImage);
app.get("/api/medegdel/:baiguullagiinId/:ner", serveMedegdelImage);
app.get("/:baiguullagiinId/:ner", serveMedegdelImage);
app.use(msgRoute);
app.use(nekhemjlekhRoute);
app.use(qpayRoute);
app.use(tailanRoute);
app.use(pdfRoute);
app.use(mailRoute);
app.use(ashiglaltiinZardluudRoute);
app.use(zogsoolRoute);
app.use(parkingRoute);
app.use(uneguiMashinRoute);
app.use(zochinUrikhRoute);
app.use("/audit", auditRoute);
app.use(transformationRoute);
// walletQpayRoute moved to top
app.use(appVersionRoute);
app.use(blogRoute);

// Read-only feed of buffered errors/slow-requests/slow-queries for an external
// agent to pull and analyze. No login/JWT required - instead gated by a static
// shared secret (AI_LOGS_SECRET in tokhirgoo.env) so it's not wide open to the
// public internet. ?clear=true drains the buffer after returning it (so a
// polling agent only ever sees issues new since its last call).
app.get("/admin/logs", (req, res) => {
  const expectedKey = process.env.AI_LOGS_SECRET;
  const providedKey = req.query.key || req.headers["x-logs-key"];

  if (!expectedKey) {
    return res.status(503).json({
      success: false,
      message: "AI_LOGS_SECRET is not configured on the server - set it in tokhirgoo.env to enable this endpoint",
    });
  }
  if (providedKey !== expectedKey) {
    return res.status(401).json({ success: false, message: "Invalid or missing key" });
  }

  const issues = aiOpsAnalyzer.getIssues();
  if (req.query.clear === "true") aiOpsAnalyzer.clearIssues();
  res.json({ success: true, generatedAt: new Date().toISOString(), issues });
});



app.use(aldaaBarigch);

async function automataarNekhemjlekhUusgekh() {
  try {
    const { db } = require("zevbackv2");
    const Baiguullaga = require("./models/baiguullaga");
    const Geree = require("./models/geree");

    const odoo = new Date();
    const nekhemjlekhUusgekhOgnoo = odoo.getDate();

    console.log(
      "=== АВТОМАТААР НЭХЭМЖЛЭХ ҮҮСГЭХ - ӨДРИЙН АЖИЛЛАГАА ЭХЭЛЛЭЭ ===",
    );
    console.log(
      `📅 Огноо: ${odoo.toLocaleString("mn-MN", {
        timeZone: "Asia/Ulaanbaatar",
      })}`,
    );
    console.log(
      `🔍 Хайж байна: Сарын ${nekhemjlekhUusgekhOgnoo} өдрийн тохиргоо`,
    );

    const baiguullaguud = await Baiguullaga(db.erunkhiiKholbolt).find({});

    const tovchoonuud = [];

    for (const baiguullaga of baiguullaguud) {
      try {
        const tukhainBaaziinKholbolt = db.kholboltuud.find(
          (k) => k.baiguullagiinId === baiguullaga._id.toString(),
        );

        if (!tukhainBaaziinKholbolt) {
          console.log(`Байгууллага ${baiguullaga._id} холболт олдсонгүй`);
          continue;
        }

        // Find all schedules for today (both organization-level and building-level)
        const schedules = await NekhemjlekhCron(tukhainBaaziinKholbolt).find({
          nekhemjlekhUusgekhOgnoo: nekhemjlekhUusgekhOgnoo,
          idevkhitei: true,
          baiguullagiinId: baiguullaga._id.toString(),
        });

        console.log(
          `🔍 Байгууллага ${baiguullaga.ner}: ${schedules.length} тохиргоо олдлоо`,
        );

        for (const schedule of schedules) {
          tovchoonuud.push({
            ...schedule.toObject(),
            baiguullaga: baiguullaga,
          });
        }
      } catch (error) {
        console.log(
          `Байгууллага ${baiguullaga._id} шалгах алдаа:`,
          error.message,
        );
      }
    }

    if (tovchoonuud.length === 0) {
      console.log(
        `Сарын ${nekhemjlekhUusgekhOgnoo} өдрийн хувьд нэхэмжлэх үүсгэх тохиргоо олдсонгүй`,
      );
      return;
    }

    console.log(
      `Өнөөдрийн хувьд ${tovchoonuud.length} байгууллагын тохиргоо олдлоо`,
    );

    for (const tovchoo of tovchoonuud) {
      try {
        const baiguullaga = tovchoo.baiguullaga;
        console.log(
          `Байгууллага боловсруулах: ${baiguullaga.ner} (${baiguullaga._id})`,
        );

        const tukhainBaaziinKholbolt = db.kholboltuud.find(
          (k) => k.baiguullagiinId === baiguullaga._id.toString(),
        );

        // Process contracts based on schedule type (organization-level or building-level)
        // If schedule has barilgiinId, only process contracts for that building
        // If schedule has barilgiinId: null, process all contracts for the organization
        const gereeQuery = {
          baiguullagiinId: baiguullaga._id.toString(),
          tuluv: "Идэвхтэй", // Only active contracts
        };

        // If this is a building-level schedule, filter by barilgiinId
        if (tovchoo.barilgiinId) {
          gereeQuery.barilgiinId = tovchoo.barilgiinId;
        }

        const gereenuud = await Geree(tukhainBaaziinKholbolt).find(gereeQuery);

        if (gereenuud.length === 0) {
          console.log(
            `ℹ️  ${baiguullaga.ner
            }-д идэвхтэй гэрээ олдсонгүй (нийт: ${await Geree(
              tukhainBaaziinKholbolt,
            ).countDocuments({
              baiguullagiinId: baiguullaga._id.toString(),
            })})`,
          );
          continue;
        }

        console.log(
          `✅ ${baiguullaga.ner}-д ${gereenuud.length} идэвхтэй гэрээ боловсруулах олдлоо`,
        );

        const batchSize = 20;
        let processedCount = 0;
        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < gereenuud.length; i += batchSize) {
          const batch = gereenuud.slice(i, i + batchSize);

          const results = await Promise.allSettled(
            batch.map((geree) =>
              nekhemjlekhController.gereeNeesNekhemjlekhUusgekh(
                geree,
                baiguullaga,
                tukhainBaaziinKholbolt,
                "automataar",
              ),
            ),
          );

          results.forEach((result, index) => {
            processedCount++;
            if (result.status === "fulfilled" && result.value.success) {
              successCount++;
              const urdun = result.value;
              if (urdun.alreadyExists) {
                console.log(
                  `ℹ️  [${processedCount}/${gereenuud.length}] Гэрээ ${batch[index].gereeniiDugaar} - Нэхэмжлэх энэ сард аль хэдийн байна (${urdun.nekhemjlekh._id})`,
                );
              } else {
                console.log(
                  `✅ [${processedCount}/${gereenuud.length}] Гэрээ ${batch[index].gereeniiDugaar} - Шинэ нэхэмжлэх үүсгэлээ (${urdun.nekhemjlekh._id})`,
                );
                // Send SMS notification containing QPay deeplink
                const { sendInvoiceSmsNotification } = require("./services/invoiceSendService");
                sendInvoiceSmsNotification(
                  tukhainBaaziinKholbolt,
                  urdun.nekhemjlekh._id,
                  baiguullaga._id.toString()
                ).catch((err) => {
                  console.error(`❌ [CRON SMS] Failed to send SMS for invoice ${urdun.nekhemjlekh._id}:`, err.message);
                });
              }
            } else {
              errorCount++;
              const error =
                result.status === "rejected"
                  ? result.reason
                  : result.value?.error || "Unknown error";
              const errorMessage =
                error?.message || error?.toString() || JSON.stringify(error);
              console.error(
                `❌ [${processedCount}/${gereenuud.length}] Гэрээ ${batch[index].gereeniiDugaar} боловсруулах алдаа:`,
                errorMessage,
              );
            }
          });
        }

        console.log(
          `📊 ${baiguullaga.ner}: Төлөв - Amjilttai: ${successCount}, Aldaa: ${errorCount}, Niit: ${processedCount}`,
        );

        await NekhemjlekhCron(tukhainBaaziinKholbolt).findByIdAndUpdate(
          tovchoo._id,
          {
            suuldAjillasanOgnoo: new Date(),
          },
        );
      } catch (baiguullagiinAldaa) {
        console.error(
          `❌ Байгууллага ${tovchoo.baiguullagiinId} боловсруулах алдаа:`,
          baiguullagiinAldaa.message,
        );
      }
    }

    console.log(
      "=== АВТОМАТААР НЭХЭМЖЛЭХ ҮҮСГЭХ - ӨДРИЙН АЖИЛЛАГАА ДУУССАН ===",
    );
  } catch (aldaa) {
    console.error("❌ АВТОМАТААР НЭХЭМЖЛЭХ ҮҮСГЭХ АЛДАА:", aldaa);
  }
}

// Only the first instance in PM2 (instance 0) or the standalone process handles crons
if (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === "0") {
  // nehemjleh ilgeeh tsag
  const cronJob = cron.schedule(
    "01 01 * * *",
    function () {
      const now = new Date();
      console.log(
        `⏰ [CRON] Cron job triggered at ${now.toLocaleString("mn-MN", {
          timeZone: "Asia/Ulaanbaatar",
        })}`,
      );
      automataarNekhemjlekhUusgekh();
    },
    {
      scheduled: true,
      timezone: "Asia/Ulaanbaatar",
    },
  );

  cron.schedule(
    "20 7 * * * ",
    async function () {
      const zogsool = require("./controller/zogsool");
      if (zogsool && zogsool.archiveUilchluulegchKhonog) {
        await zogsool.archiveUilchluulegchKhonog();
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Ulaanbaatar",
    },
  );

  // 5-minute cron job for automatic bank statement fetching & resident payment matching
  let bankSyncCronRunning = false;
  cron.schedule(
    "*/1 * * * *",
    async function () {
      // Guard against overlapping runs: if a previous tick is still processing
      // tenants (e.g. slow bank API, many tenants), skip this tick instead of
      // stacking another full pass on top of it and competing for the same
      // Mongo connection pool that API requests use.
      if (bankSyncCronRunning) {
        console.warn("⏭️ [CRON] Previous bank-sync run still in progress, skipping this tick");
        return;
      }
      bankSyncCronRunning = true;

      const now = new Date();
      console.log(`⏰ [CRON] Statement fetching started at ${now.toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar" })}`);

      try {
        const { db } = require("zevbackv2");
        const cgw = require("./controller/cgw");
        const tulbur = require("./controller/tulbur");

        if (db.kholboltuud && db.kholboltuud.length > 0) {
          for (const kholbolt of db.kholboltuud) {
            try {
              console.log(`🔄 [CRON] Fetching statements for tenant: ${kholbolt.baiguullagiinId}`);

              // Mock request and response objects
              const req = {
                body: {
                  tukhainBaaziinKholbolt: kholbolt,
                  baiguullagiinId: kholbolt.baiguullagiinId
                },
                app: {
                  get: (key) => { if (key === "socketio") return app.get("socketio"); }
                }
              };

              const res = {
                status: function () { return this; },
                send: function () { },
                json: function () { }
              };

              const next = (err) => {
                if (err) console.error(`❌ [CRON] Statement fetch error for ${kholbolt.baiguullagiinId}:`, err.message || err);
              };

              // 1. Fetch bank statements (auto-deduplicated)
              await cgw.bankniiKhuulgaTatajKhadgalya(req, res, next);

              // 2. Identify resident payments (auto-matching by toot / phone)
              await tulbur.tulultTaniya(req, res, next);

            } catch (err) {
              console.error(`❌ [CRON] Error processing tenant ${kholbolt?.baiguullagiinId}:`, err.message || err);
            }
          }
        }
      } finally {
        bankSyncCronRunning = false;
      }
    },
    {
      scheduled: true,
      timezone: "Asia/Ulaanbaatar",
    }
  );

  console.log(
    "🕐 [CRON] Schedules enabled on Instance 0: 16:20 (Invoices), 07:20 (Parking Archive), and 5-min auto-CGW",
  );
} else {
  console.log(
    `🕐 [CRON] Schedules disabled on Instance ${process.env.NODE_APP_INSTANCE}`,
  );
}

console.log(
  "🕐 Cron job тохируулагдлаа: Өдөр бүр 16:18 цагт автоматаар нэхэмжлэх үүсгэх",
);
if (typeof cronJob !== "undefined") {
  console.log(
    `🕐 Cron job status: ${cronJob.running ? "Ажиллаж байна" : "Зогссон"}`,
  );
}
