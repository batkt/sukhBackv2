/**
 * Parse ognoo consistently for geree avlaga/tulult and nekhemjlekh payment flows.
 * - Date-only "YYYY-MM-DD": UTC midnight (same calendar day in Mongo ISO …Z).
 * - Strings with explicit Z / ±offset: native Date (client’s instant).
 * - "YYYY-MM-DD HH:mm" without zone: server local calendar + wall-clock.
 */
function parseOgnooKeepClock(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "string") {
    const s = value.trim();
    if (
      /[zZ]$/.test(s) ||
      /[+-]\d{2}:\d{2}$/.test(s) ||
      /[+-]\d{4}$/.test(s)
    ) {
      const parsed = new Date(s);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const y = Number(s.slice(0, 4));
      const mo = Number(s.slice(5, 7)) - 1;
      const d = Number(s.slice(8, 10));
      return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
    }

    const m = s.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
    );
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      const day = Number(m[3]);
      const hour = Number(m[4] || 0);
      const minute = Number(m[5] || 0);
      const second = Number(m[6] || 0);
      return new Date(year, month, day, hour, minute, second, 0);
    }
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

module.exports = { parseOgnooKeepClock };
