/**
 * Utility functions untuk date operations
 */

/**
 * Convert date ke ISO string atau null
 * @param {Date|string|null} value - Date value
 * @returns {string|null} ISO string atau null
 */
export const toIsoStringOrNull = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Get date key dalam format YYYY-MM-DD
 * @param {Date} date - Date object (default: current date)
 * @returns {string} Date key
 */
export const getDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

/**
 * Cek apakah dua date key sama (sama hari)
 * @param {string} key1 - Date key pertama
 * @param {string} key2 - Date key kedua
 * @returns {boolean} True jika sama
 */
export const isSameDateKey = (key1, key2) => key1 === key2;

/**
 * Format date untuk display
 * @param {Date|string} date - Date yang akan diformat
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
export const formatDateForDisplay = (date, options = {}) => {
  const dateObj = date instanceof Date ? date : new Date(date);
  return dateObj.toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  });
};