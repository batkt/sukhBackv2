const http = require("http");
const { recordIssue } = require("../utils/aiOpsAnalyzer");

function truncateStack(stack) {
  if (!stack) return stack;
  return stack.split("\n").slice(0, 5).join("\n");
}

function aldaagIlgeeye(aldaa, req) {
  const data = new TextEncoder().encode(
    JSON.stringify({
      system: "AmarSukh",
      aldaa: aldaa,
      aldaaniiMsg: aldaa.message,
      ognoo: new Date(),
      baiguullagiinId: req.body?.baiguullagiinId,
      burtgesenAjiltaniiId: req.body?.nevtersenAjiltniiToken?.id,
      burtgesenAjiltaniiNer: req.body?.nevtersenAjiltniiToken?.ner,
    })
  );
  const options = {
    hostname: "103.236.194.68",
    port: 8282,
    path: "/aldaa",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };
  const request = http.request(options, (response) => {
    response.on("data", (d) => {});
  });
  request.on("error", (error) => {});

  request.write(data);
  request.end();
}
/**
 * Mongo/JS-ийн дотоод (англи) алдааг хэрэглэгчид ойлгомжтой монгол мэдэгдэл
 * болгоно — вэб, апп хоёуланд нэг ижил текст очно. `jwt expired`,
 * `jwt malformed`-ийг ЗОРИУД хөндөхгүй: вэб (uilchilgee.ts) ба апп
 * (api_service.dart) энэ мөрөөр нь танин дахин нэвтрүүлдэг.
 * Монгол текстэй (aldaa-аар шидсэн) мэдэгдлийг хэвээр үлдээнэ.
 */
function ilerkhiiAldaaOrchuulya(err) {
  const msg = String(err?.message || "");
  if (!msg || /jwt/i.test(msg)) return null;
  if (/[А-Яа-яӨөҮүЁё]/.test(msg)) return null;
  const lower = msg.toLowerCase();

  if (err?.code === 11000 || lower.includes("e11000") || lower.includes("duplicate key"))
    return "Энэ мэдээлэл аль хэдийн бүртгэгдсэн байна.";
  if (err?.name === "CastError" || lower.includes("cast to objectid"))
    return "Хүссэн мэдээлэл олдсонгүй. Мэдээллээ шалгаад дахин оролдоно уу.";
  if (err?.name === "ValidationError" || lower.includes("validation failed"))
    return "Оруулсан мэдээлэл дутуу эсвэл буруу байна. Шалгаад дахин оролдоно уу.";
  if (lower.includes("is required") || lower.includes("required"))
    return "Шаардлагатай мэдээлэл дутуу байна. Бүх талбарыг бөглөөд дахин оролдоно уу.";
  if (lower.includes("not found"))
    return "Хүссэн мэдээлэл олдсонгүй.";
  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("etimedout"))
    return "Сервер хариу өгөхгүй удаж байна. Түр хүлээгээд дахин оролдоно уу.";
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("econnreset") || lower.includes("socket hang up"))
    return "Холбогдох үйлчилгээтэй холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.";
  if (
    err instanceof TypeError ||
    err instanceof ReferenceError ||
    lower.includes("cannot read prop") ||
    lower.includes("is not a function") ||
    lower.includes("is not defined") ||
    lower.includes("undefined")
  )
    return "Серверт түр алдаа гарлаа. Хэсэг хугацааны дараа дахин оролдоно уу.";
  return null;
}

const aldaaBarigch = (err, req, res, next) => {
  try {
    // Log error to console
    console.error("❌ [aldaaBarigch] Error caught:", {
      message: err.message,
      stack: err.stack,
      kod: err.kod,
      url: req.url,
      method: req.method,
      body: req.body ? {
        mashiniiDugaar: req.body.mashiniiDugaar,
        CAMERA_IP: req.body.CAMERA_IP,
        barilgiinId: req.body.barilgiinId,
        baiguullagiinId: req.body.baiguullagiinId,
        invoice_id: req.body.invoice_id || req.body.invoiceId,
        billingId: req.body.billingId,
      } : undefined,
    });
    
    recordIssue({
      kind: "error",
      message: err.message,
      meta: { url: req.url, method: req.method, stack: truncateStack(err.stack) },
    });

    if (req.body && req.body.nevtersenAjiltniiToken) aldaagIlgeeye(err, req);
    if (!!err.message && err.message.includes("indexTalbar_1 dup key"))
      err.message = "Нэвтрэх нэр давхардаж байна!";
    else if (
      !!err.message &&
      !!err.message.includes("connect ECONNREFUSED 103.236.194.68:8282")
    ) {
      err.message = "Лицензийн хэсэгтэй холбогдоход алдаа гарлаа!";
    } else {
      const ilerkhii = ilerkhiiAldaaOrchuulya(err);
      // Зөвхөн текстийг солино, статус кодыг хэвээр үлдээнэ.
      if (ilerkhii) err.message = ilerkhii;
    }
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cache-Control, Pragma, userId");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    
    res.status(err.kod || 500).json({
      success: false,
      aldaa: err.message,
    });
  } catch (error) {
    console.error("❌ [aldaaBarigch] Error in error handler:", error);
    if (!!next) next(error);
  }
};

module.exports = aldaaBarigch;
