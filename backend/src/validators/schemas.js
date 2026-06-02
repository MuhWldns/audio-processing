/**
 * Zod validation schemas for API routes
 */

import { z } from "zod";

// ==================== TOP-UP ====================

export const createTopUpSchema = z.object({
  amount: z.number().int("Amount must be an integer").min(1000, "Minimum Rp 1,000").max(500000, "Maximum Rp 500,000"),
  customer_name: z.string().max(100).optional(),
  customer_email: z.string().email().optional(),
  customer_phone: z.string().max(20).optional(),
});

// ==================== CART ====================

export const addToCartSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  licenseType: z.enum(["PERSONAL", "COMMERCIAL", "ENTERPRISE"]).default("PERSONAL"),
});

// ==================== ADMIN PRODUCTS ====================

export const createProductSchema = z.object({
  name: z.string().min(1, "Name is required").max(191),
  slug: z.string().min(1, "Slug is required").max(191).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().min(1, "Description is required"),
  shortDesc: z.string().max(255).optional(),
  thumbnail: z.string().url().max(512).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  pricePersonal: z.number().int().min(0).default(0),
  priceCommercial: z.number().int().min(0).default(0),
  priceEnterprise: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  version: z.string().max(32).default("1.0.0"),
  tags: z.string().max(512).optional().nullable(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  active: z.boolean().optional(),
});

// ==================== ADMIN CATEGORIES ====================

export const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z.string().min(1, "Slug is required").max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional().nullable(),
  icon: z.string().max(64).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  active: z.boolean().optional(),
});

// ==================== ADMIN FILES ====================

export const addProductFileSchema = z.object({
  fileName: z.string().min(1, "fileName is required").max(255),
  fileType: z.enum(["script", "documentation", "asset"]),
  filePath: z.string().min(1, "filePath is required").max(512)
    .refine((val) => !val.includes(".."), "Path cannot contain '..'")
    .refine((val) => !val.startsWith("/") && !val.match(/^[A-Z]:\\/), "Path must be relative"),
  fileSize: z.number().int().min(0).optional().nullable(),
  version: z.string().max(32).optional(),
});

// ==================== ADMIN LICENSES ====================

export const updateLicenseStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
  reason: z.string().max(512).optional(),
});

// ==================== LICENSE WHITELIST ====================

export const addGameWhitelistSchema = z.object({
  gameId: z.string().min(1, "gameId is required").max(64),
  gameName: z.string().max(191).optional().nullable(),
});

// ==================== VERIFY LICENSE ====================

export const verifyLicenseSchema = z.object({
  licenseKey: z.string().min(1, "licenseKey is required"),
  gameId: z.string().min(1, "gameId is required").max(64),
  gameName: z.string().max(191).optional(),
});
