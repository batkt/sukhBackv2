/**
 * Patches mongoose Query/Aggregate exec() to log slow MongoDB operations.
 * Works across every tenant connection because all `conn.model(...)` calls in this
 * codebase share the single hoisted `mongoose` module instance (Query/Aggregate
 * prototypes are global, not per-connection).
 */
const mongoose = require("mongoose");
const { recordIssue } = require("./aiOpsAnalyzer");

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_MS || "500", 10);

function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return "<unserializable>";
  }
}

function patchExec(proto, kindLabel) {
  const originalExec = proto.exec;
  if (originalExec.__slowQueryPatched) return;

  proto.exec = function patchedExec(...args) {
    const start = process.hrtime.bigint();
    const result = originalExec.apply(this, args);

    const finish = () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      if (ms < SLOW_QUERY_MS) return;

      const collection =
        this.mongooseCollection?.name ||
        this._model?.collection?.name ||
        "?";
      const dbName = this.mongooseCollection?.conn?.name || this._model?.db?.name || "?";
      const op = this.op || kindLabel;
      let detail = "{}";
      if (typeof this.getQuery === "function") {
        detail = safeStringify(this.getQuery());
      } else if (this._pipeline) {
        detail = safeStringify(this._pipeline);
      }

      console.warn(
        `🐢 [SLOW QUERY] ${ms.toFixed(1)}ms db=${dbName} ${collection}.${op} ${detail.slice(0, 400)}`,
      );
      recordIssue({
        kind: "slow_query",
        message: `${ms.toFixed(1)}ms ${collection}.${op} ${detail.slice(0, 400)}`,
        meta: { db: dbName, collection, op, ms: Math.round(ms) },
      });
    };

    if (result && typeof result.then === "function") {
      result.then(finish, finish);
    }
    return result;
  };
  proto.exec.__slowQueryPatched = true;
}

function enableSlowQueryMonitor() {
  patchExec(mongoose.Query.prototype, "query");
  patchExec(mongoose.Aggregate.prototype, "aggregate");
  console.log(`🐢 [SLOW QUERY MONITOR] Enabled (threshold=${SLOW_QUERY_MS}ms)`);
}

module.exports = { enableSlowQueryMonitor };
