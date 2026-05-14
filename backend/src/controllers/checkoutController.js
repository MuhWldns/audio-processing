/**
 * Controller untuk checkout/purchase
 * Handles wallet deduction + license generation
 */

import crypto from "node:crypto";
import { prisma } from "../prisma.js";
import { debitWallet } from "../services/databaseService.js";

/**
 * Generate a unique license key
 */
function generateLicenseKey() {
  // Format: RBXR-XXXX-XXXX-XXXX-XXXX
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(2).toString("hex").toUpperCase());
  }
  return `RBXR-${segments.join("-")}`;
}

/**
 * Get max games allowed per license type
 */
function getMaxGames(licenseType) {
  switch (licenseType) {
    case "PERSONAL":
      return 3;
    case "COMMERCIAL":
      return 10;
    case "ENTERPRISE":
      return null; // unlimited
    default:
      return 3;
  }
}

/**
 * POST /checkout - Purchase all items in cart
 */
export const handleCheckout = async (req, res) => {
  const userId = req.user.id;

  // Get cart with items
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, active: true } },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  // Filter out inactive products
  const validItems = cart.items.filter((item) => item.product.active);
  if (validItems.length === 0) {
    return res.status(400).json({ error: "No valid items in cart" });
  }

  // Check for existing licenses (prevent double purchase)
  const existingLicenses = await prisma.license.findMany({
    where: {
      userId,
      productId: { in: validItems.map((i) => i.productId) },
      status: "ACTIVE",
    },
    select: { productId: true },
  });

  const alreadyOwned = new Set(existingLicenses.map((l) => l.productId));
  const purchasableItems = validItems.filter((item) => !alreadyOwned.has(item.productId));

  if (purchasableItems.length === 0) {
    return res.status(409).json({ error: "You already own licenses for all items in cart" });
  }

  const purchaseTotal = purchasableItems.reduce((sum, item) => sum + item.priceRupiah, 0);

  // Check user balance
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  if (user.walletBalance < purchaseTotal) {
    return res.status(402).json({
      error: "Insufficient balance",
      required: purchaseTotal,
      balance: user.walletBalance,
      shortfall: purchaseTotal - user.walletBalance,
    });
  }

  // Execute purchase in transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Deduct balance
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        walletBalance: { decrement: purchaseTotal },
        totalSpent: { increment: purchaseTotal },
      },
      select: { walletBalance: true },
    });

    // 2. Create purchases and licenses for each item
    const purchases = [];
    const licenses = [];

    for (const item of purchasableItems) {
      // Create purchase record
      const purchase = await tx.purchase.create({
        data: {
          userId,
          productId: item.productId,
          licenseType: item.licenseType,
          amountRupiah: item.priceRupiah,
          status: "COMPLETED",
        },
      });
      purchases.push(purchase);

      // Generate unique license key
      let licenseKey = generateLicenseKey();
      let keyExists = await tx.license.findUnique({ where: { licenseKey } });
      while (keyExists) {
        licenseKey = generateLicenseKey();
        keyExists = await tx.license.findUnique({ where: { licenseKey } });
      }

      // Create license
      const license = await tx.license.create({
        data: {
          userId,
          productId: item.productId,
          purchaseId: purchase.id,
          licenseKey,
          licenseType: item.licenseType,
          status: "ACTIVE",
          maxGames: getMaxGames(item.licenseType),
        },
      });
      licenses.push(license);

      // Create wallet transaction for each purchase
      await tx.walletTransaction.create({
        data: {
          userId,
          type: "PURCHASE",
          amount: -item.priceRupiah,
          balanceAfter: updatedUser.walletBalance,
          referenceType: "PURCHASE",
          referenceId: purchase.id,
          description: `Purchase: ${item.product.name} (${item.licenseType})`,
        },
      });
    }

    // 3. Create activity log
    await tx.activityLog.create({
      data: {
        userId,
        type: "TOKEN_USAGE",
        status: "SUCCESS",
        title: "Script Purchase",
        description: `Purchased ${purchasableItems.length} script(s) for Rp ${purchaseTotal.toLocaleString("id-ID")}`,
        amountRupiah: purchaseTotal,
        metadata: {
          purchaseIds: purchases.map((p) => p.id),
          licenseIds: licenses.map((l) => l.id),
          items: purchasableItems.map((i) => ({
            productId: i.productId,
            productName: i.product.name,
            licenseType: i.licenseType,
            price: i.priceRupiah,
          })),
        },
      },
    });

    // 4. Clear cart
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return {
      purchases,
      licenses,
      newBalance: updatedUser.walletBalance,
    };
  });

  return res.status(201).json({
    ok: true,
    purchases: result.purchases.map((p) => ({
      id: p.id,
      productId: p.productId,
      licenseType: p.licenseType,
      amountRupiah: p.amountRupiah,
    })),
    licenses: result.licenses.map((l) => ({
      id: l.id,
      productId: l.productId,
      licenseKey: l.licenseKey,
      licenseType: l.licenseType,
      maxGames: l.maxGames,
    })),
    totalCharged: purchaseTotal,
    newBalance: result.newBalance,
  });
};
