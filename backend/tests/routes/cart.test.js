/**
 * Tests for Cart routes
 * GET /cart, POST /cart/add, DELETE /cart/:itemId, DELETE /cart
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, mockUser, mockProduct } from "../helpers/testApp.js";

// Import prisma mock (set up in setup.js)
import { prisma } from "../../src/prisma.js";
import { handleGetCart, handleAddToCart, handleRemoveFromCart, handleClearCart } from "../../src/controllers/cartController.js";

function buildApp(user = mockUser) {
  return createTestApp((app, { requireAuth }) => {
    app.get("/cart", requireAuth, handleGetCart);
    app.post("/cart/add", requireAuth, handleAddToCart);
    app.delete("/cart/:itemId", requireAuth, handleRemoveFromCart);
    app.delete("/cart", requireAuth, handleClearCart);
  }, { user });
}

describe("Cart Routes", () => {
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

  describe("GET /cart", () => {
    it("should return 401 if not authenticated", async () => {
      const app = buildApp(null);
      const res = await request(app).get("/cart");
      expect(res.status).toBe(401);
    });

    it("should return empty cart if no cart exists", async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).get("/cart");

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it("should return cart items with total", async () => {
      prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        userId: mockUser.id,
        items: [
          {
            id: "item-1",
            productId: "product-test-123",
            product: { ...mockProduct, active: true },
            licenseType: "PERSONAL",
            priceRupiah: 25000,
            addedAt: new Date(),
          },
        ],
      });

      const app = buildApp();
      const res = await request(app).get("/cart");

      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.total).toBe(25000);
    });
  });

  describe("POST /cart/add", () => {
    it("should return 400 if productId missing", async () => {
      const app = buildApp();
      const res = await request(app).post("/cart/add").send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("productId is required");
    });

    it("should return 400 for invalid licenseType", async () => {
      const app = buildApp();
      const res = await request(app).post("/cart/add").send({
        productId: "product-test-123",
        licenseType: "INVALID",
      });
      expect(res.status).toBe(400);
    });

    it("should return 404 if product not found", async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).post("/cart/add").send({
        productId: "non-existent",
        licenseType: "PERSONAL",
      });
      expect(res.status).toBe(404);
    });

    it("should return 409 if user already owns license", async () => {
      prisma.product.findFirst.mockResolvedValue(mockProduct);
      prisma.license.findFirst.mockResolvedValue({ id: "existing-license" });

      const app = buildApp();
      const res = await request(app).post("/cart/add").send({
        productId: "product-test-123",
        licenseType: "PERSONAL",
      });
      expect(res.status).toBe(409);
    });

    it("should add item to cart successfully", async () => {
      prisma.product.findFirst.mockResolvedValue(mockProduct);
      prisma.license.findFirst.mockResolvedValue(null);
      prisma.cart.findUnique.mockResolvedValue({ id: "cart-1", userId: mockUser.id });
      prisma.cartItem.findUnique.mockResolvedValue(null);
      prisma.cartItem.create.mockResolvedValue({
        id: "item-1",
        cartId: "cart-1",
        productId: "product-test-123",
        licenseType: "PERSONAL",
        priceRupiah: 25000,
      });

      const app = buildApp();
      const res = await request(app).post("/cart/add").send({
        productId: "product-test-123",
        licenseType: "PERSONAL",
      });

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.updated).toBe(false);
    });
  });

  describe("DELETE /cart/:itemId", () => {
    it("should return 404 if cart not found", async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).delete("/cart/item-1");
      expect(res.status).toBe(404);
    });

    it("should remove item from cart", async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: "cart-1", userId: mockUser.id });
      prisma.cartItem.findFirst.mockResolvedValue({ id: "item-1", cartId: "cart-1" });
      prisma.cartItem.delete.mockResolvedValue({ id: "item-1" });

      const app = buildApp();
      const res = await request(app).delete("/cart/item-1");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("DELETE /cart", () => {
    it("should clear cart", async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: "cart-1", userId: mockUser.id });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 2 });

      const app = buildApp();
      const res = await request(app).delete("/cart");

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
