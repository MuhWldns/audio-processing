import { beforeEach, describe, expect, test, vi } from "vitest";
import { prisma } from "../../src/prisma.js";
import { buildMePayload, upsertOAuthUser } from "../../src/services/authService.js";

function resetPrismaMocks() {
  prisma.publicIdCounter ??= { upsert: vi.fn() };

  Object.values(prisma).forEach((model) => {
    if (typeof model === "function" && model.mockReset) {
      model.mockReset();
      return;
    }

    if (typeof model === "object" && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === "function" && method.mockReset) {
          method.mockReset();
        }
      });
    }
  });

  prisma.$transaction.mockImplementation(async (fn) => {
    if (typeof fn === "function") {
      return await fn(prisma);
    }
    return fn;
  });
}

function createTransactionClient() {
  return {
    user: {
      update: vi.fn(),
      create: vi.fn(),
    },
    oAuthAccount: {
      update: vi.fn(),
    },
    publicIdCounter: {
      upsert: vi.fn(),
    },
  };
}

describe("authService", () => {
  beforeEach(() => {
    resetPrismaMocks();
  });

  test("buildMePayload includes public id", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-test-123",
      publicId: "ACC-IDN-2606-000001",
      email: "test@example.com",
      username: null,
      fullName: "Test User",
      displayName: "Test User",
      avatarUrl: null,
      lastLoginAt: new Date("2026-06-02T10:00:00.000Z"),
      lastLoginProvider: "GOOGLE",
      role: "USER",
      robloxUserId: null,
      walletBalance: 100000,
      totalTopUp: 200000,
      totalSpent: 100000,
      freeAudioDateKey: "2026-06-02",
      freeAudioUsedToday: 1,
      freeAudioDailyLimit: 3,
      paidAudioCost: 2000,
      accounts: [{ provider: "GOOGLE" }],
    });

    const payload = await buildMePayload("user-test-123");

    expect(payload.publicId).toBe("ACC-IDN-2606-000001");
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-test-123" },
      include: { accounts: true },
    });
  });

  test("updates existing OAuth user and account in one transaction", async () => {
    const tx = createTransactionClient();
    tx.user.update.mockResolvedValue({
      id: "user-test-123",
      email: "new@example.com",
    });
    prisma.$transaction.mockImplementation(async (fn) => await fn(tx));
    prisma.oAuthAccount.findUnique.mockResolvedValue({
      id: "oauth-test-123",
      userId: "user-test-123",
      user: {
        email: null,
        displayName: "Existing User",
        avatarUrl: null,
      },
    });

    const user = await upsertOAuthUser({
      provider: "GOOGLE",
      providerAccountId: "google-123",
      email: "new@example.com",
      displayName: "New User",
      avatarUrl: "https://example.com/avatar.png",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: null,
      scope: "email profile",
      tokenType: "Bearer",
      idToken: null,
    });

    expect(user).toEqual({ id: "user-test-123", email: "new@example.com" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-test-123" },
      data: expect.objectContaining({
        email: "new@example.com",
        displayName: "New User",
        avatarUrl: "https://example.com/avatar.png",
        lastLoginProvider: "GOOGLE",
      }),
    });
    expect(tx.oAuthAccount.update).toHaveBeenCalledWith({
      where: { id: "oauth-test-123" },
      data: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        expiresAt: null,
        scope: "email profile",
        tokenType: "Bearer",
        idToken: null,
      },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.update).not.toHaveBeenCalled();
  });

  test("creates new OAuth user with account public id inside transaction", async () => {
    const tx = createTransactionClient();
    tx.publicIdCounter.upsert.mockResolvedValue({
      scope: "ACC-IDN-2606",
      nextNumber: 2,
    });
    tx.user.create.mockImplementation(async ({ data }) => ({
      id: "user-test-123",
      publicId: data.publicId,
    }));
    prisma.$transaction.mockImplementation(async (fn) => await fn(tx));
    prisma.oAuthAccount.findUnique.mockResolvedValue(null);

    const user = await upsertOAuthUser({
      provider: "GOOGLE",
      providerAccountId: "google-123",
      email: "new@example.com",
      displayName: "New User",
      avatarUrl: "https://example.com/avatar.png",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: null,
      scope: "email profile",
      tokenType: "Bearer",
      idToken: null,
    });

    expect(user.publicId).toMatch(/^ACC-IDN-\d{4}-000001$/);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.publicIdCounter.upsert).toHaveBeenCalledWith({
      where: { scope: expect.stringMatching(/^ACC-IDN-\d{4}$/) },
      create: { scope: expect.stringMatching(/^ACC-IDN-\d{4}$/), nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: expect.stringMatching(/^ACC-IDN-\d{4}-000001$/),
        email: "new@example.com",
        displayName: "New User",
        avatarUrl: "https://example.com/avatar.png",
        lastLoginProvider: "GOOGLE",
        accounts: {
          create: expect.objectContaining({
            provider: "GOOGLE",
            providerAccountId: "google-123",
            accessToken: "access-token",
          }),
        },
      }),
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.publicIdCounter.upsert).not.toHaveBeenCalled();
  });

  test("retries OAuth upsert as existing account after new account unique conflict", async () => {
    const createTx = createTransactionClient();
    createTx.publicIdCounter.upsert.mockResolvedValue({
      scope: "ACC-IDN-2606",
      nextNumber: 2,
    });
    createTx.user.create.mockRejectedValue({ code: "P2002" });

    const updateTx = createTransactionClient();
    updateTx.user.update.mockResolvedValue({
      id: "user-test-123",
      email: "new@example.com",
    });

    prisma.$transaction
      .mockImplementationOnce(async (fn) => await fn(createTx))
      .mockImplementationOnce(async (fn) => await fn(updateTx));
    prisma.oAuthAccount.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "oauth-test-123",
        userId: "user-test-123",
        user: {
          email: null,
          displayName: "Existing User",
          avatarUrl: null,
        },
      });

    const user = await upsertOAuthUser({
      provider: "GOOGLE",
      providerAccountId: "google-123",
      email: "new@example.com",
      displayName: "New User",
      avatarUrl: "https://example.com/avatar.png",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: null,
      scope: "email profile",
      tokenType: "Bearer",
      idToken: null,
    });

    expect(user).toEqual({ id: "user-test-123", email: "new@example.com" });
    expect(prisma.oAuthAccount.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.oAuthAccount.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        provider_providerAccountId: {
          provider: "GOOGLE",
          providerAccountId: "google-123",
        },
      },
      include: { user: true },
    });
    expect(prisma.oAuthAccount.findUnique).toHaveBeenNthCalledWith(2, {
      where: {
        provider_providerAccountId: {
          provider: "GOOGLE",
          providerAccountId: "google-123",
        },
      },
      include: { user: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(createTx.user.create).toHaveBeenCalledTimes(1);
    expect(updateTx.user.update).toHaveBeenCalledTimes(1);
    expect(updateTx.oAuthAccount.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.update).not.toHaveBeenCalled();
  });
});
