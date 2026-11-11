// node --test tests/unit/shaltgaan.test.js
// Бааз, сүлжээ ашиглахгүй — зөвхөн middleware/shaltgaan.js-ийн логик.
process.env.APP_SECRET = process.env.APP_SECRET || "test-secret";

const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const shaltgaan = require("../../middleware/shaltgaan");

const ajiltan = jwt.sign({ id: "a1", ner: "Бат", erkh: "Админ" }, process.env.APP_SECRET, { expiresIn: "1h" });
const orshinSuugch = jwt.sign({ id: "o1", ner: "Дорж" }, process.env.APP_SECRET, { expiresIn: "1h" });
const service = jwt.sign({ id: "a1", ner: "gate" }, process.env.APP_SECRET);

function ajilluulya({ method, path, token, headers = {}, body = {} }) {
  const req = {
    method,
    path,
    headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
    query: {},
  };
  let status = null;
  let json = null;
  let nextDuudsan = false;
  const res = {
    status(s) { status = s; return this; },
    json(j) { json = j; return this; },
  };
  shaltgaan(req, res, () => { nextDuudsan = true; });
  return { req, status, json, nextDuudsan };
}

test("ажилтны DELETE шалтгаангүй бол 400", () => {
  const r = ajilluulya({ method: "DELETE", path: "/geree/1", token: ajiltan });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.json.kod, shaltgaan.KOD);
  assert.strictEqual(r.nextDuudsan, false);
});

test("кодолсон толгойгоор шалтгаан ирвэл нэвтрүүлж, req.shaltgaan-д хадгална", () => {
  const r = ajilluulya({
    method: "DELETE",
    path: "/geree/1",
    token: ajiltan,
    headers: { "x-shaltgaan": encodeURIComponent("Давхар бүртгэгдсэн") },
  });
  assert.strictEqual(r.nextDuudsan, true);
  assert.strictEqual(r.req.shaltgaan, "Давхар бүртгэгдсэн");
});

test("body.shaltgaan-ыг мөн хүлээн авна", () => {
  const r = ajilluulya({ method: "PUT", path: "/mashin/1", token: ajiltan, body: { shaltgaan: "Дугаар буруу" } });
  assert.strictEqual(r.nextDuudsan, true);
});

test("хэт богино шалтгааныг хүлээж авахгүй", () => {
  const r = ajilluulya({ method: "PUT", path: "/mashin/1", token: ajiltan, body: { shaltgaan: " a " } });
  assert.strictEqual(r.status, 400);
});

test("оршин суугч, сервис токен, токенгүй хүсэлтийг хаахгүй", () => {
  for (const token of [orshinSuugch, service, null]) {
    const r = ajilluulya({ method: "DELETE", path: "/orshinSuugch/1", token });
    assert.strictEqual(r.nextDuudsan, true);
  }
});

test("хамаарахгүй замууд", () => {
  for (const [method, path] of [
    ["PATCH", "/medegdel/1/kharsanEsekh"],
    ["PUT", "/medegdel/1"],
    ["PUT", "/uilchluulegch/1"],
    ["DELETE", "/wallet/billing/1"],
    ["GET", "/geree"],
    ["POST", "/geree"],
  ]) {
    const r = ajilluulya({ method, path, token: ajiltan });
    assert.strictEqual(r.nextDuudsan, true, `${method} ${path}`);
  }
  // медегдэл УСТГАХ нь шалтгаантай хэвээр
  assert.strictEqual(ajilluulya({ method: "DELETE", path: "/medegdel/1", token: ajiltan }).status, 400);
});

test("POST-оор хийгддэг устгал", () => {
  assert.strictEqual(ajilluulya({ method: "POST", path: "/deleteInvoice", token: ajiltan }).status, 400);
  assert.strictEqual(ajilluulya({ method: "POST", path: "/geree/1/adminUstgakh", token: ajiltan }).status, 400);
  // зөвхөн тоолох (dry-run) үед шаардахгүй
  const dry = ajilluulya({
    method: "POST",
    path: "/khariltsagch/1/adminUstgakh",
    token: ajiltan,
    body: { zovkhonShalgakh: true },
  });
  assert.strictEqual(dry.nextDuudsan, true);
});

test("тохиргоо болон бусад POST засвар", () => {
  for (const path of ["/baiguullaga/abc", "/guilgeeSalgaya", "/khungulultZasvarlaya", "/orshinSuugch/massUpdateKwt"]) {
    assert.strictEqual(ajilluulya({ method: "POST", path, token: ajiltan }).status, 400, path);
  }
});

test("gereeTsutslakh: body-ийн системийн бичвэрийг шалтгаан гэж тооцохгүй", () => {
  const body = { shaltgaan: "Гараж 1 давхрын 5 дугаар устгасан" };
  assert.strictEqual(ajilluulya({ method: "POST", path: "/gereeTsutslakh", token: ajiltan, body }).status, 400);
  const r = ajilluulya({
    method: "POST",
    path: "/gereeTsutslakh",
    token: ajiltan,
    body,
    headers: { "x-shaltgaan": encodeURIComponent("Гэрээ дууссан") },
  });
  assert.strictEqual(r.nextDuudsan, true);
  assert.strictEqual(r.req.shaltgaan, "Гэрээ дууссан");
});
