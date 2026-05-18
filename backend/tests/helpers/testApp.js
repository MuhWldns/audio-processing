/**
 * Test helper: creates a minimal Express app with session + auth mocking
 * for route-level integration tests using supertest
 */

import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";

/**
 * Create a test app with a specific route handler
 * @param {Function} setupRoutes - Function that receives app and sets up routes
 * @param {Object} options - Options
 * @param {Object} options.user - Mock authenticated user (null = unauthenticated)
 */
export function createTestApp(setupRoutes, options = {}) {
  const app = express();

  app.use(cookieParser());
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    })
  );

  // Mock passport auth
  app.use((req, res, next) => {
    if (options.user) {
      req.user = options.user;
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    next();
  });

  // Simple requireAuth middleware for tests
  const requireAuth = (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    next();
  };

  setupRoutes(app, { requireAuth });

  // Error handler
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });

  return app;
}

/**
 * Mock user for testing
 */
export const mockUser = {
  id: "user-test-123",
  email: "test@example.com",
  displayName: "Test User",
  fullName: "Test User",
  avatarUrl: null,
  username: null,
  lastLoginAt: new Date().toISOString(),
  lastLoginProvider: "GOOGLE",
  role: "USER",
  robloxUserId: "123456789",
  walletBalance: 100000,
  totalTopUp: 200000,
  totalSpent: 100000,
  freeAudioDateKey: "2026-05-14",
  freeAudioUsedToday: 0,
  freeAudioDailyLimit: 3,
  paidAudioCost: 2000,
};

export const mockProduct = {
  id: "product-test-123",
  categoryId: "cat-test-123",
  name: "Test Script",
  slug: "test-script",
  description: "A test script for unit testing",
  shortDesc: "Test script",
  thumbnail: "https://example.com/thumb.png",
  pricePersonal: 25000,
  priceCommercial: 75000,
  priceEnterprise: 200000,
  featured: true,
  active: true,
  version: "1.0.0",
  tags: "test,script",
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockLicense = {
  id: "license-test-123",
  userId: "user-test-123",
  productId: "product-test-123",
  purchaseId: "purchase-test-123",
  licenseKey: "RBXR-TEST-1234-ABCD-EF56",
  licenseType: "PERSONAL",
  status: "ACTIVE",
  maxGames: 3,
  expiresAt: null,
  lastVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockCategory = {
  id: "cat-test-123",
  name: "UI Systems",
  slug: "ui-systems",
  description: "Interface frameworks",
  icon: "layout",
  sortOrder: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
