import { Elysia, t } from 'elysia';
import { PLANS, NGN_PER_USD, CURRENCY } from '../config/payments';
import { PaystackService } from '../services/paystack';
import { User } from '../models/User';
import { Subscription } from '../models/Subscription';

const paystackService = new PaystackService();

export const paymentsRouter = new Elysia({ prefix: '/api' })
  // Get available payment plans
  .get('/payments/plans', async () => {
    return {
      success: true,
      data: {
        plans: PLANS,
        fxRate: NGN_PER_USD,
        currency: CURRENCY
      }
    };
  })

  // Initialize payment with Paystack
  .post(
    '/paystack/init',
    async ({ body, set }) => {
      try {
        const { userId, planId, email, callbackUrl } = body;

        // Validate plan
        const plan = PLANS[planId as keyof typeof PLANS];
        if (!plan) {
          set.status = 400;
          return { success: false, error: 'Invalid plan selected' };
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
          set.status = 404;
          return { success: false, error: 'User not found' };
        }

        // Generate unique reference
        const reference = paystackService.generateReference();

        // Initialize transaction with Paystack
        const result = await paystackService.initializeTransaction({
          email,
          amount: plan.ngnKobo,
          currency: CURRENCY.code,
          reference,
          metadata: {
            userId,
            planId,
            planName: plan.name,
            usdAmount: plan.usd
          },
          callback_url: callbackUrl
        });

        return {
          success: true,
          data: {
            authorization_url: result.data.authorization_url,
            access_code: result.data.access_code,
            reference: result.data.reference
          }
        };
      } catch (error: any) {
        console.error('Payment initialization error:', error);
        set.status = 500;
        return { 
          success: false, 
          error: error.message || 'Failed to initialize payment' 
        };
      }
    },
    {
      body: t.Object({
        userId: t.String(),
        planId: t.String(),
        email: t.String(),
        callbackUrl: t.String()
      })
    }
  )

  // Verify payment after callback
  .post(
    '/paystack/verify',
    async ({ body, set }) => {
      try {
        const { reference } = body;

        // Verify transaction with Paystack
        const result = await paystackService.verifyTransaction(reference);

        if (result.data.status !== 'success') {
          set.status = 400;
          return { 
            success: false, 
            error: 'Payment verification failed',
            status: result.data.status
          };
        }

        const metadata = result.data.metadata || {};
        const userId = metadata.userId;
        const planId = metadata.planId;

        // Calculate renewal date based on plan
        const renewalDate = new Date();
        if (planId === 'monthly') {
          renewalDate.setMonth(renewalDate.getMonth() + 1);
        } else if (planId === 'yearly') {
          renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        }

        // Update or create subscription
        const subscription = await Subscription.findOneAndUpdate(
          { userId },
          {
            userId,
            plan: planId,
            status: 'active',
            paymentProvider: 'paystack',
            transactionId: result.data.id.toString(),
            amount: result.data.amount / 100, // Convert from kobo to NGN
            currency: CURRENCY.code,
            renewalDate
          },
          { upsert: true, new: true }
        );

        // Update user subscription status
        await User.findByIdAndUpdate(userId, {
          'subscription.plan': planId,
          'subscription.status': 'active',
          'subscription.renewalDate': renewalDate,
          'subscription.paymentMethod': 'paystack'
        });

        return {
          success: true,
          data: {
            subscription: {
              plan: planId,
              status: 'active',
              renewalDate,
              amount: result.data.amount / 100,
              currency: CURRENCY.code
            }
          }
        };
      } catch (error: any) {
        console.error('Payment verification error:', error);
        set.status = 500;
        return { 
          success: false, 
          error: error.message || 'Failed to verify payment' 
        };
      }
    },
    {
      body: t.Object({
        reference: t.String()
      })
    }
  )

  // Webhook handler for Paystack events
  .post(
    '/paystack/webhook',
    async ({ body, headers, set }: { body: any, headers: any, set: any }) => {
      try {
        // Get Paystack signature from headers
        const signature = headers['x-paystack-signature'];
        if (!signature) {
          set.status = 401;
          return { success: false, error: 'Missing signature' };
        }

        // Validate webhook signature
        const isValid = paystackService.validateWebhookSignature(
          JSON.stringify(body),
          signature
        );

        if (!isValid) {
          set.status = 401;
          return { success: false, error: 'Invalid signature' };
        }

        // Handle charge.success event
        if (body.event === 'charge.success') {
          const data = body.data;
          const metadata = data.metadata;
          const userId = metadata.userId;
          const planId = metadata.planId;

          // Calculate renewal date
          const renewalDate = new Date();
          if (planId === 'monthly') {
            renewalDate.setMonth(renewalDate.getMonth() + 1);
          } else if (planId === 'yearly') {
            renewalDate.setFullYear(renewalDate.getFullYear() + 1);
          }

          // Update or create subscription (idempotent)
          await Subscription.findOneAndUpdate(
            { userId },
            {
              userId,
              plan: planId,
              status: 'active',
              paymentProvider: 'paystack',
              transactionId: data.id.toString(),
              amount: data.amount / 100,
              currency: CURRENCY.code,
              renewalDate
            },
            { upsert: true }
          );

          // Update user subscription status (idempotent)
          await User.findByIdAndUpdate(userId, {
            'subscription.plan': planId,
            'subscription.status': 'active',
            'subscription.renewalDate': renewalDate,
            'subscription.paymentMethod': 'paystack'
          });
        }

        return { success: true };
      } catch (error: any) {
        console.error('Webhook processing error:', error);
        set.status = 500;
        return { 
          success: false, 
          error: error.message || 'Failed to process webhook' 
        };
      }
    }
  );
