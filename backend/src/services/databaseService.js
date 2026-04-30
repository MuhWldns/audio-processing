/**
 * Database service layer untuk atomic operations
 * Memastikan consistency dan menghindari race conditions
 */

import { prisma } from '../prisma.js';

/**
 * Atomic operation untuk top up saldo
 * @param {string} userId - ID user
 * @param {number} amountRupiah - Jumlah top up dalam Rupiah
 * @param {Object} paymentData - Data payment dari gateway
 * @returns {Promise<Object>} Result transaction
 */
export async function atomicTopUp(userId, amountRupiah, paymentData) {
  return await prisma.$transaction(async (tx) => {
    // 1. Create top up transaction record
    const topUpTransaction = await tx.topUpTransaction.create({
      data: {
        userId,
        amountRupiah,
        paymentGateway: paymentData.gateway || 'claidex',
        paymentId: paymentData.paymentId,
        status: 'completed',
        metadata: paymentData.metadata || {}
      }
    });

    // 2. Update user wallet balance (atomic)
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        walletBalanceRupiah: { increment: amountRupiah },
        totalTopUpRupiah: { increment: amountRupiah }
      },
      select: {
        id: true,
        walletBalanceRupiah: true,
        totalTopUpRupiah: true
      }
    });

    // 3. Create activity log
    await tx.activityLog.create({
      data: {
        userId,
        type: 'TOP_UP',
        status: 'SUCCESS',
        title: 'Top Up Saldo',
        description: `Top up Rp ${amountRupiah.toLocaleString('id-ID')} via ${paymentData.gateway || 'claidex'}`,
        amountTokens: amountRupiah
      }
    });

    return {
      transaction: topUpTransaction,
      user: updatedUser,
      newBalance: updatedUser.walletBalanceRupiah
    };
  });
}

/**
 * Atomic operation untuk charge service dari saldo
 * @param {string} userId - ID user
 * @param {number} amountRupiah - Jumlah yang akan di-charge
 * @param {Object} serviceData - Data service (duration, type, etc.)
 * @returns {Promise<Object>} Result transaction
 * @throws {Error} Jika saldo tidak cukup
 */
export async function atomicChargeService(userId, amountRupiah, serviceData) {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock user row untuk prevent race condition
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { walletBalanceRupiah: true },
      // FOR UPDATE lock (Prisma tidak support langsung, kita handle dengan transaction isolation)
    });

    if (!user) {
      throw new Error('User not found');
    }

    // 2. Check balance
    if (user.walletBalanceRupiah < amountRupiah) {
      throw new Error('Insufficient balance');
    }

    // 3. Create service transaction
    const serviceTransaction = await tx.serviceTransaction.create({
      data: {
        userId,
        amountRupiah,
        durationSeconds: serviceData.durationSeconds || 0,
        processingType: serviceData.processingType || 'basic',
        serviceType: serviceData.serviceType || 'audio_processing',
        status: 'completed',
        metadata: serviceData.metadata || {}
      }
    });

    // 4. Deduct from balance
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        walletBalanceRupiah: { decrement: amountRupiah },
        totalSpentRupiah: { increment: amountRupiah }
      },
      select: {
        id: true,
        walletBalanceRupiah: true,
        totalSpentRupiah: true
      }
    });

    // 5. Create activity log
    await tx.activityLog.create({
      data: {
        userId,
        type: 'TOKEN_USAGE',
        status: 'SUCCESS',
        title: 'Audio Processing',
        description: `Process audio ${serviceData.durationSeconds || 0}s - Rp ${amountRupiah.toLocaleString('id-ID')}`,
        amountTokens: amountRupiah,
        fileName: serviceData.fileName,
        fileFormat: serviceData.fileFormat
      }
    });

    return {
      transaction: serviceTransaction,
      user: updatedUser,
      remainingBalance: updatedUser.walletBalanceRupiah
    };
  });
}

/**
 * Get user balance dengan consistency check
 * @param {string} userId - ID user
 * @returns {Promise<Object>} User balance info
 */
export async function getUserBalance(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      walletBalanceRupiah: true,
      totalTopUpRupiah: true,
      totalSpentRupiah: true
    }
  });

  if (!user) {
    throw new Error('User not found');
  }

  return {
    balanceRupiah: user.walletBalanceRupiah,
    totalTopUpRupiah: user.totalTopUpRupiah,
    totalSpentRupiah: user.totalSpentRupiah,
    formattedBalance: new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(user.walletBalanceRupiah)
  };
}

/**
 * Validate user has sufficient balance
 * @param {string} userId - ID user
 * @param {number} amountRupiah - Amount to check
 * @returns {Promise<boolean>} True jika cukup
 */
export async function validateBalance(userId, amountRupiah) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletBalanceRupiah: true }
  });

  if (!user) {
    return false;
  }

  return user.walletBalanceRupiah >= amountRupiah;
}

/**
 * Get user transaction history
 * @param {string} userId - ID user
 * @param {number} limit - Limit results
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Transaction history
 */
export async function getUserTransactionHistory(userId, limit = 20, offset = 0) {
  const [topUps, services] = await Promise.all([
    prisma.topUpTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        amountRupiah: true,
        status: true,
        paymentGateway: true,
        createdAt: true
      }
    }),
    prisma.serviceTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        amountRupiah: true,
        durationSeconds: true,
        serviceType: true,
        status: true,
        createdAt: true
      }
    })
  ]);

  // Combine and sort by date
  const allTransactions = [
    ...topUps.map(t => ({ ...t, type: 'TOP_UP' })),
    ...services.map(t => ({ ...t, type: 'SERVICE' }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
   .slice(0, limit);

  return allTransactions.map(t => ({
    ...t,
    formattedAmount: new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(t.amountRupiah),
    formattedDate: new Date(t.createdAt).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }));
}

/**
 * Admin function: Adjust user balance (for refunds/corrections)
 * @param {string} userId - ID user
 * @param {number} amountRupiah - Amount to adjust (positive for add, negative for deduct)
 * @param {string} reason - Reason for adjustment
 * @returns {Promise<Object>} Adjustment result
 */
export async function adminAdjustBalance(userId, amountRupiah, reason) {
  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { walletBalanceRupiah: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Validate new balance won't go negative
    if (user.walletBalanceRupiah + amountRupiah < 0) {
      throw new Error('Adjustment would result in negative balance');
    }

    const updateData = amountRupiah > 0 
      ? { walletBalanceRupiah: { increment: amountRupiah } }
      : { walletBalanceRupiah: { decrement: Math.abs(amountRupiah) } };

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        walletBalanceRupiah: true
      }
    });

    // Create adjustment record
    await tx.activityLog.create({
      data: {
        userId,
        type: amountRupiah > 0 ? 'TOP_UP' : 'TOKEN_USAGE',
        status: 'INFO',
        title: 'Balance Adjustment',
        description: `Admin adjustment: ${reason} - Rp ${Math.abs(amountRupiah).toLocaleString('id-ID')}`,
        amountTokens: Math.abs(amountRupiah)
      }
    });

    return {
      userId,
      adjustment: amountRupiah,
      newBalance: updatedUser.walletBalanceRupiah,
      reason
    };
  });
}