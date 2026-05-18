/**
 * Controller untuk license management
 * - List user's licenses
 * - Get license detail
 * - Whitelist/remove game IDs
 * - Download script files (via B2 presigned URL)
 */

import { prisma } from "../prisma.js";
import { getPresignedDownloadUrl } from "../services/storageService.js";
import { verifyPlaceOwnership } from "../services/robloxOwnershipService.js";

/**
 * GET /licenses - Get user's licenses
 */
export const handleGetLicenses = async (req, res) => {
  const userId = req.user.id;

  const licenses = await prisma.license.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: { id: true, name: true, slug: true, thumbnail: true, version: true },
      },
      gameWhitelist: {
        where: { active: true },
        select: { id: true, gameId: true, gameName: true, addedAt: true },
      },
      _count: { select: { verifications: true } },
    },
  });

  return res.status(200).json({
    licenses: licenses.map((l) => ({
      id: l.id,
      licenseKey: l.licenseKey,
      licenseType: l.licenseType,
      status: l.status,
      maxGames: l.maxGames,
      expiresAt: l.expiresAt,
      lastVerifiedAt: l.lastVerifiedAt,
      product: l.product,
      games: l.gameWhitelist,
      verificationCount: l._count.verifications,
      createdAt: l.createdAt,
    })),
  });
};

/**
 * GET /licenses/:id - Get license detail
 */
export const handleGetLicenseDetail = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const license = await prisma.license.findFirst({
    where: { id, userId },
    include: {
      product: {
        select: { id: true, name: true, slug: true, thumbnail: true, version: true, description: true },
      },
      purchase: {
        select: { id: true, amountRupiah: true, purchasedAt: true },
      },
      gameWhitelist: {
        orderBy: { addedAt: "desc" },
        select: { id: true, gameId: true, gameName: true, active: true, addedAt: true },
      },
      verifications: {
        orderBy: { verifiedAt: "desc" },
        take: 20,
        select: { id: true, gameId: true, success: true, reason: true, verifiedAt: true },
      },
    },
  });

  if (!license) {
    return res.status(404).json({ error: "License not found" });
  }

  return res.status(200).json({
    id: license.id,
    licenseKey: license.licenseKey,
    licenseType: license.licenseType,
    status: license.status,
    maxGames: license.maxGames,
    expiresAt: license.expiresAt,
    lastVerifiedAt: license.lastVerifiedAt,
    product: license.product,
    purchase: license.purchase,
    games: license.gameWhitelist,
    recentVerifications: license.verifications,
    createdAt: license.createdAt,
    updatedAt: license.updatedAt,
  });
};

/**
 * POST /licenses/:id/whitelist - Add game to whitelist
 * Validates ownership via Roblox API before allowing whitelist
 */
export const handleAddGameToWhitelist = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { gameId, gameName } = req.body;

  if (!gameId) {
    return res.status(400).json({ error: "gameId is required" });
  }

  // Validate gameId format (Roblox placeId is numeric)
  const gameIdStr = String(gameId).trim();
  if (!gameIdStr || !/^\d+$/.test(gameIdStr)) {
    return res.status(400).json({ error: "gameId must be a numeric Roblox Place ID" });
  }

  // Check user has robloxUserId set
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { robloxUserId: true },
  });

  if (!user || !user.robloxUserId) {
    return res.status(400).json({ error: "Please set your Roblox User ID in profile first" });
  }

  const license = await prisma.license.findFirst({
    where: { id, userId, status: "ACTIVE" },
    include: {
      gameWhitelist: { where: { active: true } },
    },
  });

  if (!license) {
    return res.status(404).json({ error: "License not found or inactive" });
  }

  // Check max games limit
  if (license.maxGames !== null) {
    const activeGames = license.gameWhitelist.length;
    if (activeGames >= license.maxGames) {
      return res.status(403).json({
        error: "Maximum games reached for this license tier",
        maxGames: license.maxGames,
        currentGames: activeGames,
      });
    }
  }

  // Check if game already whitelisted
  const existing = await prisma.gameWhitelist.findUnique({
    where: { licenseId_gameId: { licenseId: id, gameId: gameIdStr } },
  });

  if (existing) {
    if (existing.active) {
      return res.status(409).json({ error: "Game already whitelisted" });
    }
    // Re-activate (re-verify ownership)
  }

  // Verify ownership via Roblox API
  const ownership = await verifyPlaceOwnership(gameIdStr, user.robloxUserId);

  if (!ownership.valid) {
    return res.status(403).json({
      error: "Ownership verification failed",
      reason: ownership.reason,
      detail: ownership.detail,
    });
  }

  // Create or re-activate whitelist entry with creator metadata
  if (existing) {
    const updated = await prisma.gameWhitelist.update({
      where: { id: existing.id },
      data: {
        active: true,
        gameName: ownership.gameName || gameName || existing.gameName,
        universeId: ownership.universeId,
        creatorId: ownership.creatorId,
        creatorType: ownership.creatorType,
        verifiedAt: new Date(),
      },
    });
    return res.status(200).json({ ok: true, game: updated, reactivated: true });
  }

  const game = await prisma.gameWhitelist.create({
    data: {
      licenseId: id,
      gameId: gameIdStr,
      gameName: ownership.gameName || gameName || null,
      universeId: ownership.universeId,
      creatorId: ownership.creatorId,
      creatorType: ownership.creatorType,
      verifiedAt: new Date(),
    },
  });

  return res.status(201).json({ ok: true, game });
};

/**
 * DELETE /licenses/:id/whitelist/:gameWhitelistId - Remove game from whitelist
 */
export const handleRemoveGameFromWhitelist = async (req, res) => {
  const userId = req.user.id;
  const { id, gameWhitelistId } = req.params;

  const license = await prisma.license.findFirst({
    where: { id, userId },
  });

  if (!license) {
    return res.status(404).json({ error: "License not found" });
  }

  const game = await prisma.gameWhitelist.findFirst({
    where: { id: gameWhitelistId, licenseId: id },
  });

  if (!game) {
    return res.status(404).json({ error: "Game not found in whitelist" });
  }

  await prisma.gameWhitelist.update({
    where: { id: gameWhitelistId },
    data: { active: false },
  });

  return res.status(200).json({ ok: true });
};

/**
 * GET /licenses/:id/download - Download script files via presigned URL
 */
export const handleDownloadLicenseFiles = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  const license = await prisma.license.findFirst({
    where: { id, userId, status: "ACTIVE" },
    include: {
      product: {
        include: {
          files: {
            where: { fileType: "script" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!license) {
    return res.status(404).json({ error: "License not found or inactive" });
  }

  const scriptFile = license.product.files[0];
  if (!scriptFile) {
    return res.status(404).json({ error: "No script file available for this product" });
  }

  try {
    const url = await getPresignedDownloadUrl(scriptFile.filePath);
    return res.redirect(302, url);
  } catch (err) {
    console.error("[license] Presigned URL generation failed:", err.message);
    return res.status(500).json({ error: "Failed to generate download link" });
  }
};
