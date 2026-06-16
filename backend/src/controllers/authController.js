/**
 * Controller untuk autentikasi
 */

import passport from "passport";
import { prisma } from "../prisma.js";
import { handleOAuthLogin, buildMePayload } from "../services/authService.js";
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllSessionsForUser,
  verifyAccessToken,
  verifyOAuthState,
  parseBearerToken,
  getAccessTtlSeconds,
} from "../services/authTokenService.js";

const getFrontendUrl = () =>
  process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";

const getMobileDeepLink = () =>
  process.env.MOBILE_DEEP_LINK_REDIRECT || "rbxroyale://auth";

/**
 * Redirect an OAuth FAILURE (user denied, token-exchange error, login error)
 * to the right place based on the signed state. Mobile clients must land back
 * in the app via deep link so flutter_web_auth_2 resolves with an error instead
 * of hanging on the web frontend; web clients keep the existing behavior.
 */
export function redirectOAuthFailure(req, res) {
  const stateRaw = req.query?.state;
  const parsedState = stateRaw ? verifyOAuthState(stateRaw) : null;
  if (parsedState?.platform === "mobile") {
    const url = new URL(getMobileDeepLink());
    url.searchParams.set("error", "oauth_failed");
    return res.redirect(url.toString());
  }
  return res.redirect(`${getFrontendUrl()}/?login=failed`);
}

/**
 * Shared helper: branch OAuth callback on signed state.
 * - mobile: mint access+refresh tokens, redirect to deep link
 * - web (or no state): preserve existing FRONTEND_URL/?login=success behavior
 * - forged state: redirect to FRONTEND_URL/?login=failed without issuing tokens
 */
async function finishOAuthCallback(req, res, providerLabel, providerEnum) {
  if (!req.user) {
    return res.redirect(`${getFrontendUrl()}/?login=failed`);
  }

  const stateRaw = req.query?.state;
  let parsedState = null;
  if (stateRaw) {
    parsedState = verifyOAuthState(stateRaw);
    if (parsedState === null) {
      return res.redirect(`${getFrontendUrl()}/?login=failed`);
    }
  }

  await handleOAuthLogin({ userId: req.user.id, provider: providerEnum, providerLabel });

  if (parsedState?.platform === "mobile") {
    const access = signAccessToken(req.user.id, req.user.role);
    const { token: refresh } = await issueRefreshToken({
      userId: req.user.id,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
    });
    const url = new URL(getMobileDeepLink());
    url.searchParams.set("access", access);
    url.searchParams.set("refresh", refresh);
    return res.redirect(url.toString());
  }

  return res.redirect(`${getFrontendUrl()}/?login=success`);
}

/**
 * Handler untuk Google OAuth callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleGoogleCallback = async (req, res) =>
  finishOAuthCallback(req, res, "Google", "GOOGLE");

/**
 * Handler untuk Discord OAuth callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleDiscordCallback = async (req, res) =>
  finishOAuthCallback(req, res, "Discord", "DISCORD");

/**
 * Handler untuk logout
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export const handleLogout = async (req, res, next) => {
  const userId = req.user.id;

  // Bearer clients have no cookie session to destroy. Revoking all refresh
  // tokens is the real logout for them — otherwise req.logout/session.destroy
  // run as no-ops and the tokens stay alive while we report success.
  if (parseBearerToken(req)) {
    try {
      await revokeAllSessionsForUser(userId);
      await prisma.activityLog.create({
        data: {
          userId,
          type: "LOGOUT",
          status: "SUCCESS",
          title: "Signed out",
          description: "User signed out (mobile)",
        },
      });
      return res.json({ ok: true });
    } catch (err) {
      return next(err);
    }
  }

  req.logout((error) => {
    if (error) {
      return next(error);
    }

    req.session.destroy(async () => {
      await prisma.activityLog.create({
        data: {
          userId,
          type: "LOGOUT",
          status: "SUCCESS",
          title: "Signed out",
          description: "User signed out",
        },
      });

      res.clearCookie("connect.sid", {
        domain: process.env.COOKIE_DOMAIN || undefined,
        path: "/",
      });
      return res.json({ ok: true });
    });
  });
};

/**
 * Handler untuk mendapatkan data user yang sedang login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleGetMe = async (req, res) => {
  if (!req.user) {
    return res.status(200).json({ user: null });
  }

  const me = await buildMePayload(req.user.id);
  return res.json({ user: me });
};

/**
 * Handler untuk POST /auth/refresh
 * Rotates the refresh token and returns a new {access, refresh} pair.
 * On unknown refresh + valid Bearer access, triggers reuse detection by
 * revoking all sessions for the identified user.
 */
export const handleRefresh = async (req, res) => {
  const incoming = typeof req.body?.refresh === "string" ? req.body.refresh : null;
  if (!incoming) {
    return res.status(400).json({ error: "refresh required" });
  }

  const rotated = await rotateRefreshToken(incoming, {
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  });

  if (!rotated) {
    // Reuse detection: if the caller also sent a Bearer access token, try to
    // identify the user via verify (rejects expired/invalid). On success,
    // revoke all of that user's sessions. On failure, we can't safely
    // identify the user — skip revoke rather than risk wrong-user logout.
    const bearer = parseBearerToken(req);
    if (bearer) {
      try {
        const decoded = verifyAccessToken(bearer);
        if (decoded?.sub) await revokeAllSessionsForUser(decoded.sub);
      } catch {
        // ignore — can't identify the user, so we can't revoke
      }
    }
    return res.status(401).json({ error: "refresh_invalid" });
  }

  const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
  if (!user) return res.status(401).json({ error: "refresh_invalid" });

  const access = signAccessToken(user.id, user.role);
  return res.status(200).json({
    access,
    refresh: rotated.token,
    expiresIn: getAccessTtlSeconds(),
  });
};

/**
 * Handler untuk POST /auth/logout-mobile
 * Idempotent revocation of a refresh token. Bearer auth required (so we know
 * who is logging out and prevent anonymous enumeration). Always returns 200
 * to avoid leaking whether a given refresh token exists.
 */
export const handleMobileLogout = async (req, res) => {
  const incoming = typeof req.body?.refresh === "string" ? req.body.refresh : null;
  if (!incoming) {
    return res.status(400).json({ error: "refresh required" });
  }
  await revokeRefreshToken(incoming);
  return res.status(200).json({ ok: true });
};
