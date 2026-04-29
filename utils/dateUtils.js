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

module.exports = {
  calculateNextDueDate,
};
