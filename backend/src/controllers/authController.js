/**
 * Controller untuk autentikasi
 */

import passport from "passport";
import { prisma } from "../prisma.js";
import { handleOAuthLogin, buildMePayload } from "../services/authService.js";

/**
 * Handler untuk Google OAuth callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleGoogleCallback = async (req, res) => {
  if (req.user) {
    await handleOAuthLogin({ userId: req.user.id, provider: "GOOGLE", providerLabel: "Google" });
  }

  const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
  return res.redirect(`${frontendUrl}/?login=success`);
};

/**
 * Handler untuk Discord OAuth callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const handleDiscordCallback = async (req, res) => {
  if (req.user) {
    await handleOAuthLogin({ userId: req.user.id, provider: "DISCORD", providerLabel: "Discord" });
  }

  const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
  return res.redirect(`${frontendUrl}/?login=success`);
};

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