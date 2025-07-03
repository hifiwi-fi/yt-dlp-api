/**
 * Add milliseconds to a Date object.
 * @param {Date} date
 * @param {number} milliseconds
 * @returns {Date}
 */
export function addMillisecondsToDate (date, milliseconds) {
  return new Date(date.getTime() + milliseconds)
}
