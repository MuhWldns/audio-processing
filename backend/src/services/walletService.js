/**
 * Wallet service dengan Claidex payment gateway integration
 */

import { atomicTopUp, atomicChargeService, getUserBalance, validateBalance } from './databaseService.js';

// Claidex API configuration
const CLAIDEX_API_BASE = process.env.PAYMENT_GATEWAY_BASE_URL || 'https://api.claidexpayment.host';
const CLAIDEX_API_KEY = process.env.PAYMENT_GATEWAY_API_KEY || '';

/**
 * Generate QR code untuk top up via Claidex
 * @param {number} amountRupiah - Amount in Rupiah (without decimals)
 * @returns {Promise<Object>} QR code data
 */
export async function generateClaidexQR(amountRupiah) {
  if (!CLAIDEX_API_KEY) {
    throw new Error('Claidex API key not configured');
  }

  if (amountRupiah <= 0) {
    throw new Error('Amount must be greater than 0');
  }

  // Claidex expects amount without decimals in request
  const url = `${CLAIDEX_API_BASE}/create-qr.php?amount=${amountRupiah}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': CLAIDEX_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claidex API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error('Failed to generate QR code');
    }

    return {
      success: true,
      amountRupiah: parseInt(data.amount), // Convert "75000.00" to 75000
      reference: data.reference,
      qrImage: data.qrImage,
      qrContent: data.qrContent,
      payUrl: data.payUrl,
      statusUrl: data.statusUrl,
      expired: data.expired,
      rawResponse: data
    };
  } catch (error) {
    console.error('Claidex QR generation error:', error);
    throw new Error(`Payment gateway error: ${error.message}`);
  }
}

/**
 * Check payment status dari Claidex
 * @param {string} reference - Payment reference ID
 * @returns {Promise<Object>} Payment status
 */
export async function checkClaidexPaymentStatus(reference) {
  if (!CLAIDEX_API_KEY) {
    throw new Error('Claidex API key not configured');
  }

  const url = `${CLAIDEX_API_BASE}/check-status.php?ref=${encodeURIComponent(reference)}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': CLAIDEX_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claidex API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Claidex status check error:', error);
    throw new Error(`Payment status check failed: ${error.message}`);
  }
}

/**
 * Initiate top up process
 * @param {string} userId - User ID
 * @param {number} amountRupiah - Amount to top up
 * @returns {Promise<Object>} Top up initiation result
 */
export async function initiateTopUp(userId, amountRupiah) {
  // Validate amount (minimum Rp 10.000, increments of 5.000)
  if (amountRupiah < 10000) {
    throw new Error('Minimum top up amount is Rp 10.000');
  }

  if (amountRupiah % 5000 !== 0) {
    throw new Error('Amount must be in multiples of Rp 5.000');
  }

  // Generate QR code via Claidex
  const qrData = await generateClaidexQR(amountRupiah);

  // Create pending transaction in database
  // Note: We'll create the actual transaction when payment is confirmed
  // For now, just return QR data
  
  return {
    success: true,
    userId,
    amountRupiah,
    reference: qrData.reference,
    qrImage: qrData.qrImage,
    qrContent: qrData.qrContent,
    payUrl: qrData.payUrl,
    statusUrl: qrData.statusUrl,
    expired: qrData.expired,
    message: 'Scan QR code to complete payment'
  };
}

/**
 * Process successful payment (called via webhook or polling)
 * @param {string} userId - User ID
 * @param {string} reference - Payment reference
 * @param {number} amountRupiah - Amount paid
 * @returns {Promise<Object>} Top up result
 */
export async function processSuccessfulPayment(userId, reference, amountRupiah) {
  // Check if transaction already processed
  const existingTransaction = await prisma.topUpTransaction.findFirst({
    where: {
      paymentId: reference,
      status: 'completed'
    }
  });

  if (existingTransaction) {
    return {
      success: true,
      alreadyProcessed: true,
      transactionId: existingTransaction.id,
      message: 'Payment already processed'
    };
  }

  // Process atomic top up
  const result = await atomicTopUp(userId, amountRupiah, {
    gateway: 'claidex',
    paymentId: reference,
    metadata: {
      reference,
      processedAt: new Date().toISOString()
    }
  });

  return {
    success: true,
    transactionId: result.transaction.id,
    newBalance: result.newBalance,
    formattedBalance: new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(result.newBalance),
    message: 'Top up successful'
  };
}

/**
 * Charge user for audio processing service
 * @param {string} userId - User ID
 * @param {number} durationSeconds - Audio duration in seconds
 * @param {Object} serviceMetadata - Additional service metadata
 * @returns {Promise<Object>} Charge result
 */
export async function chargeForAudioProcessing(userId, durationSeconds, serviceMetadata = {}) {
  // Import pricing service
  const { calculatePrice } = await import('./pricingService.js');
  
  // Calculate price
  const amountRupiah = calculatePrice(durationSeconds);
  
  // Validate user has sufficient balance
  const hasBalance = await validateBalance(userId, amountRupiah);
  if (!hasBalance) {
    const balance = await getUserBalance(userId);
    throw new Error(`Insufficient balance. Required: Rp ${amountRupiah.toLocaleString('id-ID')}, Available: Rp ${balance.balanceRupiah.toLocaleString('id-ID')}`);
  }

  // Process charge
  const result = await atomicChargeService(userId, amountRupiah, {
    durationSeconds,
    processingType: 'basic',
    serviceType: 'audio_processing',
    ...serviceMetadata
  });

  return {
    success: true,
    amountRupiah,
    durationSeconds,
    transactionId: result.transaction.id,
    remainingBalance: result.remainingBalance,
    formattedRemainingBalance: new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(result.remainingBalance),
    message: 'Payment processed successfully'
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
    formattedAmount: new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amountRupiah),
    breakdown,
    quoteId: `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  };
}

/**
 * Poll payment status and process if successful
 * @param {string} userId - User ID
 * @param {string} reference - Payment reference
 * @returns {Promise<Object>} Polling result
 */
export async function pollAndProcessPayment(userId, reference) {
  try {
    // Check payment status from Claidex
    const status = await checkClaidexPaymentStatus(reference);
    
    // Assuming status structure includes payment status
    // You'll need to adjust based on actual Claidex response
    if (status.success && status.status === 'paid') {
      const amountRupiah = parseInt(status.amount);
      return await processSuccessfulPayment(userId, reference, amountRupiah);
    } else if (status.status === 'pending') {
      return {
        success: false,
        status: 'pending',
        message: 'Payment still pending'
      };
    } else {
      return {
        success: false,
        status: 'failed',
        message: 'Payment failed or expired'
      };
    }
  } catch (error) {
    console.error('Payment polling error:', error);
    return {
      success: false,
      status: 'error',
      message: `Payment status check failed: ${error.message}`
    };
  }
}

// Export database functions for convenience
export { getUserBalance, validateBalance } from './databaseService.js';