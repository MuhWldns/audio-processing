/**
 * Test setup - mock Prisma and environment
 */

import { vi } from "vitest";

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.PORT = "3099";
process.env.SESSION_SECRET = "test-secret";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.UPLOAD_API_KEY = "test-api-key";
process.env.BAYARGG_API_KEY = "test-bayar-key";
process.env.BAYARGG_WEBHOOK_SECRET = "test-webhook-secret";
process.env.BAYARGG_WEBHOOK_URL = "http://localhost:3099/webhooks/bayar";
process.env.GOOGLE_CLIENT_ID = "test-google-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:3099/auth/google/callback";
process.env.DISCORD_CLIENT_ID = "test-discord-id";
process.env.DISCORD_CLIENT_SECRET = "test-discord-secret";
process.env.DISCORD_CALLBACK_URL = "http://localhost:3099/auth/discord/callback";

// Mock prisma globally
vi.mock("../src/prisma.js", () => {
  const createMockModel = () => ({
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "mock-id" }),
    update: vi.fn().mockResolvedValue({ id: "mock-id" }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue({ id: "mock-id" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: "mock-id" }),
  });

  return {
    prisma: {
      user: createMockModel(),
      oAuthAccount: createMockModel(),
      session: createMockModel(),
      wallet: createMockModel(),
      tokenTransaction: createMockModel(),
      walletTransaction: createMockModel(),
      usageEvent: createMockModel(),
      activityLog: createMockModel(),
      uploadRecord: createMockModel(),
      publicIdCounter: createMockModel(),
      topUpOrder: createMockModel(),
      topUpTransaction: createMockModel(),
      serviceTransaction: createMockModel(),
      product: createMockModel(),
      productCategory: createMockModel(),
      productFile: createMockModel(),
      productImage: createMockModel(),
      license: createMockModel(),
      gameWhitelist: createMockModel(),
      licenseVerification: createMockModel(),
      purchase: createMockModel(),
      cart: createMockModel(),
      cartItem: createMockModel(),
      $transaction: vi.fn(async (fn) => {
        const { prisma } = await import("../src/prisma.js");
        if (typeof fn === "function") {
          return await fn(prisma);
        }
        return fn;
      }),
      $disconnect: vi.fn(),
    },
  };
});
