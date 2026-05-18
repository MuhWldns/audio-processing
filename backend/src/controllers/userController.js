/**
 * Controller untuk user-facing endpoints (transactions, wallet)
 */

import { prisma } from "../prisma.js";

/**
 * GET /user/transactions - Get user's wallet transaction history
 */
export const handleGetUserTransactions = async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 20, type } = req.query;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const where = { userId };
  if (type && type !== "ALL") {
    where.type = type;
  }

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      skip,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return res.status(200).json({
    transactions: transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      description: t.description,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      createdAt: t.createdAt,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  });
};

/**
 * GET /admin/users - List all users (paginated, searchable)
 */
export const handleAdminListUsers = async (req, res) => {
  const { page = 1, limit = 50, search, role } = req.query;
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const skip = (safePage - 1) * safeLimit;

  const where = {};

  if (search) {
    where.OR = [
      { email: { contains: search } },
      { displayName: { contains: search } },
      { username: { contains: search } },
      { fullName: { contains: search } },
    ];
  }

  if (role && role !== "ALL") {
    where.role = role;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      skip,
      select: {
        id: true,
        email: true,
        displayName: true,
        fullName: true,
        username: true,
        avatarUrl: true,
        role: true,
        walletBalance: true,
        totalTopUp: true,
        totalSpent: true,
        lastLoginAt: true,
        lastLoginProvider: true,
        createdAt: true,
        _count: { select: { licenses: true, purchases: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return res.status(200).json({
    users: users.map((u) => ({
      ...u,
      licensesCount: u._count.licenses,
      purchasesCount: u._count.purchases,
      _count: undefined,
    })),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  });
};

/**
 * PUT /admin/users/:id/role - Change user role
 * Cannot demote yourself
 */
export const handleAdminChangeUserRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const adminId = req.user.id;

  if (!role || !["USER", "ADMIN"].includes(role)) {
    return res.status(400).json({ error: "Valid role required: USER or ADMIN" });
  }

  // Cannot demote yourself
  if (id === adminId && role === "USER") {
    return res.status(403).json({ error: "Cannot demote yourself" });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, displayName: true, role: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: id,
      type: "TOKEN_USAGE",
      status: "INFO",
      title: "Role changed",
      description: `Role changed from ${user.role} to ${role} by admin`,
      metadata: { changedBy: adminId, previousRole: user.role, newRole: role },
    },
  });

  return res.status(200).json({ ok: true, user: updated });
};

/**
 * POST /admin/users/:id/adjust-balance - Adjust user wallet balance
 */
export const handleAdminAdjustUserBalance = async (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  if (!amount || typeof amount !== "number" || amount === 0) {
    return res.status(400).json({ error: "Amount must be a non-zero number" });
  }

  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    return res.status(400).json({ error: "Reason is required" });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, walletBalance: true, email: true, displayName: true },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Check won't go negative
  if (amount < 0 && user.walletBalance + amount < 0) {
    return res.status(400).json({
      error: "Adjustment would result in negative balance",
      currentBalance: user.walletBalance,
      adjustment: amount,
    });
  }

  // Atomic adjust
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        walletBalance: amount > 0 ? { increment: amount } : { decrement: Math.abs(amount) },
        totalTopUp: amount > 0 ? { increment: amount } : undefined,
      },
      select: { id: true, walletBalance: true },
    });

    await tx.walletTransaction.create({
      data: {
        userId: id,
        type: "ADJUSTMENT",
        amount,
        balanceAfter: updated.walletBalance,
        referenceType: "ADMIN_ADJUSTMENT",
        description: `Admin adjustment: ${reason}`,
        metadata: { adjustedBy: req.user.id, reason },
      },
    });

    await tx.activityLog.create({
      data: {
        userId: id,
        type: amount > 0 ? "TOP_UP" : "TOKEN_USAGE",
        status: "INFO",
        title: "Balance adjusted",
        description: `Admin adjusted Rp ${Math.abs(amount).toLocaleString("id-ID")} (${amount > 0 ? "+" : "-"}): ${reason}`,
        amountRupiah: Math.abs(amount),
        metadata: { adjustedBy: req.user.id, reason, amount },
      },
    });

    return updated;
  });

  return res.status(200).json({
    ok: true,
    user: {
      id: result.id,
      newBalance: result.walletBalance,
    },
  });
};
