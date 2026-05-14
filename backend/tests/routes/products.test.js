/**
 * Tests for Product routes
 * GET /products, GET /products/categories, GET /products/:idOrSlug
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, mockProduct, mockCategory } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleGetProducts, handleGetProductDetail, handleGetCategories } from "../../src/controllers/productController.js";

function buildApp() {
  return createTestApp((app) => {
    app.get("/products", handleGetProducts);
    app.get("/products/categories", handleGetCategories);
    app.get("/products/:idOrSlug", handleGetProductDetail);
  });
}

describe("Product Routes", () => {
  beforeEach(() => {
    Object.values(prisma).forEach((model) => {
      if (typeof model === "object" && model !== null) {
        Object.values(model).forEach((method) => {
          if (typeof method?.mockReset === "function") method.mockReset();
        });
      }
    });
  });

  describe("GET /products", () => {
    it("should return empty list when no products", async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      const app = buildApp();
      const res = await request(app).get("/products");

      expect(res.status).toBe(200);
      expect(res.body.products).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it("should return products with pagination", async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          ...mockProduct,
          category: mockCategory,
          images: [{ url: "https://example.com/img.png" }],
          _count: { licenses: 5 },
        },
      ]);
      prisma.product.count.mockResolvedValue(1);

      const app = buildApp();
      const res = await request(app).get("/products");

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(1);
      expect(res.body.products[0].name).toBe("Test Script");
      expect(res.body.products[0].soldCount).toBe(5);
      expect(res.body.pagination.total).toBe(1);
    });

    it("should support search query", async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      const app = buildApp();
      await request(app).get("/products?search=ui+system");

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: "ui system" } },
            ]),
          }),
        })
      );
    });
  });

  describe("GET /products/categories", () => {
    it("should return categories", async () => {
      prisma.productCategory.findMany.mockResolvedValue([
        { ...mockCategory, _count: { products: 5 } },
      ]);

      const app = buildApp();
      const res = await request(app).get("/products/categories");

      expect(res.status).toBe(200);
      expect(res.body.categories).toHaveLength(1);
      expect(res.body.categories[0].name).toBe("UI Systems");
      expect(res.body.categories[0].productCount).toBe(5);
    });
  });

  describe("GET /products/:idOrSlug", () => {
    it("should return product detail", async () => {
      prisma.product.findFirst.mockResolvedValue({
        ...mockProduct,
        category: mockCategory,
        images: [],
        files: [],
        _count: { licenses: 10 },
      });

      const app = buildApp();
      const res = await request(app).get("/products/test-script");

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Test Script");
      expect(res.body.soldCount).toBe(10);
    });

    it("should return 404 for non-existent product", async () => {
      prisma.product.findFirst.mockResolvedValue(null);

      const app = buildApp();
      const res = await request(app).get("/products/non-existent");

      expect(res.status).toBe(404);
    });
  });
});
