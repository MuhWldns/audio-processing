/**
 * Tests for Product routes
 * GET /products, GET /products/categories, GET /products/:idOrSlug
 */

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, mockProduct, mockCategory } from "../helpers/testApp.js";
import { prisma } from "../../src/prisma.js";
import { handleGetProducts, handleGetProductDetail, handleGetCategories } from "../../src/controllers/productController.js";
import { handleAdminCreateProduct, handleAdminListProducts } from "../../src/controllers/adminController.js";

function buildApp() {
  return createTestApp((app) => {
    app.get("/products", handleGetProducts);
    app.get("/products/categories", handleGetCategories);
    app.get("/products/:idOrSlug", handleGetProductDetail);
  });
}

function buildAdminApp() {
  return createTestApp((app) => {
    app.post("/admin/products", handleAdminCreateProduct);
    app.get("/admin/products", handleAdminListProducts);
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
    prisma.$transaction.mockImplementation(async (fn) => (typeof fn === "function" ? await fn(prisma) : fn));
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
      expect(res.body.products[0].publicId).toBe("PRD-SCR-2606-000001");
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
      expect(res.body.publicId).toBe("PRD-SCR-2606-000001");
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

  describe("admin products", () => {
    it("should create product with publicId from category domain", async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.productCategory.findUnique.mockResolvedValue({ ...mockCategory, slug: "audio-tools", name: "Audio Tools" });
      prisma.publicIdCounter.upsert.mockResolvedValue({ nextNumber: 2 });
      prisma.product.create.mockImplementation(async ({ data }) => ({ id: "product-new-123", ...data }));

      const app = buildAdminApp();
      const res = await request(app).post("/admin/products").send({
        name: "Audio Pack",
        slug: "audio-pack",
        description: "Audio product",
        categoryId: "cat-test-123",
      });

      expect(res.status).toBe(201);
      expect(res.body.product.publicId).toMatch(/^PRD-AUD-\d{4}-000001$/);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ publicId: expect.stringMatching(/^PRD-AUD-\d{4}-000001$/) }),
      });
    });

    it("should create product with SCR publicId when no category", async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.publicIdCounter.upsert.mockResolvedValue({ nextNumber: 2 });
      prisma.product.create.mockImplementation(async ({ data }) => ({ id: "product-new-123", ...data }));

      const app = buildAdminApp();
      const res = await request(app).post("/admin/products").send({
        name: "General Pack",
        slug: "general-pack",
        description: "General product",
      });

      expect(res.status).toBe(201);
      expect(res.body.product.publicId).toMatch(/^PRD-SCR-\d{4}-000001$/);
    });

    it("should return product publicId in admin list", async () => {
      prisma.product.findMany.mockResolvedValue([{ ...mockProduct, publicId: "PRD-SCR-2606-000001" }]);
      prisma.product.count.mockResolvedValue(1);

      const app = buildAdminApp();
      const res = await request(app).get("/admin/products");

      expect(res.status).toBe(200);
      expect(res.body.products[0].publicId).toBe("PRD-SCR-2606-000001");
    });
  });
});
