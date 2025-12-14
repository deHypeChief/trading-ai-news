# Paystack Subscription Implementation

## Overview
Complete Paystack integration for Nigeria-only subscription payments with Monthly and Yearly plans.

## Pricing Structure
- **Monthly Plan**: $1/month (₦1,600)
  - Features: AI-powered calendar, Smart alerts, Position calculator, Crypto payments
  
- **Yearly Plan**: $7/year (₦11,200) - Save 42%
  - Same features as Monthly plan

## Backend Components

### 1. Payment Configuration (`backend/src/config/payments.ts`)
- Defines plan structure with USD and NGN (kobo) amounts
- Exchange rate: NGN_PER_USD = 1600
- Currency: NGN (Nigeria)
- Features list for each plan

### 2. Paystack Service (`backend/src/services/paystack.ts`)
- `initializeTransaction()`: Start payment flow, returns authorization URL
- `verifyTransaction()`: Verify payment after completion
- `validateWebhookSignature()`: Validate Paystack webhook events
- `generateReference()`: Create unique transaction references (TX-{timestamp}-{random})

### 3. Payment Routes (`backend/src/routes/payments.ts`)
- **GET /api/payments/plans**: Return available plans with pricing
- **POST /api/paystack/init**: Initialize payment (returns Paystack authorization URL)
- **POST /api/paystack/verify**: Verify payment after callback
- **POST /api/paystack/webhook**: Handle Paystack webhook events (charge.success)

## Frontend Components

### 1. Settings Page (`frontend/src/pages/settings/index.jsx`)
- Subscription cards showing USD and NGN pricing
- "Start Free Trial" buttons linked to Paystack checkout
- Dynamic plan loading from backend API
- Auto-updates currency symbol based on backend config

### 2. Subscription Callback (`frontend/src/pages/subscription/callback.jsx`)
- Handles return from Paystack payment page
- Verifies payment with backend
- Updates user subscription status in context
- Shows success/failure UI with subscription details

## Payment Flow

1. **User clicks "Start Free Trial" on Settings page**
   - Frontend calls `POST /api/paystack/init` with userId, planId, email, callbackUrl
   - Backend generates unique reference and calls Paystack API
   - Returns authorization_url

2. **User redirected to Paystack payment page**
   - Completes payment on Paystack hosted page
   - Paystack redirects back to `${FRONTEND_URL}/subscription/callback?reference=...`

3. **Payment verification on callback page**
   - Frontend calls `POST /api/paystack/verify` with reference
   - Backend calls Paystack verify API
   - If successful, creates/updates Subscription record and User.subscription
   - Returns subscription details to frontend

4. **Webhook handling (for reliability)**
   - Paystack sends webhook to `POST /api/paystack/webhook`
   - Backend validates signature using HMAC SHA512
   - On `charge.success` event, updates subscription (idempotent)

## Database Models

### User.subscription
```typescript
{
  plan: 'free' | 'monthly' | 'yearly',
  status: 'active' | 'inactive' | 'cancelled',
  renewalDate: Date,
  paymentMethod: 'paystack'
}
```

### Subscription Collection
```typescript
{
  userId: string,
  plan: 'monthly' | 'yearly',
  status: 'active' | 'inactive' | 'cancelled',
  paymentProvider: 'paystack',
  transactionId: string,
  amount: number (in NGN),
  currency: 'NGN',
  renewalDate: Date
}
```

## Environment Variables Required

```bash
PAYSTACK_SECRET_KEY=sk_test_xxxxx  # Get from Paystack dashboard
FRONTEND_URL=http://localhost:3000 # For CORS
```

## Security Features

1. **Webhook Signature Validation**: HMAC SHA512 verification of Paystack events
2. **JWT Authentication**: All payment routes require valid JWT token
3. **Idempotent Updates**: Webhook handler safely handles duplicate events
4. **Reference Generation**: Unique transaction references prevent conflicts

## Testing Checklist

- [ ] Set PAYSTACK_SECRET_KEY in backend `.env`
- [ ] Test plan fetching: Visit settings page, verify plans load
- [ ] Test payment initialization: Click "Start Free Trial", verify redirect to Paystack
- [ ] Test payment completion: Complete test payment on Paystack
- [ ] Test callback handling: Verify redirect to callback page with success UI
- [ ] Test subscription update: Check User.subscription and Subscription collection
- [ ] Test webhook: Use Paystack webhook tester in dashboard

## Paystack Dashboard Setup

1. Sign up at https://paystack.com
2. Get API keys from Settings > API Keys & Webhooks
3. Set webhook URL: `https://yourdomain.com/api/paystack/webhook`
4. Use test keys (sk_test_...) for development
5. Switch to live keys (sk_live_...) for production

## Next Steps (Optional Enhancements)

- [ ] Add subscription cancellation endpoint
- [ ] Implement automatic renewal handling via Paystack recurring payments
- [ ] Add proration for plan upgrades/downgrades
- [ ] Display current subscription status on dashboard
- [ ] Email notifications for successful payments
- [ ] Transaction history page
- [ ] Refund handling
