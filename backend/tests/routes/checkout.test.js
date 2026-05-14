/**
 * Tests for Checkout route
 * POST /checkout
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, mockUser } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleCheckout } from "../../src/controllers/checkoutController.js";

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.post("/checkout", requireAuth, handleCheckout);
  }, { user });
}

describe("Checkout Route", () => {
  beforeEach(() => {
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
      prisma.user.findUnique.mockResolvedValue({ walletBalance: 100000 });

      // Inside $transaction
      prisma.user.update.mockResolvedValue({ walletBalance: 75000 });
      prisma.purchase.create.mockResolvedValue({ id: "pur-1", userId: mockUser.id, productId: "p1", licenseType: "PERSONAL", amountRupiah: 25000, status: "COMPLETED" });
      prisma.license.findUnique.mockResolvedValue(null);
      prisma.license.create.mockResolvedValue({ id: "lic-1", userId: mockUser.id, productId: "p1", licenseKey: "RBXR-AAAA-BBBB-CCCC-DDDD", licenseType: "PERSONAL", status: "ACTIVE", maxGames: 3 });
      prisma.walletTransaction.create.mockResolvedValue({ id: "wt-1" });
      prisma.activityLog.create.mockResolvedValue({ id: "act-1" });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });

      const app = buildApp();
      const res = await request(app).post("/checkout");

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.licenses).toHaveLength(1);
      expect(res.body.licenses[0].licenseKey).toMatch(/^RBXR-/);
      expect(res.body.totalCharged).toBe(25000);
      expect(res.body.newBalance).toBe(75000);
    });
  });
});
