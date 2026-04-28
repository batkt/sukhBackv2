/**
 * Billing cycle boundaries in Mongolia (Asia/Ulaanbaatar) wall-clock.
 * Live invoice duplicate detection must match "today" and cycle day as users see them in UB,
 * not UTC-only or whatever the host OS default timezone is before index.js sets TZ.
 */

const UB_TZ = "Asia/Ulaanbaatar";

/** Mongolia has been UTC+8 year-round (no DST) since 2015. */
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * @returns {{ year: number, month: number, day: number }} month is 0–11
 */
function getUbCalendarParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: UB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value) - 1;
  const day = Number(parts.find((p) => p.type === "day").value);
  return { year, month, day };
}

function daysInCalendarMonth(year, monthIndex0) {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function clampDayToMonth(year, monthIndex0, day) {
  const max = daysInCalendarMonth(year, monthIndex0);
  return Math.min(day, max);
}

/**
 * Absolute instant for 00:00:00 on the given UB calendar date (wall clock).
 */
function startOfUbWallClockDay(year, monthIndex0, day) {
  const d = clampDayToMonth(year, monthIndex0, day);
  return new Date(Date.UTC(year, monthIndex0, d, 0, 0, 0, 0) - UB_OFFSET_MS);
}

function addOneCalendarMonth(year, monthIndex0, day) {
  let m = monthIndex0 + 1;
  let y = year;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  const d = clampDayToMonth(y, m, day);
  return { year: y, month: m, day: d };
}

/**
 * Live billing: half-open [monthStart, nextCycleStart) in UB, same rule as cron intent.
 * @param {number|null|undefined} scheduledDay — nekhemjlekhUusgekhOgnoo (1–31) or null for calendar month
 */
function getLiveBillingCycleBoundsUb(scheduledDay, now = new Date()) {
  const { year: y, month: m0, day: todayD } = getUbCalendarParts(now);

  let msY;
  let msM0;
  let msD;

  if (
    scheduledDay != null &&
    Number.isFinite(Number(scheduledDay)) &&
    scheduledDay >= 1 &&
    scheduledDay <= 31
  ) {
    if (todayD >= scheduledDay) {
      msY = y;
      msM0 = m0;
      msD = clampDayToMonth(y, m0, scheduledDay);
    } else {
      let py = y;
      let pm = m0 - 1;
      if (pm < 0) {
        pm = 11;
        py -= 1;
      }
      msY = py;
      msM0 = pm;
      msD = clampDayToMonth(py, pm, scheduledDay);
    }
  } else {
    msY = y;
    msM0 = m0;
    msD = 1;
  }

  const monthStart = startOfUbWallClockDay(msY, msM0, msD);
  const next = addOneCalendarMonth(msY, msM0, msD);
  const nextCycleStart = startOfUbWallClockDay(next.year, next.month, next.day);

  return { monthStart, nextCycleStart };
}

/**
 * UI "April 2026" must map to the billing cycle that contains the end of that calendar month.
 * Anchoring on the 1st wrongly picks the previous cycle (e.g. day-20 schedule → Mar 20–Apr 20),
 * so a March 21 invoice incorrectly matches "April".
 *
 * @param {number|null|undefined} scheduledDay
 * @param {number} year — full year, e.g. 2026
 * @param {number} monthIndex0 — 0 = January
 */
function getCycleBoundsForTargetCalendarMonthUb(scheduledDay, year, monthIndex0) {
  const lastD = daysInCalendarMonth(year, monthIndex0);
  const start = startOfUbWallClockDay(year, monthIndex0, lastD);
  const refInstant = new Date(start.getTime() + 12 * 60 * 60 * 1000);
  return getLiveBillingCycleBoundsUb(scheduledDay, refInstant);
}

module.exports = {
  UB_TZ,
  getUbCalendarParts,
  getLiveBillingCycleBoundsUb,
  getCycleBoundsForTargetCalendarMonthUb,
  startOfUbWallClockDay,
  clampDayToMonth,
  daysInCalendarMonth,
};
