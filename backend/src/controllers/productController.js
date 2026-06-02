/**
 * Controller untuk product listing dan detail
 */

import { prisma } from "../prisma.js";

/**
 * GET /products - List all active products
 */
export const handleGetProducts = async (req, res) => {
  const { category, search, featured, sort = "newest", page = 1, limit = 20 } = req.query;

  const where = { active: true };

  if (category) {
    where.category = { slug: category };
  }

  if (featured === "true") {
    where.featured = true;
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
      { tags: { contains: search } },
    ];
  }

  const orderBy = {};
  switch (sort) {
    case "price-asc":
      orderBy.pricePersonal = "asc";
      break;
    case "price-desc":
      orderBy.pricePersonal = "desc";
      break;
    case "name":
      orderBy.name = "asc";
      break;
    case "newest":
    default:
      orderBy.createdAt = "desc";
      break;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        _count: { select: { licenses: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return res.status(200).json({
    products: products.map((p) => ({
      id: p.id,
      publicId: p.publicId,
      name: p.name,
      slug: p.slug,
      shortDesc: p.shortDesc,
      thumbnail: p.thumbnail,
      pricePersonal: p.pricePersonal,
      priceCommercial: p.priceCommercial,
      priceEnterprise: p.priceEnterprise,
      featured: p.featured,
      version: p.version,
      tags: p.tags ? p.tags.split(",").map((t) => t.trim()) : [],
      category: p.category,
      image: p.images[0]?.url || null,
      soldCount: p._count.licenses,
      createdAt: p.createdAt,
    })),
    pagination: {
      page: Number(page),
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
    },
  });
};

/**
 * GET /products/:idOrSlug - Get product detail
 */
export const handleGetProductDetail = async (req, res) => {
  const { idOrSlug } = req.params;

  const product = await prisma.product.findFirst({
    where: {
      active: true,
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      images: { orderBy: { sortOrder: "asc" } },
      files: {
        where: { fileType: "documentation" },
        select: { id: true, fileName: true, fileType: true, version: true },
      },
      _count: { select: { licenses: true } },
    },
  });

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  return res.status(200).json({
    id: product.id,
    publicId: product.publicId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    shortDesc: product.shortDesc,
    thumbnail: product.thumbnail,
    pricePersonal: product.pricePersonal,
    priceCommercial: product.priceCommercial,
    priceEnterprise: product.priceEnterprise,
    featured: product.featured,
    version: product.version,
    tags: product.tags ? product.tags.split(",").map((t) => t.trim()) : [],
    category: product.category,
    images: product.images,
    docs: product.files,
    soldCount: product._count.licenses,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  });
};

/**
 * GET /products/categories - List all active categories
 */
export const handleGetCategories = async (req, res) => {
  const categories = await prisma.productCategory.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { products: { where: { active: true } } } },
    },
  });

  return res.status(200).json({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: c.icon,
      productCount: c._count.products,
    })),
  });
};
