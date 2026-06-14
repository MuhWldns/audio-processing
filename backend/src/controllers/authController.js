/**
 * Controller untuk autentikasi
 */

import passport from "passport";
import { prisma } from "../prisma.js";
import { handleOAuthLogin, buildMePayload } from "../services/authService.js";
import {
  signAccessToken,
  issueRefreshToken,
  verifyOAuthState,
} from "../services/authTokenService.js";

const getFrontendUrl = () =>
  process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";

const getMobileDeepLink = () =>
  process.env.MOBILE_DEEP_LINK_REDIRECT || "rbxroyale://auth";

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
