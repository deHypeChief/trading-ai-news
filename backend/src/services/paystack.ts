/**
 * Paystack API integration for Nigeria-only payments
 * Handles transaction initialization, verification, and webhook validation
 */

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

interface InitTransactionParams {
  email: string;
  amount: number; // in kobo (NGN * 100)
  currency: string;
  reference: string;
  metadata?: Record<string, any>;
  callback_url?: string;
}

interface InitTransactionResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface VerifyTransactionResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    reference: string;
    amount: number;
    currency: string;
    status: 'success' | 'failed' | 'abandoned';
    paid_at: string;
    customer: {
      email: string;
    };
    metadata?: Record<string, any>;
  };
}

export class PaystackService {
  private headers = {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };

  /**
   * Initialize a new transaction
   * Returns authorization URL for user to complete payment
   */
  async initializeTransaction(
    params: InitTransactionParams
  ): Promise<InitTransactionResponse> {
    try {
      const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(params),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to initialize transaction');
      }

      return data;
    } catch (error) {
      console.error('Paystack init error:', error);
      throw error;
    }
  }

  /**
   * Verify a transaction using the reference
   * Call this after user returns from payment page or in webhook
   */
  async verifyTransaction(reference: string): Promise<VerifyTransactionResponse> {
    try {
      const response = await fetch(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        {
          method: 'GET',
          headers: this.headers,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to verify transaction');
      }

      return data;
    } catch (error) {
      console.error('Paystack verify error:', error);
      throw error;
    }
  }

  /**
   * Validate webhook signature from Paystack
   * Returns true if signature is valid
   */
  validateWebhookSignature(body: string, signature: string): boolean {
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(body)
      .digest('hex');
    return hash === signature;
  }

  /**
   * Generate a unique transaction reference
   * Format: TX-{timestamp}-{random}
   */
  generateReference(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `TX-${timestamp}-${random}`.toUpperCase();
  }
}

export const paystackService = new PaystackService();
