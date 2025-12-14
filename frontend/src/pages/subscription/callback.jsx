/* eslint-disable react/react-in-jsx-scope */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function SubscriptionCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { updateUser } = useAuth();
    const [verifying, setVerifying] = useState(true);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const [subscriptionDetails, setSubscriptionDetails] = useState(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    useEffect(() => {
        const verifyPayment = async () => {
            const reference = searchParams.get('reference');
            if (!reference) {
                setError('Missing payment reference');
                setVerifying(false);
                return;
            }

            try {
                const token = localStorage.getItem('authToken');
                const response = await fetch(`${API_URL}/api/paystack/verify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ reference })
                });

                const data = await response.json();
                if (data.success) {
                    setSuccess(true);
                    setSubscriptionDetails(data.data.subscription);
                    
                    // Update user context to reflect new subscription
                    await updateUser({
                        subscription: {
                            plan: data.data.subscription.plan,
                            status: data.data.subscription.status,
                            renewalDate: data.data.subscription.renewalDate
                        }
                    });
                } else {
                    setError(data.error || 'Payment verification failed');
                }
            } catch (err) {
                console.error('Verification error:', err);
                setError('Failed to verify payment. Please contact support if payment was deducted.');
            } finally {
                setVerifying(false);
            }
        };

        verifyPayment();
    }, [searchParams, API_URL, updateUser]);

    if (verifying) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl border shadow-lg p-8 max-w-md w-full text-center">
                    <Loader2 className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Verifying Payment...</h2>
                    <p className="text-sm text-gray-600">Please wait while we confirm your subscription.</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl border shadow-lg p-8 max-w-md w-full text-center">
                    <div className="bg-green-100 rounded-full p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <CheckCircle className="h-10 w-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
                    <p className="text-sm text-gray-600 mb-6">Your subscription has been activated.</p>
                    
                    {subscriptionDetails && (
                        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
                            <div className="text-sm space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Plan:</span>
                                    <span className="font-medium text-gray-900 capitalize">{subscriptionDetails.plan}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Amount:</span>
                                    <span className="font-medium text-gray-900">{subscriptionDetails.currency} {subscriptionDetails.amount.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Renewal Date:</span>
                                    <span className="font-medium text-gray-900">{new Date(subscriptionDetails.renewalDate).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    <div className="flex flex-col gap-3">
                        <Button onClick={() => navigate('/dashboard')} className="w-full">
                            Go to Dashboard
                        </Button>
                        <Button onClick={() => navigate('/settings')} variant="outline" className="w-full">
                            View Settings
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl border shadow-lg p-8 max-w-md w-full text-center">
                <div className="bg-red-100 rounded-full p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <XCircle className="h-10 w-10 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h2>
                <p className="text-sm text-red-600 mb-6">{error}</p>
                
                <div className="flex flex-col gap-3">
                    <Button onClick={() => navigate('/settings')} className="w-full">
                        Try Again
                    </Button>
                    <Button onClick={() => navigate('/dashboard')} variant="outline" className="w-full">
                        Go to Dashboard
                    </Button>
                </div>
            </div>
        </div>
    );
}
