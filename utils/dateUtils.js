/**
 * Calculates the next occurrence of a specific day of the month.
 * Useful for determining due dates based on a billing cycle day.
 * 
 * @param {number} cycleDay - The day of the month (1-31)
 * @param {Date} fromDate - The reference date (defaults to now)
 * @returns {Date} The next occurrence of the cycle day at 00:00:00
 */
function calculateNextDueDate(cycleDay, fromDate = new Date()) {
  const date = new Date(fromDate);
  date.setHours(0, 0, 0, 0);

  const currentDay = date.getDate();

  // If today is past the cycle day, or it IS the cycle day, move to next month
  if (currentDay >= cycleDay) {
    date.setDate(1); // Prevent rollover when month has fewer days than current date
    date.setMonth(date.getMonth() + 1);
  }

  // Handle months with fewer days (e.g., cycleDay 31 in February)
  const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(cycleDay, lastDayOfMonth));

  return date;
}

/**
 * Calculates the exact billing cycle bounds [startOfCycle, endOfCycle] 
 * based on the building's cron cycle day and a given date.
 */
function calculateBillingCycleBounds(cycleDay, fromDate = new Date()) {
  const date = new Date(fromDate);
  
  let startYear = date.getFullYear();
  let startMonth = date.getMonth();
  
  // If the current date is strictly before the cycle day, 
  // the cycle actually started in the PREVIOUS month.
  if (date.getDate() < cycleDay) {
    startMonth -= 1;
    if (startMonth < 0) {
      startMonth = 11;
      startYear -= 1;
    }
  }

  // Handle months with fewer days for start date
  const lastDayOfStartMonth = new Date(startYear, startMonth + 1, 0).getDate();
  const actualStartDay = Math.min(cycleDay, lastDayOfStartMonth);
  
  const startOfCycle = new Date(startYear, startMonth, actualStartDay, 0, 0, 0, 0);

  // End date is next month's cycle day minus 1 millisecond
  let endMonth = startMonth + 1;
  let endYear = startYear;
  if (endMonth > 11) {
    endMonth = 0;
    endYear += 1;
  }
  
  const lastDayOfEndMonth = new Date(endYear, endMonth + 1, 0).getDate();
  const actualEndDay = Math.min(cycleDay, lastDayOfEndMonth);
  
  const endOfCycle = new Date(endYear, endMonth, actualEndDay, 0, 0, 0, 0);
  endOfCycle.setTime(endOfCycle.getTime() - 1);
  
  return { startOfCycle, endOfCycle };
}

module.exports = {
  calculateNextDueDate,
  calculateBillingCycleBounds,
};
