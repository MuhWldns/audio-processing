/**
 * Service untuk menghitung harga audio processing berdasarkan durasi
 */

/**
 * Konfigurasi pricing progressive (HANYA berdasarkan durasi)
 */
export const PRICING_CONFIG = {
  // Pricing tiers berdasarkan menit (pembulatan ke ATAS)
  tiers: [
    { maxMinutes: 2, price: 2000 },    // 0-2 menit: Rp 2.000
    { maxMinutes: 3, price: 2500 },    // 2-3 menit: Rp 2.500 (+25%)
    { maxMinutes: 4, price: 3000 },    // 3-4 menit: Rp 3.000 (+50%)
    { maxMinutes: 5, price: 3500 },    // 4-5 menit: Rp 3.500 (+75%)
    { maxMinutes: 6, price: 4000 },    // 5-6 menit: Rp 4.000 (+100%)
    { maxMinutes: 7, price: 4500 },    // 6-7 menit: Rp 4.500 (+125%)
    // >7 menit: Rp 5.000 (max cap)
  ],
  
  // Maximum price cap
  maxPrice: 5000, // Rp 5.000
  
  // Minimum durasi untuk charge (dalam detik)
  minimumDurationSeconds: 1
};

/**
 * Hitung harga HANYA berdasarkan durasi (dalam detik)
 * @param {number} durationSeconds - Durasi audio dalam detik
 * @returns {number} Harga dalam Rupiah
 */
export function calculatePrice(durationSeconds) {
  // Validasi input
  if (durationSeconds <= 0) {
    return PRICING_CONFIG.tiers[0].price; // Rp 2.000 minimum
  }
  
  // Konversi ke menit (pembulatan ke ATAS)
  // 1 detik = 1 menit, 61 detik = 2 menit, dst.
  const minutes = Math.ceil(durationSeconds / 60);
  
  // Cari tier yang sesuai
  for (const tier of PRICING_CONFIG.tiers) {
    if (minutes <= tier.maxMinutes) {
      return tier.price;
    }
  }
  
  // Jika lebih dari tier tertinggi, return max cap
  return PRICING_CONFIG.maxPrice;
}

/**
 * Format harga untuk display
 * @param {number} priceRupiah - Harga dalam Rupiah
 * @returns {string} Harga yang diformat
 */
export function formatPrice(priceRupiah) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(priceRupiah);
}

/**
 * Hitung harga per menit (untuk display informasi)
 * @param {number} durationSeconds - Durasi dalam detik
 * @param {number} priceRupiah - Harga total
 * @returns {number} Harga per menit
 */
export function calculatePricePerMinute(durationSeconds, priceRupiah) {
  const minutes = durationSeconds / 60;
  if (minutes <= 0) return 0;
  
  return Math.round(priceRupiah / minutes);
}

/**
 * Generate breakdown pricing untuk transparansi
 * @param {number} durationSeconds - Durasi dalam detik
 * @returns {Object} Breakdown pricing
 */
export function getPricingBreakdown(durationSeconds) {
  const minutes = Math.ceil(durationSeconds / 60);
  const totalPrice = calculatePrice(durationSeconds);
  const pricePerMinute = calculatePricePerMinute(durationSeconds, totalPrice);
  
  // Cari tier yang sesuai
  let tierName = '';
  for (const tier of PRICING_CONFIG.tiers) {
    if (minutes <= tier.maxMinutes) {
      tierName = `${tier.maxMinutes === 2 ? '0-2' : tier.maxMinutes-1 + '-' + tier.maxMinutes} menit`;
      break;
    }
  }
  
  if (!tierName && minutes > PRICING_CONFIG.tiers[PRICING_CONFIG.tiers.length - 1].maxMinutes) {
    tierName = `>${PRICING_CONFIG.tiers[PRICING_CONFIG.tiers.length - 1].maxMinutes} menit`;
  }
  
  return {
    durationSeconds,
    durationMinutes: minutes,
    tierName,
    totalPrice,
    pricePerMinute,
    formattedPrice: formatPrice(totalPrice),
    formattedPricePerMinute: formatPrice(pricePerMinute),
    isCapped: minutes > PRICING_CONFIG.tiers[PRICING_CONFIG.tiers.length - 1].maxMinutes,
    maxPrice: PRICING_CONFIG.maxPrice,
    pricingTiers: PRICING_CONFIG.tiers.map(t => ({
      range: t.maxMinutes === 2 ? '0-2' : `${t.maxMinutes-1}-${t.maxMinutes}`,
      price: t.price,
      formattedPrice: formatPrice(t.price)
    }))
  };
}

/**
 * Test function untuk verifikasi pricing logic
 */
export function testPricingLogic() {
  const testCases = [
    { seconds: 30, expected: 2000, description: '30 detik (≤2 menit)' },
    { seconds: 120, expected: 2000, description: '2 menit tepat' },
    { seconds: 121, expected: 2500, description: '2 menit 1 detik (3 menit)' },
    { seconds: 180, expected: 2500, description: '3 menit tepat' },
    { seconds: 181, expected: 3000, description: '3 menit 1 detik (4 menit)' },
    { seconds: 240, expected: 3000, description: '4 menit tepat' },
    { seconds: 241, expected: 3500, description: '4 menit 1 detik (5 menit)' },
    { seconds: 300, expected: 3500, description: '5 menit tepat' },
    { seconds: 301, expected: 4000, description: '5 menit 1 detik (6 menit)' },
    { seconds: 360, expected: 4000, description: '6 menit tepat' },
    { seconds: 361, expected: 4500, description: '6 menit 1 detik (7 menit)' },
    { seconds: 420, expected: 4500, description: '7 menit tepat' },
    { seconds: 421, expected: 5000, description: '7 menit 1 detik (8 menit, capped)' },
    { seconds: 600, expected: 5000, description: '10 menit (capped)' }
  ];
  
  console.log('=== Testing Pricing Logic ===');
  
  let allPassed = true;
  
  for (const testCase of testCases) {
    const result = calculatePrice(testCase.seconds, 'basic');
    const passed = result === testCase.expected;
    
    console.log(`${passed ? '✅' : '❌'} ${testCase.description}`);
    console.log(`  Durasi: ${testCase.seconds}s (${Math.ceil(testCase.seconds/60)}m)`);
    console.log(`  Expected: Rp ${testCase.expected}`);
    console.log(`  Got: Rp ${result}`);
    console.log(`  Formatted: ${formatPrice(result)}`);
    
    if (!passed) {
      allPassed = false;
    }
    
    console.log('');
  }
  
  // Test pricing breakdown
  console.log('\n=== Testing Pricing Breakdown ===');
  const breakdown = getPricingBreakdown(180); // 3 menit
  console.log('3 menit breakdown:', JSON.stringify(breakdown, null, 2));
  
  return allPassed;
}

// Export untuk testing
if (process.argv[1] && process.argv[1].includes('pricingService.js')) {
  testPricingLogic();
}