import React, { useMemo } from 'react';

export default function SubscriptionBadge({ user }) {
  const sub = user?.subscription || null;

  const TRIAL_DAYS = 3;
  const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

  const { label, className, tooltip } = useMemo(() => {
    console.log('SubscriptionBadge compute', { sub, user });
    if (!sub) {
      // No subscription object; check if user was created within trial window and infer trial
      const created = user?.createdAt ? new Date(user.createdAt) : null;
      if (created && !isNaN(created.getTime())) {
        const ends = new Date(created.getTime() + TRIAL_MS);
        if (Date.now() < ends.getTime()) {
          const msLeft = ends.getTime() - Date.now();
          const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
          const daysLabel = daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? '1 day left' : 'Ends today';
          return {
            label: `Trial · ${daysLabel}`,
            className: 'bg-orange-100 text-orange-800 border border-orange-200',
            tooltip: `Trial ends on ${ends.toLocaleDateString()} (${daysLabel})`,
          };
        }
      }

      return {
        label: 'Free',
        className: 'bg-gray-100 text-gray-800 border border-gray-200',
        tooltip: 'You are on the free plan',
      };
    }

    // If trial has ended, show explicit 'Trial Ended'
    if (sub.status === 'inactive' && sub.plan === 'free' && sub.trialEndsAt) {
      const endedAt = new Date(sub.trialEndsAt);
      if (!isNaN(endedAt.getTime())) {
        return {
          label: 'Trial Ended',
          className: 'bg-red-100 text-red-800 border border-red-200',
          tooltip: `Your trial ended on ${endedAt.toLocaleDateString()}`,
        };
      }
    }

    // If the user is explicitly on the free plan but has a renewal/cancellation date, show expiry info
    if (sub.plan === 'free' && (sub.renewalDate || sub.cancellationDate)) {
      const ends = sub.renewalDate ? new Date(sub.renewalDate) : new Date(sub.cancellationDate);
      if (!isNaN(ends.getTime())) {
        const msLeft = ends.getTime() - Date.now();
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
        const daysLabel = daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? '1 day left' : 'Ends today';
        return {
          label: `Free · ${daysLabel}`,
          className: 'bg-gray-100 text-gray-800 border border-gray-200',
          tooltip: `Free until ${ends.toLocaleDateString()} (${daysLabel})`,
        };
      }
    }

    if (sub.status === 'active') {
      const planLabel = sub.plan ? String(sub.plan).charAt(0).toUpperCase() + String(sub.plan).slice(1) : 'Paid';
      
      // Check if scheduled for cancellation
      if (sub.cancelAtPeriodEnd && sub.cancellationDate) {
        const cancelDate = new Date(sub.cancellationDate);
        return {
          label: `${planLabel} · Canceling`,
          className: 'bg-orange-100 text-orange-800 border border-orange-200',
          tooltip: `Subscription cancels on ${cancelDate.toLocaleDateString()}`,
        };
      }
      
      return {
        label: planLabel,
        className: 'bg-green-100 text-green-800 border border-green-200',
        tooltip: `Active subscription (${planLabel})`,
      };
    }

    // Determine trial end date: prefer explicit trialEndsAt, otherwise infer from user.createdAt
    const explicitEnds = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    let inferredEnds = null;
    // Prefer subscription-specific createdAt, then fallback to user.createdAt
    const createdCandidate = sub.createdAt || sub.userCreatedAt || user?.createdAt;
    if (!explicitEnds && createdCandidate) {
      try {
        const createdDate = new Date(createdCandidate);
        if (!isNaN(createdDate.getTime())) {
          inferredEnds = new Date(createdDate.getTime() + TRIAL_MS);
        }
      } catch (e) {
        inferredEnds = null;
      }
    }

    const ends = explicitEnds || inferredEnds;

    if (sub.status === 'trial') {
      if (ends) {
        const msLeft = ends.getTime() - Date.now();
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
        const daysLabel = daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? '1 day left' : 'Ends today';
        return {
          label: `Trial · ${daysLabel}`,
          className: 'bg-orange-100 text-orange-800 border border-orange-200',
          tooltip: `Trial ends on ${ends.toLocaleDateString()} (${daysLabel})`,
        };
      }

      return {
        label: 'Trial',
        className: 'bg-orange-100 text-orange-800 border border-orange-200',
        tooltip: 'On trial',
      };
    }

    // If not explicitly marked as trial but we can infer an active trial window, show it
    if (ends && Date.now() < ends.getTime()) {
      const msLeft = ends.getTime() - Date.now();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      const daysLabel = daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? '1 day left' : 'Ends today';
      return {
        label: `Trial · ${daysLabel}`,
        className: 'bg-orange-100 text-orange-800 border border-orange-200',
        tooltip: `Trial ends on ${ends.toLocaleDateString()} (${daysLabel})`,
      };
    }

    return {
      label: 'Free',
      className: 'bg-gray-100 text-gray-800 border border-gray-200',
      tooltip: 'You are on the free plan',
    };
  }, [sub, user?.createdAt]);

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${className}`} title={tooltip}>
      <span>{label}</span>
    </div>
  );
}
