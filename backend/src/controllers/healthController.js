/**
 * Controller untuk health check
 */

import { prisma } from "../prisma.js";

/**
 * Handler untuk health check basic
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleHealthCheck = (_req, res) => {
  res.json({ ok: true });
};

/**
 * Handler untuk health check database
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleDbHealthCheck = async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, database: "up" });
  } catch {
    res.status(500).json({ ok: false, database: "down" });
  }
};