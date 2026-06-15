/**
 * Controller untuk checkout/purchase
 * Handles wallet deduction + license generation
 */

import crypto from "node:crypto";
import { prisma } from "../prisma.js";
import { sendPurchaseSuccessEmail } from "../services/emailService.js";
import { debitWallet } from "../services/databaseService.js";
import { generatePublicId, getLicenseTypeCode } from "../services/publicIdService.js";

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

  // Pre-check balance (fast fail before entering transaction)
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

  // Execute purchase in transaction (with atomic balance check)
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      // 1. Atomic conditional deduct (CAS) — prevents concurrent overspend.
      // The WHERE walletBalance >= purchaseTotal guard makes the check and the
      // decrement a single indivisible operation: only one of N concurrent
      // transactions can satisfy the predicate and claim the funds.
      const claim = await tx.user.updateMany({
        where: { id: userId, walletBalance: { gte: purchaseTotal } },
        data: {
          walletBalance: { decrement: purchaseTotal },
          totalSpent: { increment: purchaseTotal },
        },
      });

      if (claim.count === 0) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // Safe read-back: the atomic claim above already secured the funds, so no
      // other transaction can have double-spent this balance once count === 1.
      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      });

    // 2. Create purchases and licenses for each item
    const purchases = [];
    const licenses = [];

    for (const item of purchasableItems) {
      const licenseTypeCode = getLicenseTypeCode(item.licenseType);
      const purchasePublicId = await generatePublicId(tx, "PUR", licenseTypeCode);
      // Create purchase record
      const purchase = await tx.purchase.create({
        data: {
          publicId: purchasePublicId,
          userId,
          productId: item.productId,
          licenseType: item.licenseType,
          amountRupiah: item.priceRupiah,
          status: "COMPLETED",
        },
      });
      purchases.push(purchase);

      // Generate unique license key (max 10 attempts)
      let licenseKey = generateLicenseKey();
      let keyExists = await tx.license.findUnique({ where: { licenseKey } });
      let attempts = 0;
      while (keyExists && attempts < 10) {
        licenseKey = generateLicenseKey();
        keyExists = await tx.license.findUnique({ where: { licenseKey } });
        attempts++;
      }
      if (keyExists) {
        throw new Error("Failed to generate unique license key");
      }

      // Create license
      const licensePublicId = await generatePublicId(tx, "LIC", licenseTypeCode);
      const license = await tx.license.create({
        data: {
          publicId: licensePublicId,
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
      const walletTransactionPublicId = await generatePublicId(tx, "TXN", "PUR");
      await tx.walletTransaction.create({
        data: {
          publicId: walletTransactionPublicId,
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
  } catch (err) {
    if (err.message === "INSUFFICIENT_BALANCE") {
      // Do NOT report `user.walletBalance` here: it's a stale snapshot from the
      // pre-check read and is misleading under concurrency (another request may
      // have drained the balance after we read it). The atomic CAS is the
      // authoritative rejection.
      return res.status(402).json({
        error: "Insufficient balance",
        required: purchaseTotal,
      });
    }
    throw err;
  }

  // Send email notification (fire-and-forget)
  const emailUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, displayName: true },
  });
  if (emailUser) {
    const purchaseDetails = result.purchases.map((p, i) => ({
      ...p,
      productName: purchasableItems[i]?.product?.name || "Script",
    }));
    sendPurchaseSuccessEmail(emailUser, purchaseDetails, result.licenses, purchaseTotal, result.newBalance).catch(() => {});
  }

  return res.status(201).json({
    ok: true,
    purchases: result.purchases.map((p) => ({
      id: p.id,
      publicId: p.publicId,
      productId: p.productId,
      licenseType: p.licenseType,
      amountRupiah: p.amountRupiah,
    })),
    licenses: result.licenses.map((l) => ({
      id: l.id,
      publicId: l.publicId,
      productId: l.productId,
      licenseKey: l.licenseKey,
      licenseType: l.licenseType,
      maxGames: l.maxGames,
    })),
    totalCharged: purchaseTotal,
    newBalance: result.newBalance,
  });
};
