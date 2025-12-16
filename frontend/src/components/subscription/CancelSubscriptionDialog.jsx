import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button';

export default function CancelSubscriptionDialog({ open, onOpenChange, user, onConfirm, loading }) {
  const renewalDate = user?.subscription?.renewalDate ? new Date(user.subscription.renewalDate) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            Your subscription will be canceled at the end of your current billing period. You'll retain full access until then.
          </DialogDescription>
        </DialogHeader>

        {renewalDate && (
          <div className="my-2 p-3 rounded bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
            Your subscription will remain active until <strong>{renewalDate.toLocaleDateString()}</strong>, then automatically cancel.
          </div>
        )}

        <div className="flex gap-3 justify-end mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Keep subscription
          </Button>
          <Button variant="destructive" onClick={() => onConfirm({ immediate: false })} disabled={loading}>
            {loading ? 'Processing...' : 'Cancel subscription'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
