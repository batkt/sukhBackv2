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
