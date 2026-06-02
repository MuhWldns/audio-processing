/**
 * Mock Prisma client for testing
 * Provides chainable mock methods that mimic Prisma behavior
 */

import { vi } from "vitest";

function createMockModel() {
  return {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "mock-id" }),
    update: vi.fn().mockResolvedValue({ id: "mock-id" }),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({ id: "mock-id" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: "mock-id" }),
  };
}

export const mockPrisma = {
  user: createMockModel(),
  oAuthAccount: createMockModel(),
  session: createMockModel(),
  wallet: createMockModel(),
  tokenTransaction: createMockModel(),
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
    if (typeof fn === "function") {
      return await fn(mockPrisma);
    }
    return fn;
  }),
  $disconnect: vi.fn(),
};

// Mock the prisma module
vi.mock("../src/prisma.js", () => ({
  prisma: mockPrisma,
}));

export function resetAllMocks() {
  Object.values(mockPrisma).forEach((model) => {
    if (typeof model === "object" && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === "function" && method.mockReset) {
          method.mockReset();
        }
      });
    }
  });
  // Re-setup $transaction default
  mockPrisma.$transaction.mockImplementation(async (fn) => {
    if (typeof fn === "function") {
      return await fn(mockPrisma);
    }
    return fn;
  });
}
