/**
 * Roblox Ownership Service
 * Resolves place ownership via public Roblox APIs
 * Used to validate that buyer owns the game they're whitelisting
 */

// Simple in-memory cache (TTL-based)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * Resolve placeId → universeId
 * GET https://apis.roblox.com/universes/v1/places/{placeId}/universe
 */
export async function resolveUniverseId(placeId) {
  const cacheKey = `universe:${placeId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  if (!res.ok) {
    throw new Error(`Failed to resolve universe for place ${placeId}: ${res.status}`);
  }

  const data = await res.json();
  const universeId = String(data.universeId);
  setCache(cacheKey, universeId);
  return universeId;
}

/**
 * Resolve universeId → creator info
 * GET https://games.roblox.com/v1/games?universeIds={universeId}
 * Returns: { creatorId, creatorType, creatorName }
 */
export async function resolveCreator(universeId) {
  const cacheKey = `creator:${universeId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
  if (!res.ok) {
    throw new Error(`Failed to resolve creator for universe ${universeId}: ${res.status}`);
  }

  const data = await res.json();
  const game = data.data?.[0];
  if (!game) {
    throw new Error(`Universe ${universeId} not found`);
  }

  const result = {
    creatorId: String(game.creator.id),
    creatorType: game.creator.type, // "User" or "Group"
    creatorName: game.creator.name,
    gameName: game.name,
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Resolve groupId → owner userId
 * GET https://groups.roblox.com/v1/groups/{groupId}
 * Returns: owner userId as string
 */
export async function resolveGroupOwner(groupId) {
  const cacheKey = `groupOwner:${groupId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(`https://groups.roblox.com/v1/groups/${groupId}`);
  if (!res.ok) {
    throw new Error(`Failed to resolve group ${groupId}: ${res.status}`);
  }

  const data = await res.json();
  if (!data.owner) {
    throw new Error(`Group ${groupId} has no owner`);
  }

  const ownerUserId = String(data.owner.userId);
  setCache(cacheKey, ownerUserId);
  return ownerUserId;
}

/**
 * Validate Roblox user exists
 * GET https://users.roblox.com/v1/users/{userId}
 * Returns: { id, name, displayName }
 */
export async function validateRobloxUser(userId) {
  const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to validate Roblox user ${userId}: ${res.status}`);
  }

  const data = await res.json();
  return {
    id: String(data.id),
    name: data.name,
    displayName: data.displayName,
  };
}

/**
 * Full ownership verification for a placeId
 * Resolves: placeId → universeId → creator → if group, check owner
 * Returns: { valid, universeId, creatorId, creatorType, gameName, reason? }
 */
export async function verifyPlaceOwnership(placeId, buyerRobloxUserId) {
  try {
    // 1. Resolve universe
    const universeId = await resolveUniverseId(placeId);

    // 2. Resolve creator
    const creator = await resolveCreator(universeId);

    // 3. Check ownership
    if (creator.creatorType === "User") {
      // Direct user ownership
      if (creator.creatorId !== buyerRobloxUserId) {
        return {
          valid: false,
          reason: "owner_mismatch",
          detail: `Game owned by user ${creator.creatorId}, but your Roblox ID is ${buyerRobloxUserId}`,
        };
      }
    } else if (creator.creatorType === "Group") {
      // Group ownership — check if buyer is group owner
      const groupOwnerId = await resolveGroupOwner(creator.creatorId);
      if (groupOwnerId !== buyerRobloxUserId) {
        return {
          valid: false,
          reason: "not_group_owner",
          detail: `Group ${creator.creatorId} is owned by user ${groupOwnerId}, not ${buyerRobloxUserId}`,
        };
      }
    } else {
      return { valid: false, reason: "unknown_creator_type" };
    }

    return {
      valid: true,
      universeId,
      creatorId: creator.creatorId,
      creatorType: creator.creatorType,
      gameName: creator.gameName,
    };
  } catch (err) {
    return {
      valid: false,
      reason: "api_error",
      detail: err.message,
    };
  }
}
