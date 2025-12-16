import { Elysia } from 'elysia';
import { User } from '../models/User';
import { ApiError } from '../utils/errors';

export const subscriptionMiddleware = new Elysia({ name: 'subscription' })
  .derive(async ({ jwt, bearer, set }) => {
    if (!bearer) {
      set.status = 401;
      throw new Error('Unauthorized - No token');
    }

    const payload = await jwt.verify(bearer);

    if (!payload || !payload.userId) {
      set.status = 401;
      throw new Error('Unauthorized - Invalid token');
    }

    const user = await User.findById(payload.userId);
    if (!user) {
      set.status = 401;
      throw new Error('User not found');
    }

    const sub = (user as any).subscription || {};

    // Active subscription passes
    if (sub.status === 'active') {
      return { user, subscription: sub };
    }

    // Active trial passes
    if (sub.status === 'trial' && sub.trialEndsAt && new Date() < new Date(sub.trialEndsAt)) {
      return { user, subscription: sub };
    }

    // If trial expired, mark inactive for bookkeeping
    if (sub.status === 'trial' && (!sub.trialEndsAt || new Date() >= new Date(sub.trialEndsAt))) {
      (user as any).subscription.status = 'inactive';
      await user.save();
    }

    set.status = 403;
    throw new Error('Trial expired - please upgrade to continue using this feature.');
  });