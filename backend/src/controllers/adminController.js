/**
 * Admin controller - Product CRUD, Category CRUD, License management
 */

import path from "node:path";
import { prisma } from "../prisma.js";
import { uploadFile, generateFileKey, deleteFile } from "../services/storageService.js";

// ==================== PRODUCT CRUD ====================

/**
 * POST /admin/products - Create product
 */
export const handleAdminCreateProduct = async (req, res) => {
  const { name, slug, description, shortDesc, thumbnail, categoryId, pricePersonal, priceCommercial, priceEnterprise, featured, version, tags } = req.body;

  if (!name || !slug || !description) {
    return res.status(400).json({ error: "name, slug, and description are required" });
  }

  // Check slug uniqueness
  const existing = await prisma.product.findUnique({ where: { slug } });
  if (existing) {
    return res.status(409).json({ error: "Product with this slug already exists" });
  }

  const product = await prisma.product.create({
    data: {
      name,
      slug,
      description,
      shortDesc: shortDesc || null,
      thumbnail: thumbnail || null,
      categoryId: categoryId || null,
      pricePersonal: pricePersonal || 0,
      priceCommercial: priceCommercial || 0,
      priceEnterprise: priceEnterprise || 0,
      featured: featured || false,
      version: version || "1.0.0",
      tags: tags || null,
    },
  });

  return res.status(201).json({ ok: true, product });
};

/**
 * PUT /admin/products/:id - Update product
 */
export const handleAdminUpdateProduct = async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, shortDesc, thumbnail, categoryId, pricePersonal, priceCommercial, priceEnterprise, featured, active, version, tags } = req.body;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Check slug uniqueness if changed
  if (slug && slug !== product.slug) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ error: "Product with this slug already exists" });
    }
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (slug !== undefined) data.slug = slug;
  if (description !== undefined) data.description = description;
  if (shortDesc !== undefined) data.shortDesc = shortDesc;
  if (thumbnail !== undefined) data.thumbnail = thumbnail;
  if (categoryId !== undefined) data.categoryId = categoryId || null;
  if (pricePersonal !== undefined) data.pricePersonal = pricePersonal;
  if (priceCommercial !== undefined) data.priceCommercial = priceCommercial;
  if (priceEnterprise !== undefined) data.priceEnterprise = priceEnterprise;
  if (featured !== undefined) data.featured = featured;
  if (active !== undefined) data.active = active;
  if (version !== undefined) data.version = version;
  if (tags !== undefined) data.tags = tags;

  const updated = await prisma.product.update({ where: { id }, data });

  return res.status(200).json({ ok: true, product: updated });
};

/**
 * DELETE /admin/products/:id - Delete product (soft: deactivate)
 */
export const handleAdminDeleteProduct = async (req, res) => {
  const { id } = req.params;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  await prisma.product.update({ where: { id }, data: { active: false } });

  return res.status(200).json({ ok: true, message: "Product deactivated" });
};

/**
 * GET /admin/products - List all products (including inactive)
 */
export const handleAdminListProducts = async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        _count: { select: { licenses: true, purchases: true } },
      },
    }),
    prisma.product.count(),
  ]);

  return res.status(200).json({
    products,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
  });
};

// ==================== CATEGORY CRUD ====================

/**
 * POST /admin/categories - Create category
 */
export const handleAdminCreateCategory = async (req, res) => {
  const { name, slug, description, icon, sortOrder } = req.body;

  if (!name || !slug) {
    return res.status(400).json({ error: "name and slug are required" });
  }

  const existing = await prisma.productCategory.findUnique({ where: { slug } });
  if (existing) {
    return res.status(409).json({ error: "Category with this slug already exists" });
  }

  const category = await prisma.productCategory.create({
    data: {
      name,
      slug,
      description: description || null,
      icon: icon || null,
      sortOrder: sortOrder || 0,
    },
  });

  return res.status(201).json({ ok: true, category });
};

/**
 * PUT /admin/categories/:id - Update category
 */
export const handleAdminUpdateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, slug, description, icon, sortOrder, active } = req.body;

  const category = await prisma.productCategory.findUnique({ where: { id } });
  if (!category) {
    return res.status(404).json({ error: "Category not found" });
  }

  if (slug && slug !== category.slug) {
    const existing = await prisma.productCategory.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({ error: "Category with this slug already exists" });
    }
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (slug !== undefined) data.slug = slug;
  if (description !== undefined) data.description = description;
  if (icon !== undefined) data.icon = icon;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;
  if (active !== undefined) data.active = active;

  const updated = await prisma.productCategory.update({ where: { id }, data });

  return res.status(200).json({ ok: true, category: updated });
};

/**
 * DELETE /admin/categories/:id - Delete category
 */
export const handleAdminDeleteCategory = async (req, res) => {
  const { id } = req.params;

  const category = await prisma.productCategory.findUnique({ where: { id } });
  if (!category) {
    return res.status(404).json({ error: "Category not found" });
  }

  await prisma.productCategory.update({ where: { id }, data: { active: false } });

  return res.status(200).json({ ok: true, message: "Category deactivated" });
};

// ==================== LICENSE MANAGEMENT (ADMIN) ====================

/**
 * GET /admin/licenses - List all licenses with filters
 */
export const handleAdminListLicenses = async (req, res) => {
  const { status, userId, productId, page = 1, limit = 50 } = req.query;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const where = {};
  if (status) where.status = status;
  if (userId) where.userId = userId;
  if (productId) where.productId = productId;

  const [licenses, total] = await Promise.all([
    prisma.license.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, name: true, slug: true } },
        _count: { select: { gameWhitelist: true, verifications: true } },
      },
    }),
    prisma.license.count({ where }),
  ]);

  return res.status(200).json({
    licenses,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
  });
};

/**
 * PUT /admin/licenses/:id/status - Update license status (suspend, revoke, activate)
 */
export const handleAdminUpdateLicenseStatus = async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!status || !["ACTIVE", "SUSPENDED", "REVOKED"].includes(status)) {
    return res.status(400).json({ error: "Valid status required: ACTIVE, SUSPENDED, REVOKED" });
  }

  const license = await prisma.license.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true } }, product: { select: { name: true } } },
  });

  if (!license) {
    return res.status(404).json({ error: "License not found" });
  }

  const updated = await prisma.license.update({
    where: { id },
    data: {
      status,
      metadata: {
        ...(license.metadata || {}),
        statusHistory: [
          ...((license.metadata?.statusHistory) || []),
          { from: license.status, to: status, reason: reason || null, at: new Date().toISOString(), by: "admin" },
        ],
      },
    },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      userId: license.userId,
      type: "TOKEN_USAGE",
      status: "INFO",
      title: `License ${status.toLowerCase()}`,
      description: `License for "${license.product.name}" ${status.toLowerCase()}${reason ? `: ${reason}` : ""}`,
      metadata: { licenseId: id, newStatus: status, reason },
    },
  });

  return res.status(200).json({ ok: true, license: updated });
};

// ==================== ANALYTICS ====================

/**
 * GET /admin/analytics - Sales analytics overview
 */
export const handleAdminAnalytics = async (req, res) => {
  const [totalProducts, totalLicenses, totalPurchases, totalRevenue, recentPurchases] = await Promise.all([
    prisma.product.count({ where: { active: true } }),
    prisma.license.count({ where: { status: "ACTIVE" } }),
    prisma.purchase.count({ where: { status: "COMPLETED" } }),
    prisma.purchase.aggregate({ where: { status: "COMPLETED" }, _sum: { amountRupiah: true } }),
    prisma.purchase.findMany({
      where: { status: "COMPLETED" },
      orderBy: { purchasedAt: "desc" },
      take: 10,
      include: {
        user: { select: { id: true, email: true, displayName: true } },
        product: { select: { id: true, name: true } },
      },
    }),
  ]);

  return res.status(200).json({
    overview: {
      totalProducts,
      totalActiveLicenses: totalLicenses,
      totalPurchases,
      totalRevenue: totalRevenue._sum.amountRupiah || 0,
    },
    recentPurchases: recentPurchases.map((p) => ({
      id: p.id,
      user: p.user,
      product: p.product,
      amountRupiah: p.amountRupiah,
      licenseType: p.licenseType,
      purchasedAt: p.purchasedAt,
    })),
  });
};

// ==================== PRODUCT FILES ====================

/**
 * POST /admin/products/:id/files - Upload file to B2 and add record
 */
const ALLOWED_FILE_EXTENSIONS = ['.lua', '.rbxm', '.rbxmx', '.md', '.txt'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const handleAdminAddProductFile = async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: "File is required" });
  }

  const fileType = req.body?.fileType;
  if (!fileType || !["script", "documentation", "asset"].includes(fileType)) {
    return res.status(400).json({ error: "fileType must be: script, documentation, or asset" });
  }

  // Validate file extension
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
    return res.status(400).json({ error: `File type not allowed. Accepted: ${ALLOWED_FILE_EXTENSIONS.join(', ')}` });
  }

  // Validate file size
  if (req.file.size > MAX_FILE_SIZE) {
    return res.status(400).json({ error: "File too large. Maximum 10MB." });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const version = req.body?.version || product.version;
  const fileName = req.file.originalname;
  const key = generateFileKey(product.slug, version, fileName);

  // Upload to B2
  try {
    await uploadFile(key, req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error("[admin] B2 upload failed:", err.message);
    return res.status(502).json({ error: "Failed to upload file to storage" });
  }

  // Save record in DB
  const file = await prisma.productFile.create({
    data: {
      productId: id,
      fileName,
      fileType,
      filePath: key,
      fileSize: req.file.size,
      version,
    },
  });

  return res.status(201).json({ ok: true, file });
};

/**
 * DELETE /admin/products/:productId/files/:fileId - Remove file from B2 and DB
 */
export const handleAdminDeleteProductFile = async (req, res) => {
  const { productId, fileId } = req.params;

  const file = await prisma.productFile.findFirst({
    where: { id: fileId, productId },
  });

  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }

  // Delete from B2 (best-effort)
  try {
    await deleteFile(file.filePath);
  } catch (err) {
    console.warn("[admin] B2 delete failed (continuing):", err.message);
  }

  await prisma.productFile.delete({ where: { id: fileId } });

  return res.status(200).json({ ok: true, message: "File removed" });
};

// ==================== LICENSE ENFORCEMENT ADMIN ====================

/**
 * GET /admin/licenses/active - Get currently active licenses (verified within last 5 min)
 */
export const handleAdminActiveLicenses = async (req, res) => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const activeLicenses = await prisma.license.findMany({
    where: {
      status: "ACTIVE",
      lastVerifiedAt: { gte: fiveMinutesAgo },
    },
    orderBy: { lastVerifiedAt: "desc" },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
      product: { select: { id: true, name: true, slug: true } },
      gameWhitelist: {
        where: { active: true },
        select: { gameId: true, gameName: true },
      },
    },
  });

  return res.status(200).json({
    count: activeLicenses.length,
    licenses: activeLicenses.map((l) => ({
      id: l.id,
      licenseKey: l.licenseKey,
      licenseType: l.licenseType,
      lastVerifiedAt: l.lastVerifiedAt,
      user: l.user,
      product: l.product,
      activeGames: l.gameWhitelist,
      metadata: l.metadata,
    })),
  });
};

/**
 * GET /admin/licenses/:id/logs - Get verification logs for a license
 */
export const handleAdminLicenseLogs = async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const license = await prisma.license.findUnique({
    where: { id },
    select: { id: true, licenseKey: true },
  });

  if (!license) {
    return res.status(404).json({ error: "License not found" });
  }

  const [logs, total] = await Promise.all([
    prisma.licenseVerification.findMany({
      where: { licenseId: id },
      orderBy: { verifiedAt: "desc" },
      take: safeLimit,
      skip,
    }),
    prisma.licenseVerification.count({ where: { licenseId: id } }),
  ]);

  return res.status(200).json({
    licenseId: id,
    licenseKey: license.licenseKey,
    logs,
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
  });
};

/**
 * POST /admin/licenses/:id/kill - Force trigger enforcement (kill switch)
 */
export const handleAdminKillSwitch = async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const license = await prisma.license.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, displayName: true } },
      product: { select: { name: true } },
    },
  });

  if (!license) {
    return res.status(404).json({ error: "License not found" });
  }

  // Suspend the license immediately
  const updated = await prisma.license.update({
    where: { id },
    data: {
      status: "SUSPENDED",
      metadata: {
        ...(license.metadata || {}),
        killSwitch: {
          triggeredAt: new Date().toISOString(),
          triggeredBy: "admin",
          reason: reason || "Manual kill switch",
        },
        statusHistory: [
          ...((license.metadata?.statusHistory) || []),
          { from: license.status, to: "SUSPENDED", reason: reason || "Kill switch", at: new Date().toISOString(), by: "admin" },
        ],
      },
    },
  });

  // Log activity
  await prisma.activityLog.create({
    data: {
      userId: license.userId,
      type: "TOKEN_USAGE",
      status: "INFO",
      title: "License killed",
      description: `License for "${license.product.name}" suspended via kill switch${reason ? `: ${reason}` : ""}`,
      metadata: { licenseId: id, reason },
    },
  });

  return res.status(200).json({
    ok: true,
    license: {
      id: updated.id,
      licenseKey: updated.licenseKey,
      status: updated.status,
    },
    message: "License suspended. Next heartbeat will trigger enforcement.",
  });
};
