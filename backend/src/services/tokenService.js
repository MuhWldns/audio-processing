/**
 * Service untuk business logic token dan wallet
 */

import { prisma } from "../prisma.js";

/**
 * Reserve token sebelum penggunaan
 * @param {Object} params - Reserve parameters
 * @param {string} params.userId - ID user
 * @param {number} params.amount - Jumlah token yang direserve
 * @param {string} params.referenceType - Tipe reference
 * @param {string} params.referenceId - ID reference
 * @param {string} params.memo - Deskripsi transaksi
 * @returns {Promise<Object>} Transaction result
 */
export const reserveTokens = async ({ userId, amount, referenceType, referenceId, memo }) => {
  return await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true, balanceTokens: true, reservedTokens: true },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.balanceTokens - wallet.reservedTokens < amount) {
      throw new Error("Insufficient available tokens");
    }

    // Update reserved tokens
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        reservedTokens: {
          increment: amount,
        },
      },
    });

    // Create transaction record
    const transaction = await tx.tokenTransaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: "RESERVE",
        amountTokens: -amount,
        referenceType,
        referenceId,
        memo,
        metadata: {
          reservedAmount: amount,
          previousReserved: wallet.reservedTokens,
          newReserved: updatedWallet.reservedTokens,
        },
      },
    });

    return {
      wallet: updatedWallet,
      transaction,
    };
  });
};

/**
 * Settle token setelah penggunaan sukses
 * @param {Object} params - Settle parameters
 * @param {string} params.userId - ID user
 * @param {number} params.amount - Jumlah token yang disettle
 * @param {string} params.referenceType - Tipe reference
 * @param {string} params.referenceId - ID reference
 * @param {string} params.memo - Deskripsi transaksi
 * @returns {Promise<Object>} Transaction result
 */
export const settleTokens = async ({ userId, amount, referenceType, referenceId, memo }) => {
  return await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true, balanceTokens: true, reservedTokens: true },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.reservedTokens < amount) {
      throw new Error("Insufficient reserved tokens");
    }

    // Update balance and reserved tokens
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        balanceTokens: {
          decrement: amount,
        },
        reservedTokens: {
          decrement: amount,
        },
        lifetimeSpent: {
          increment: amount,
        },
      },
    });

    // Create transaction record
    const transaction = await tx.tokenTransaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: "SETTLE",
        amountTokens: -amount,
        referenceType,
        referenceId,
        memo,
        metadata: {
          settledAmount: amount,
          previousBalance: wallet.balanceTokens,
          newBalance: updatedWallet.balanceTokens,
          previousReserved: wallet.reservedTokens,
          newReserved: updatedWallet.reservedTokens,
        },
      },
    });

    return {
      wallet: updatedWallet,
      transaction,
    };
  });
};

/**
 * Refund token jika penggunaan gagal
 * @param {Object} params - Refund parameters
 * @param {string} params.userId - ID user
 * @param {number} params.amount - Jumlah token yang direfund
 * @param {string} params.referenceType - Tipe reference
 * @param {string} params.referenceId - ID reference
 * @param {string} params.memo - Deskripsi transaksi
 * @returns {Promise<Object>} Transaction result
 */
export const refundTokens = async ({ userId, amount, referenceType, referenceId, memo }) => {
  return await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true, balanceTokens: true, reservedTokens: true },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.reservedTokens < amount) {
      throw new Error("Insufficient reserved tokens");
    }

    // Return reserved tokens back to available balance
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        reservedTokens: {
          decrement: amount,
        },
      },
    });

    // Create transaction record
    const transaction = await tx.tokenTransaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: "REFUND",
        amountTokens: 0, // No balance change, just reservation release
        referenceType,
        referenceId,
        memo,
        metadata: {
          refundedAmount: amount,
          previousReserved: wallet.reservedTokens,
          newReserved: updatedWallet.reservedTokens,
        },
      },
    });

    return {
      wallet: updatedWallet,
      transaction,
    };
  });
};

/**
 * Top up token ke wallet
 * @param {Object} params - Top up parameters
 * @param {string} params.userId - ID user
 * @param {number} params.amount - Jumlah token yang ditop up
 * @param {string} params.paymentMethod - Metode pembayaran
 * @param {string} params.paymentReference - Reference pembayaran
 * @param {string} params.memo - Deskripsi transaksi
 * @returns {Promise<Object>} Transaction result
 */
export const topUpTokens = async ({ userId, amount, paymentMethod, paymentReference, memo }) => {
  return await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: { id: true, balanceTokens: true },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Update wallet balance
    const updatedWallet = await tx.wallet.update({
      where: { userId },
      data: {
        balanceTokens: {
          increment: amount,
        },
        lifetimeTopUp: {
          increment: amount,
        },
      },
    });

    // Create top-up order
    const topUpOrder = await tx.topUpOrder.create({
      data: {
        userId,
        walletId: wallet.id,
        amountTokens: amount,
        paymentMethod,
        paymentReference,
        status: "COMPLETED",
        memo,
      },
    });

    // Create transaction record
    const transaction = await tx.tokenTransaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: "TOP_UP",
        amountTokens: amount,
        referenceType: "TOP_UP_ORDER",
        referenceId: topUpOrder.id,
        memo,
        metadata: {
          paymentMethod,
          paymentReference,
          previousBalance: wallet.balanceTokens,
          newBalance: updatedWallet.balanceTokens,
        },
      },
    });

    return {
      wallet: updatedWallet,
      topUpOrder,
      transaction,
    };
  });
};

/**
 * Get wallet summary untuk user
 * @param {string} userId - ID user
 * @returns {Promise<Object>} Wallet summary
 */
export const getWalletSummary = async (userId) => {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    include: {
      transactions: {
        take: 10,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!wallet) {
    return null;
  }

  const availableTokens = wallet.balanceTokens - wallet.reservedTokens;

  return {
    balanceTokens: wallet.balanceTokens,
    reservedTokens: wallet.reservedTokens,
    availableTokens,
    lifetimeTopUp: wallet.lifetimeTopUp,
    lifetimeSpent: wallet.lifetimeSpent,
    recentTransactions: wallet.transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      amountTokens: tx.amountTokens,
      memo: tx.memo,
      createdAt: tx.createdAt,
    })),
  };
};