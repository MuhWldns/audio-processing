/**
 * Tests for Checkout route
 * POST /checkout
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleCheckout } from "../../src/controllers/checkoutController.js";

const createMockModel = () => ({
  upsert: vi.fn(),
});

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.post("/checkout", requireAuth, handleCheckout);
  }, { user });
}

describe("Checkout Route", () => {
  beforeEach(() => {
    prisma.publicIdCounter ??= createMockModel();
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });
    prisma.$transaction.mockImplementation(async (fn) => {
      if (typeof fn === "function") return await fn(prisma);
      return fn;
    });
  });

  describe("POST /checkout", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).post("/checkout");
      expect(res.status).toBe(401);
    });

    it("should return 400 if cart is empty", async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).post("/checkout");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cart is empty");
    });

    it("should return 400 if no valid items", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        items: [
          { id: "i1", productId: "p1", product: { id: "p1", name: "X", active: false }, licenseType: "PERSONAL", priceRupiah: 25000 },
        ],
      });

      const app = buildApp();
      const res = await request(app).post("/checkout");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No valid items in cart");
    });

    it("should return 402 if insufficient balance", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        items: [
          { id: "i1", productId: "p1", product: { id: "p1", name: "Script", active: true }, licenseType: "PERSONAL", priceRupiah: 500000 },
        ],
      });
      prisma.license.findMany.mockResolvedValue([]);
      prisma.user.findUnique.mockResolvedValue({ walletBalance: 100000 });

      const app = buildApp();
      const res = await request(app).post("/checkout");

      expect(res.status).toBe(402);
      expect(res.body.error).toBe("Insufficient balance");
      expect(res.body.shortfall).toBe(400000);
    });

    it("should return 409 if already owns all items", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        items: [
          { id: "i1", productId: "p1", product: { id: "p1", name: "Script", active: true }, licenseType: "PERSONAL", priceRupiah: 25000 },
        ],
      });
      prisma.license.findMany.mockResolvedValue([{ productId: "p1" }]);
      prisma.user.findUnique.mockResolvedValue({ walletBalance: 100000 });

      const app = buildApp();
      const res = await request(app).post("/checkout");

      expect(res.status).toBe(409);
    });

    it("should complete checkout successfully", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        items: [
          { id: "i1", productId: "p1", product: { id: "p1", name: "Test Script", active: true }, licenseType: "PERSONAL", priceRupiah: 25000 },
        ],
      });
      prisma.license.findMany.mockResolvedValue([]);
      // findUnique now serves the pre-check, the in-tx read-back, and the email
      // fetch. Returning the post-deduct balance makes the read-back authoritative.
      prisma.user.findUnique.mockResolvedValue({ walletBalance: 75000, email: "test@example.com", displayName: "Test User" });

      // Inside $transaction: atomic CAS claims the funds (count 1).
      prisma.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.publicIdCounter.upsert
        .mockResolvedValueOnce({ scope: "PUR-PER-2606", nextNumber: 2 })
        .mockResolvedValueOnce({ scope: "LIC-PER-2606", nextNumber: 2 })
        .mockResolvedValueOnce({ scope: "TXN-PUR-2606", nextNumber: 2 });
      prisma.purchase.create.mockResolvedValue({ id: "pur-1", publicId: "PUR-PER-2606-000001", userId: mockUser.id, productId: "p1", licenseType: "PERSONAL", amountRupiah: 25000, status: "COMPLETED" });
      prisma.license.findUnique.mockResolvedValue(null);
      prisma.license.create.mockResolvedValue({ id: "lic-1", publicId: "LIC-PER-2606-000001", userId: mockUser.id, productId: "p1", licenseKey: "RBXR-AAAA-BBBB-CCCC-DDDD", licenseType: "PERSONAL", status: "ACTIVE", maxGames: 3 });
      prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1", publicId: "TXN-PUR-2606-000001" });
      prisma.activityLog.create.mockResolvedValue({ id: "act-1" });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      const app = buildApp();
      const res = await request(app).post("/checkout");

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.purchases[0].publicId).toMatch(/^PUR-PER-\d{4}-000001$/);
      expect(res.body.licenses).toHaveLength(1);
      expect(res.body.licenses[0].publicId).toMatch(/^LIC-PER-\d{4}-000001$/);
      expect(res.body.licenses[0].licenseKey).toMatch(/^RBXR-/);
      expect(res.body.totalCharged).toBe(25000);
      expect(res.body.newBalance).toBe(75000);
      expect(prisma.purchase.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          publicId: expect.stringMatching(/^PUR-PER-\d{4}-000001$/),
        }),
      }));
      expect(prisma.license.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          publicId: expect.stringMatching(/^LIC-PER-\d{4}-000001$/),
        }),
      }));
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          publicId: expect.stringMatching(/^TXN-PUR-\d{4}-000001$/),
        }),
      }));
    });
  });

  /**
   * Concurrency / atomic balance CAS.
   *
   * To prove atomicity with mocked Prisma we model the real MySQL conditional
   * UPDATE ... WHERE walletBalance >= total as a shared mutable balance that
   * `user.updateMany` reads-and-decrements synchronously (atomic within JS's
   * single thread). Two real Promise.all supertest requests contend on that
   * same balance: the second sees the decremented value and is rejected.
   *
   * The non-atomic findUnique+update implementation never calls updateMany and
   * has no conditional guard, so both concurrent requests succeed -> these
   * tests fail (RED) until the CAS is in place.
   */
  describe("POST /checkout - concurrency (atomic balance CAS)", () => {
    // Wires cart/license/downstream-tx mocks + a shared mutable balance whose
    // only authoritative mutation is the conditional updateMany (the CAS).
    function setupContention({ startBalance, price }) {
      const state = { balance: startBalance };

      prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        items: [
          { id: "i1", productId: "p1", product: { id: "p1", name: "Script", active: true }, licenseType: "PERSONAL", priceRupiah: price },
        ],
      });
      prisma.license.findMany.mockResolvedValue([]);

      // Used by: pre-check, in-tx read-back, and the post-tx email fetch.
      // Always reflects the live shared balance.
      prisma.user.findUnique.mockImplementation(async () => ({
        walletBalance: state.balance,
        email: "test@example.com",
        displayName: "Test User",
      }));

      // Non-atomic legacy path uses update (no guard) — keep it harmless so
      // the legacy impl visibly overspends (both succeed) under contention.
      prisma.user.update.mockImplementation(async () => ({ walletBalance: state.balance }));

      // The CAS: atomic check-and-decrement, exactly like the conditional UPDATE.
      prisma.user.updateMany.mockImplementation(async ({ where, data }) => {
        const need = where?.walletBalance?.gte;
        if (typeof need === "number" && state.balance >= need) {
          state.balance -= data.walletBalance.decrement;
          return { count: 1 };
        }
        return { count: 0 };
      });

      // Downstream transaction writes — just need to resolve.
      prisma.publicIdCounter.upsert.mockResolvedValue({ nextNumber: 2 });
      prisma.purchase.create.mockResolvedValue({ id: "pur-1", publicId: "PUR-PER-2606-000001", userId: mockUser.id, productId: "p1", licenseType: "PERSONAL", amountRupiah: price, status: "COMPLETED" });
      prisma.license.findUnique.mockResolvedValue(null);
      prisma.license.create.mockResolvedValue({ id: "lic-1", publicId: "LIC-PER-2606-000001", userId: mockUser.id, productId: "p1", licenseKey: "RBXR-AAAA-BBBB-CCCC-DDDD", licenseType: "PERSONAL", status: "ACTIVE", maxGames: 3 });
      prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1", publicId: "TXN-PUR-2606-000001" });
      prisma.activityLog.create.mockResolvedValue({ id: "act-1" });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      return state;
    }

    it("1. two parallel checkouts, each > remaining-after-one -> exactly one 201, one 402, balance not negative", async () => {
      // balance 1000, each cart 600. Only one can win.
      const state = setupContention({ startBalance: 1000, price: 600 });
      const app = buildApp();

      const [a, b] = await Promise.all([
        request(app).post("/checkout"),
        request(app).post("/checkout"),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 402]);
      expect(state.balance).toBe(400);
      expect(state.balance).toBeGreaterThanOrEqual(0);

      const rejected = [a, b].find((r) => r.status === 402);
      expect(rejected.body.error).toBe("Insufficient balance");
      // The 402 may come from either the fast-fail pre-check (fresh read, reports
      // balance) or the in-tx CAS catch path (no balance) depending on async
      // interleaving — both are correct. Invariant that matters: never negative,
      // exactly one winner. Catch-path stale-balance omission is asserted
      // deterministically in the dedicated test below.
      expect(rejected.body.required).toBe(600);
    });

    it("catch-path 402 (pre-check passes, CAS loses the race) omits the stale balance number", async () => {
      // Pre-check reads a sufficient balance (fresh, optimistic) but by the time
      // the transaction runs another request has drained the funds, so the CAS
      // returns count 0. This is the exact path whose response must NOT echo the
      // now-stale pre-check balance.
      setupContention({ startBalance: 1000, price: 600 });
      prisma.user.findUnique.mockResolvedValue({ walletBalance: 1000, email: "test@example.com", displayName: "Test User" });
      prisma.user.updateMany.mockResolvedValue({ count: 0 }); // CAS always loses
      const app = buildApp();

      const res = await request(app).post("/checkout");

      expect(res.status).toBe(402);
      expect(res.body.error).toBe("Insufficient balance");
      expect(res.body.required).toBe(600);
      expect(res.body).not.toHaveProperty("balance");
    });

    it("2. two parallel checkouts each == half balance (both fit) -> both 201, balance 0", async () => {
      const state = setupContention({ startBalance: 1000, price: 500 });
      const app = buildApp();

      const [a, b] = await Promise.all([
        request(app).post("/checkout"),
        request(app).post("/checkout"),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(state.balance).toBe(0);
    });

    it("3. single checkout that exactly drains balance (1000/1000) -> 201, balance 0", async () => {
      const state = setupContention({ startBalance: 1000, price: 1000 });
      const app = buildApp();

      const res = await request(app).post("/checkout");

      expect(res.status).toBe(201);
      expect(state.balance).toBe(0);
      expect(res.body.newBalance).toBe(0);
    });

    it("4. balance 0 + any checkout -> 402 (CAS returns count 0; pre-check also catches it)", async () => {
      setupContention({ startBalance: 0, price: 600 });
      const app = buildApp();

      const res = await request(app).post("/checkout");

      expect(res.status).toBe(402);
      expect(res.body.error).toBe("Insufficient balance");
    });

    it("5. cart empty -> 400 before any balance logic (CAS never called)", async () => {
      setupContention({ startBalance: 1000, price: 600 });
      prisma.cart.findUnique.mockResolvedValue(null);
      const app = buildApp();

      const res = await request(app).post("/checkout");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Cart is empty");
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("6. three parallel checkouts where only one fits -> one 201, two 402", async () => {
      // balance 1000, each cart 600. Only one of three can win.
      const state = setupContention({ startBalance: 1000, price: 600 });
      const app = buildApp();

      const results = await Promise.all([
        request(app).post("/checkout"),
        request(app).post("/checkout"),
        request(app).post("/checkout"),
      ]);

      const ok = results.filter((r) => r.status === 201).length;
      const rejected = results.filter((r) => r.status === 402).length;
      expect(ok).toBe(1);
      expect(rejected).toBe(2);
      expect(state.balance).toBe(400);
      expect(state.balance).toBeGreaterThanOrEqual(0);
    });
  });
});
