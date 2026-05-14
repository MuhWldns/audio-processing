/**
 * Controller untuk license verification
 * Called from Roblox game servers to validate license keys
 */

import { prisma } from "../prisma.js";

/**
 * POST /api/verify-license - Verify a license key from Roblox
 * 
 * Body: { licenseKey, gameId, gameName? }
 * Response: { valid: boolean, product?: {...}, license?: {...}, message: string }
 * 
 * This endpoint does NOT require session auth - it uses the license key itself.
 * Rate limited separately to prevent abuse.
 */
export const handleVerifyLicense = async (req, res) => {
  const { licenseKey, gameId, gameName } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || null;
  const userAgent = req.headers["user-agent"] || null;

  // Validate input
  if (!licenseKey || !gameId) {
    return res.status(400).json({
      valid: false,
      message: "licenseKey and gameId are required",
    });
  }

  const gameIdStr = String(gameId).trim();

  // Find license
  const license = await prisma.license.findUnique({
    where: { licenseKey },
    include: {
      product: {
        select: { id: true, name: true, version: true, active: true },
      },
      gameWhitelist: {
        where: { gameId: gameIdStr, active: true },
      },
    },
  });

  // License not found
  if (!license) {
    await logVerification(null, gameIdStr, ipAddress, userAgent, false, "License key not found");
    return res.status(200).json({
      valid: false,
      message: "Invalid license key",
    });
  }

  // License not active
  if (license.status !== "ACTIVE") {
    await logVerification(license.id, gameIdStr, ipAddress, userAgent, false, `License ${license.status.toLowerCase()}`);
    return res.status(200).json({
      valid: false,
      message: `License is ${license.status.toLowerCase()}`,
    });
  }

  // License expired
  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    // Auto-expire the license
    await prisma.license.update({
      where: { id: license.id },
      data: { status: "EXPIRED" },
    });
    await logVerification(license.id, gameIdStr, ipAddress, userAgent, false, "License expired");
    return res.status(200).json({
      valid: false,
      message: "License has expired",
    });
  }

  // Product no longer active
  if (!license.product.active) {
    await logVerification(license.id, gameIdStr, ipAddress, userAgent, false, "Product deactivated");
    return res.status(200).json({
      valid: false,
      message: "Product is no longer available",
    });
  }

  // Check game whitelist
  const isWhitelisted = license.gameWhitelist.length > 0;
  if (!isWhitelisted) {
    await logVerification(license.id, gameIdStr, ipAddress, userAgent, false, "Game not whitelisted");
    return res.status(200).json({
      valid: false,
      message: "Game is not whitelisted for this license. Add it in your dashboard.",
      licenseType: license.licenseType,
    });
  }

  // All checks passed - license is valid
  await prisma.license.update({
    where: { id: license.id },
    data: { lastVerifiedAt: new Date() },
  });

  // Update game name if provided and different
  if (gameName && license.gameWhitelist[0] && license.gameWhitelist[0].gameName !== gameName) {
    await prisma.gameWhitelist.update({
      where: { id: license.gameWhitelist[0].id },
      data: { gameName },
    });
  }

  await logVerification(license.id, gameIdStr, ipAddress, userAgent, true, "OK");

  return res.status(200).json({
    valid: true,
    message: "License verified successfully",
    product: {
      name: license.product.name,
      version: license.product.version,
    },
    license: {
      type: license.licenseType,
      expiresAt: license.expiresAt,
    },
  });
};

/**
 * Log a verification attempt
 */
async function logVerification(licenseId, gameId, ipAddress, userAgent, success, reason) {
  if (!licenseId) return;

  try {
    await prisma.licenseVerification.create({
      data: {
        licenseId,
        gameId,
        ipAddress,
        userAgent,
        success,
        reason,
      },
    });
  } catch (err) {
    // Don't fail the verification if logging fails
    console.error("Failed to log verification:", err.message);
  }
}
