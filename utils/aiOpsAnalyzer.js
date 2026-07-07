/**
 * In-memory, deduplicated buffer of recent errors / slow requests / slow
 * queries. Exposed via GET /admin/logs (see index.js) so an external agent
 * can pull it and do its own analysis - this module does no AI calls itself.
 */
const MAX_BUFFER_SIGNATURES = 200; // safety cap so a runaway loop can't grow this unbounded

// signature -> { kind, sample, count, firstSeen, lastSeen, meta }
const issueBuffer = new Map();

function truncate(str, n) {
  if (!str) return str;
  return str.length > n ? str.slice(0, n) + "…" : str;
}

/**
 * Builds a dedup signature. Deliberately coarse - we want repeats of "the
 * same problem" to collapse into one bucket with a count, not one entry per
 * occurrence (that's exactly what flooded the logs on the camera timeout).
 */
function buildSignature(kind, message, meta) {
  if (kind === "error") {
    return `error|${truncate(message, 160)}`;
  }
  if (kind === "slow_query") {
    return `slow_query|${meta.db}|${meta.collection}.${meta.op}`;
  }
  if (kind === "slow_request") {
    // Strip obvious ID segments so /pay/check/<id1> and /pay/check/<id2> collapse together
    const normalizedPath = (meta.path || "").replace(/[0-9a-fA-F]{12,}/g, ":id");
    return `slow_request|${meta.method}|${normalizedPath}`;
  }
  return `${kind}|${truncate(message, 160)}`;
}

function recordIssue({ kind, message, meta = {} }) {
  const signature = buildSignature(kind, message, meta);
  const existing = issueBuffer.get(signature);
  const now = new Date();

  if (existing) {
    existing.count += 1;
    existing.lastSeen = now;
  } else {
    if (issueBuffer.size >= MAX_BUFFER_SIGNATURES) return; // safety cap
    issueBuffer.set(signature, {
      kind,
      sample: truncate(message, 500),
      meta,
      count: 1,
      firstSeen: now,
      lastSeen: now,
    });
  }
}

function getIssues() {
  return Array.from(issueBuffer.entries()).map(([signature, entry]) => ({
    signature,
    kind: entry.kind,
    count: entry.count,
    firstSeen: entry.firstSeen.toISOString(),
    lastSeen: entry.lastSeen.toISOString(),
    sample: entry.sample,
    meta: entry.meta,
  }));
}

function clearIssues() {
  issueBuffer.clear();
}

module.exports = {
  recordIssue,
  getIssues,
  clearIssues,
};
