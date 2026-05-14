/**
 * Dev-only login endpoint for testing
 * Only available in development environment
 * Creates a session without OAuth flow
 */

import { prisma } from "../prisma.js";

export const handleDevLogin = async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  const { email, displayName } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email is required" });
  }

  // Find or create user (no separate Wallet model needed)
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        displayName: displayName || email.split("@")[0],
        fullName: displayName || email.split("@")[0],
        lastLoginAt: new Date(),
        lastLoginProvider: "GOOGLE",
      },
    });
  }

  // Login via passport (set session)
  req.login(user, (err) => {
    if (err) {
      return res.status(500).json({ error: "Failed to create session" });
    }

    return res.status(200).json({
      ok: true,
      message: "Dev login successful",
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
  });
};
