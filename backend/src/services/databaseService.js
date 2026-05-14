/**
 * Database service layer untuk atomic wallet operations
 * Single source of truth: User.walletBalance (Rupiah)
 * All mutations go through WalletTransaction ledger
 */

import { prisma } from '../prisma.js';

/**
 * Credit wallet (add balance)
 * Used for: top-up, refund, admin adjustment
 * @param {string} userId
 * @param {number} amount - Amount in Rupiah (positive)
 * @param {Object} options - Transaction metadata
 * @returns {Promise<Object>} Updated user + transaction record
 */
export async function creditWallet(userId, amount, { type, referenceType, referenceId, description, metadata } = {}) {
  if (amount <= 0) throw new Error('Credit amount must be positive');

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        walletBalance: { increment: amount },
        totalTopUp: type === 'TOP_UP' ? { increment: amount } : undefined,
      },
      select: {
        id: true,
        walletBalance: true,
        totalTopUp: true,
        totalSpent: true,
      },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        userId,
        type: type || 'TOP_UP',
        amount,
        balanceAfter: user.walletBalance,
        referenceType,
        referenceId,
        description,
        metadata,
      },
    });

    return { user, transaction };
  });
}

/**
 * Debit wallet (deduct balance)
 * Used for: audio charge, script purchase
 * @param {string} userId
 * @param {number} amount - Amount in Rupiah (positive, will be stored as negative)
 * @param {Object} options - Transaction metadata
 * @returns {Promise<Object>} Updated user + transaction record
 * @throws {Error} If insufficient balance
 */
export async function debitWallet(userId, amount, { type, referenceType, referenceId, description, metadata } = {}) {
  if (amount <= 0) throw new Error('Debit amount must be positive');

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { walletBalance: true },
    });

    if (!user) throw new Error('User not found');
    if (user.walletBalance < amount) throw new Error('Insufficient balance');

    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        walletBalance: { decrement: amount },
        totalSpent: { increment: amount },
      },
      select: {
        id: true,
        walletBalance: true,
        totalTopUp: true,
        totalSpent: true,
      },
    });

    const transaction = await tx.walletTransaction.create({
      data: {
        userId,
        type: type || 'AUDIO_CHARGE',
        amount: -amount,
        balanceAfter: updated.walletBalance,
        referenceType,
        referenceId,
        description,
        metadata,
      },
    });

    return { user: updated, transaction };
  });
}

/**
 * Get user balance
 * @param {string} userId
 * @returns {Promise<Object>} Balance info
 */
export async function getUserBalance(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      walletBalance: true,
      totalTopUp: true,
      totalSpent: true,
    },
  });

  if (!user) throw new Error('User not found');

  return {
    balance: user.walletBalance,
    totalTopUp: user.totalTopUp,
    totalSpent: user.totalSpent,
  };
}

/**
 * Validate user has sufficient balance
 * @param {string} userId
 * @param {number} amount - Amount to check
 * @returns {Promise<boolean>}
 */
export async function validateBalance(userId, amount) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  });

  if (!user) return false;
  return user.walletBalance >= amount;
}

/**
 * Get user transaction history (unified ledger)
 * @param {string} userId
 * @param {Object} options - Pagination and filter options
 * @returns {Promise<Object>} Transactions with pagination
 */
export async function getUserTransactionHistory(userId, { limit = 20, offset = 0, type } = {}) {
  const where = { userId };
  if (type) where.type = type;

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    transactions,
    pagination: {
      total,
      limit,
      offset,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Admin: Adjust user balance (refund/correction)
 * @param {string} userId
 * @param {number} amount - Positive to add, negative to deduct
 * @param {string} reason
 * @returns {Promise<Object>}
 */
export async function adminAdjustBalance(userId, amount, reason) {
  if (amount === 0) throw new Error('Adjustment amount cannot be zero');

  if (amount > 0) {
    return await creditWallet(userId, amount, {
      type: 'ADJUSTMENT',
      description: `Admin adjustment: ${reason}`,
    });
  } else {
    return await debitWallet(userId, Math.abs(amount), {
      type: 'ADJUSTMENT',
      description: `Admin adjustment: ${reason}`,
    });
  }
}
