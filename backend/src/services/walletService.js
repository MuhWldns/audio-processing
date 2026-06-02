/**
 * Wallet service — audio processing charges and pricing utilities
 * Payment gateway: Bayar.gg (primary), Claidex (legacy/unused)
 */

import { debitWallet, getUserBalance, validateBalance } from './databaseService.js';

/**
 * Charge user for audio processing service
 * @param {string} userId - User ID
 * @param {number} durationSeconds - Audio duration in seconds
 * @param {Object} serviceMetadata - Additional service metadata
 * @returns {Promise<Object>} Charge result
 */
export async function chargeForAudioProcessing(userId, durationSeconds, serviceMetadata = {}) {
  const { calculatePrice } = await import('./pricingService.js');

  const amountRupiah = calculatePrice(durationSeconds);

  const hasBalance = await validateBalance(userId, amountRupiah);
  if (!hasBalance) {
    const balance = await getUserBalance(userId);
    throw new Error(`Insufficient balance. Required: Rp ${amountRupiah.toLocaleString('id-ID')}, Available: Rp ${balance.balance.toLocaleString('id-ID')}`);
  }

  const result = await debitWallet(userId, amountRupiah, {
    type: 'AUDIO_CHARGE',
    referenceType: 'USAGE_EVENT',
    description: `Audio processing ${durationSeconds}s - Rp ${amountRupiah.toLocaleString('id-ID')}`,
    metadata: {
      durationSeconds,
      ...serviceMetadata,
    },
  });

  return {
    success: true,
    amountRupiah,
    durationSeconds,
    remainingBalance: result.user.walletBalance,
    message: 'Payment processed successfully',
  };
}

/**
 * Get price quote for audio processing
 * @param {number} durationSeconds - Audio duration in seconds
 * @returns {Promise<Object>} Price quote
 */
export async function getAudioProcessingQuote(durationSeconds) {
  const { calculatePrice, getPricingBreakdown } = await import('./pricingService.js');

  const amountRupiah = calculatePrice(durationSeconds);
  const breakdown = getPricingBreakdown(durationSeconds);

  return {
    durationSeconds,
    durationMinutes: Math.ceil(durationSeconds / 60),
    amountRupiah,
    formattedAmount: `Rp ${amountRupiah.toLocaleString('id-ID')}`,
    breakdown,
  };
}

// Re-export database functions for convenience
export { getUserBalance, validateBalance } from './databaseService.js';
