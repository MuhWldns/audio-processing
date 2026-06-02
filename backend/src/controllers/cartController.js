/**
 * Controller untuk shopping cart
 */

import { prisma } from "../prisma.js";

/**
 * GET /cart - Get user's cart
 */
export const handleGetCart = async (req, res) => {
  const userId = req.user.id;

  let cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              thumbnail: true,
              pricePersonal: true,
              priceCommercial: true,
              priceEnterprise: true,
              active: true,
            },
          },
        },
        orderBy: { addedAt: "desc" },
      },
    },
  });

  if (!cart) {
    return res.status(200).json({ items: [], total: 0 });
  }

  const items = cart.items
    .filter((item) => item.product.active)
    .map((item) => ({
      id: item.id,
      productId: item.productId,
      product: item.product,
      licenseType: item.licenseType,
      priceRupiah: item.priceRupiah,
      addedAt: item.addedAt,
    }));

  const total = items.reduce((sum, item) => sum + item.priceRupiah, 0);

  return res.status(200).json({ items, total });
};

/**
 * POST /cart/add - Add item to cart
 */
export const handleAddToCart = async (req, res) => {
  const userId = req.user.id;
  const { productId, licenseType = "PERSONAL" } = req.body;

  if (!productId) {
    return res.status(400).json({ error: "productId is required" });
  }

  if (!["PERSONAL", "COMMERCIAL", "ENTERPRISE"].includes(licenseType)) {
    return res.status(400).json({ error: "Invalid licenseType" });
  }

  // Check product exists and is active
  const product = await prisma.product.findFirst({
    where: { id: productId, active: true },
  });

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  // Check if user already owns a license for this product
  const existingLicense = await prisma.license.findFirst({
    where: {
      userId,
      productId,
      status: "ACTIVE",
    },
  });

  if (existingLicense) {
    return res.status(409).json({ error: "You already own a license for this product" });
  }

  // Get price based on license type
  let priceRupiah;
  switch (licenseType) {
    case "COMMERCIAL":
      priceRupiah = product.priceCommercial;
      break;
    case "ENTERPRISE":
      priceRupiah = product.priceEnterprise;
      break;
    case "PERSONAL":
    default:
      priceRupiah = product.pricePersonal;
      break;
  }

  // Get or create cart
  let cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) {
    cart = await prisma.cart.create({ data: { userId } });
  }

  // Check if product already in cart
  const existingItem = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId } },
  });

  if (existingItem) {
    // Update license type and price
    const updated = await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { licenseType, priceRupiah },
    });
    return res.status(200).json({ ok: true, item: updated, updated: true });
  }

  // Add new item
  const item = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId,
      licenseType,
      priceRupiah,
    },
  });

  return res.status(201).json({ ok: true, item, updated: false });
};

/**
 * DELETE /cart/:itemId - Remove item from cart
 */
export const handleRemoveFromCart = async (req, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;

  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) {
    return res.status(404).json({ error: "Cart not found" });
  }

  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cartId: cart.id },
  });

  if (!item) {
    return res.status(404).json({ error: "Item not found in cart" });
  }

  await prisma.cartItem.delete({ where: { id: itemId } });

  return res.status(200).json({ ok: true });
};

/**
 * DELETE /cart - Clear entire cart
 */
export const handleClearCart = async (req, res) => {
  const userId = req.user.id;

  const cart = await prisma.cart.findUnique({ where: { userId } });
  if (!cart) {
    return res.status(200).json({ ok: true });
  }

  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

  return res.status(200).json({ ok: true });
};
