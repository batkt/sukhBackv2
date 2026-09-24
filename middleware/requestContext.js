/**
 * Global request context middleware
 * Stores the current request so Mongoose hooks can access it.
 *
 * ЖИЧ: Өмнө нь ганц глобал хувьсагчид хадгалдаг байв — зэрэг ирсэн хоёр
 * хүсэлт бие биенээ дарж, засвар/устгалын түүх БУРУУ ажилтны нэр дээр
 * бичигдэх эрсдэлтэй байв. AsyncLocalStorage нь хүсэлт бүрийн async
 * гинжин дотор өөрийн контекстыг хадгална.
 */
const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

function setCurrentRequest(req) {
  // Контекстгүй газраас (cron, script) дуудвал шинэ контекст нээнэ
  storage.enterWith({ req });
}

function getCurrentRequest() {
  return storage.getStore()?.req || null;
}

function clearCurrentRequest() {
  const store = storage.getStore();
  if (store) store.req = null;
}

/**
 * Express middleware to set request context
 */
function requestContextMiddleware(req, res, next) {
  storage.run({ req }, () => next());
}

module.exports = {
  setCurrentRequest,
  getCurrentRequest,
  clearCurrentRequest,
  requestContextMiddleware,
};
