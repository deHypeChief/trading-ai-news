/**
 * Payment plans and currency configuration
 * Nigeria-only: all charges in NGN via Paystack
 */

export const NGN_PER_USD = 1600;

export const PLANS = {
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    usd: 1,
    ngn: 1600, // 1 USD * 1600
    ngnKobo: 160000, // Paystack expects amount in kobo (100 kobo = 1 NGN)
    period: 'month',
    features: [
      'AI-powered calendar',
      'Smart alerts',
      'Position calculator',
      'Crypto payments',
    ],
  },
  yearly: {
    id: 'yearly',
    name: 'Yearly',
    usd: 7,
    ngn: 11200, // 7 USD * 1600
    ngnKobo: 1120000, // Paystack expects amount in kobo
    period: 'year',
    features: [
      'AI-powered calendar',
      'Smart alerts',
      'Position calculator',
      'Crypto payments',
    ],
    savings: '42%',
  },
};

export const CURRENCY = {
  code: 'NGN',
  symbol: '₦',
  country: 'Nigeria',
};
