/**
 * Utility functions untuk file operations
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Cek apakah file ada
 * @param {string} filePath - Path ke file
 * @returns {Promise<boolean>} True jika file ada
 */
export const fileExists = async (filePath) => {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Buat nama file yang aman
 * @param {string} originalName - Nama file original
 * @returns {string} Nama file yang aman
 */
export const createSafeFileName = (originalName) => {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stamp = Date.now();
  return `${stamp}-${safeName}`;
};

/**
 * Hapus file secara aman (jika ada)
 * @param {string} filePath - Path ke file
 * @returns {Promise<void>}
 */
export const deleteFileIfExists = async (filePath) => {
  try {
    if (await fileExists(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    // Log error tapi jangan throw
    console.warn(`Failed to delete file ${filePath}:`, error.message);
  }
};

/**
 * Get file extension dalam lowercase
 * @param {string} fileName - Nama file
 * @returns {string} Extension tanpa titik
 */
export const getFileExtension = (fileName) => {
  return path.extname(fileName).toLowerCase().replace(".", "");
};

/**
 * Get file size dalam format human readable
 * @param {number} bytes - Size dalam bytes
 * @returns {string} Human readable size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};