/* eslint-disable react/react-in-jsx-scope */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { LogOut, User, Settings, Menu, X, Clock3, Globe, Lock } from 'lucide-react';

const TIMEZONES = [
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET)' },
    { value: 'Africa/Lagos', label: 'West Africa Time (WAT)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
    { value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
    { value: 'UTC', label: 'UTC' },
];



export default function SettingsPage() {
    const { user, logout, updateUser } = useAuth();
    const navigate = useNavigate();

    const fallbackTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [username, setUsername] = useState(user?.username || '');
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMessage, setProfileMessage] = useState('');
    const [profileError, setProfileError] = useState('');

    // Subscription state
    const [plans, setPlans] = useState(null);

    const [currency, setCurrency] = useState({ code: 'NGN', symbol: '₦' });
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [initiatingPayment, setInitiatingPayment] = useState(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordMessage, setPasswordMessage] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [savingPassword, setSavingPassword] = useState(false);
    const [displayTimezone, setDisplayTimezone] = useState(user?.timezone || fallbackTz);
    const [savingTimezone, setSavingTimezone] = useState(false);
    const [timezoneError, setTimezoneError] = useState('');
    const [timezoneSuccess, setTimezoneSuccess] = useState('');

    const [menuOpen, setMenuOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [now, setNow] = useState(new Date());

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        setDisplayTimezone(user?.timezone || fallbackTz);
        setUsername(user?.username || '');
    }, [user, fallbackTz]);

    // Fetch payment plans from backend
    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const response = await fetch(`${API_URL}/api/payments/plans`);
                const data = await response.json();
                if (data.success) {
                    setPlans(data.data.plans);
                    setCurrency(data.data.currency);
                }
            } catch (error) {
                console.error('Failed to fetch plans:', error);
            } finally {
                setLoadingPlans(false);
            }
        };
        fetchPlans();
    }, [API_URL]);

    const timeString = useMemo(() => {
        try {
            return new Intl.DateTimeFormat('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: displayTimezone,
                hour12: true,
            }).format(now);
        } catch {
            try {
                return new Intl.DateTimeFormat('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: fallbackTz,
                    hour12: true,
                }).format(now);
            } catch {
                return '—';
            }
        }
    }, [now, displayTimezone, fallbackTz]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };
    const handleSubscribe = async (planId) => {
        if (!user?.email) {
            alert('Email is required for payment');
            return;
        }

        setInitiatingPayment(planId);
        try {
            const token = localStorage.getItem('authToken');
            const callbackUrl = `${window.location.origin}/subscription/callback`;

            const response = await fetch(`${API_URL}/api/paystack/init`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    userId: user._id,
                    planId,
                    email: user.email,
                    callbackUrl
                })
            });

            const data = await response.json();
            if (data.success) {
                window.location.href = data.data.authorization_url;
            } else {
                alert(data.error || 'Failed to initiate payment');
            }
        } catch (error) {
            console.error('Payment initialization error:', error);
            alert('Failed to initiate payment. Please try again.');
        } finally {
            setInitiatingPayment(null);
        }
    };
    const handleProfileSave = async () => {
        if (!user) return;
        setProfileError('');
        setProfileMessage('');
        setSavingProfile(true);
        try {
            const response = await fetch(`${API_URL}/api/users/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({ username: username.trim() }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Failed to update profile');
            }
            updateUser(data.user || { username: username.trim() });
            setProfileMessage('Profile updated');
        } catch (err) {
            setProfileError(err.message || 'Failed to update profile');
        } finally {
            setSavingProfile(false);
            setTimeout(() => setProfileMessage(''), 2000);
        }
    };

    const handlePasswordChange = async () => {
        if (!user) return;
        setPasswordError('');
        setPasswordMessage('');
        if (!currentPassword || !newPassword) {
            setPasswordError('Current and new password are required');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match');
            return;
        }
        setSavingPassword(true);
        try {
            const response = await fetch(`${API_URL}/api/users/${user.id}/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Failed to change password');
            }
            setPasswordMessage('Password updated');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            setPasswordError(err.message || 'Failed to change password');
        } finally {
            setSavingPassword(false);
            setTimeout(() => setPasswordMessage(''), 2000);
        }
    };

    const handleTimezoneChange = async (tz) => {
        if (!user) return;
        setTimezoneError('');
        setTimezoneSuccess('');
        setSavingTimezone(true);
        const previous = displayTimezone;
        setDisplayTimezone(tz);
        try {
            const response = await fetch(`${API_URL}/api/users/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('authToken')}`,
                },
                body: JSON.stringify({ timezone: tz }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Failed to update timezone');
            }
            updateUser(data.user || { timezone: tz });
            setTimezoneSuccess('Timezone synchronized');
        } catch (err) {
            setDisplayTimezone(previous);
            setTimezoneError(err.message || 'Failed to update timezone');
        } finally {
            setSavingTimezone(false);
            setTimeout(() => setTimezoneSuccess(''), 2000);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50" style={{ zoom: '90%' }}>
            {/* Navigation (kept consistent with dashboard) */}
            <nav className="bg-white border-b fixed top-0 left-0 right-0 z-50">
                <div className="mx-auto px-4 sm:px-6 lg:px-20">
                    <div className="flex justify-between items-center h-16">
                        <Link to="/dashboard" className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                                <img src="/smlogo.png" alt="" className='h-10 w-10' />

                                <span className="text-lg sm:text-xl font-bold">SMC</span>
                            </div>
                        </Link>
                        <div className="flex items-center gap-3">
                            {/* <button onClick={() => setMenuOpen(!menuOpen)} className="sm:hidden p-2 rounded hover:bg-gray-100">
                                <Menu className="h-6 w-6" />
                            </button> */}
                            <div className="sm:flex items-center gap-3">
                                <div className="relative">
                                    <button
                                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                                        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                                        aria-label="User settings"
                                    >
                                        <User className="h-5 w-5 text-gray-700" />
                                    </button>
                                    {userMenuOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border z-20 py-1">
                                                <div className="px-4 py-2 border-b">
                                                    <p className="text-sm font-medium text-gray-900">{user?.username || 'User'}</p>
                                                    <p className="text-xs text-gray-500">{user?.email || ''}</p>
                                                </div>
                                                <button
                                                    onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <Settings className="h-4 w-4" />
                                                    Settings
                                                </button>
                                                <button
                                                    onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                                                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <LogOut className="h-4 w-4" />
                                                    Logout
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu Overlay */}
                {menuOpen && (
                    <div className="sm:hidden fixed inset-0 bg-black/30 z-40" onClick={() => setMenuOpen(false)}>
                        <div className="absolute top-16 right-4 bg-white border shadow-lg p-4 rounded z-50 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setMenuOpen(false)} className="self-end">
                                <X className="h-5 w-5" />
                            </button>
                            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm font-medium">
                                <Clock3 className="h-4 w-4" />
                                <span>{timeString}</span>
                            </div>
                            <span className="text-gray-700 text-sm px-3">{user?.username || 'User'}</span>
                            <Button variant="ghost" size="sm" onClick={handleLogout} className="w-full justify-start">
                                <LogOut className="h-4 w-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    </div>
                )}
            </nav>

            {/* Main */}
            <div className="px-4 sm:px-6 lg:px-20">
                <div className="bg-white border-b fixed top-16 left-0 right-0 z-40">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-6 lg:px-20 py-2 gap-2 sm:gap-0">
                        <div className="flex items-center gap-2 text-sm text-gray-700">
                            <Clock3 className="h-4 w-4 text-gray-600" />
                            <span className="font-medium">{timeString}</span>
                            <span className="text-xs text-gray-500">{displayTimezone}</span>
                        </div>
                        <div className="text-xs text-gray-500">Timezone is synced to your account</div>
                    </div>
                </div>

                <div className="pt-32 sm:pt-28 pb-12">
                    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6">
                        <div className="flex items-center gap-3">
                            <Settings className="h-5 w-5 text-blue-600" />
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Settings</h1>
                                <p className="text-xs sm:text-sm text-gray-600">Manage your account preferences.</p>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <User className="h-4 w-4 text-blue-600" />
                                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Profile</h2>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Username</label>
                                    <input
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                                        placeholder="Your username"
                                    />
                                    <p className="text-xs text-gray-500">This name appears in the app.</p>
                                </div>
                                <div>
                                    <Button onClick={handleProfileSave} disabled={savingProfile || !username.trim()} className="w-full sm:w-auto">
                                        {savingProfile ? 'Saving…' : 'Save profile'}
                                    </Button>
                                </div>
                            </div>

                            {profileError && (
                                <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{profileError}</div>
                            )}
                            {profileMessage && !profileError && (
                                <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{profileMessage}</div>
                            )}
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Lock className="h-4 w-4 text-blue-600" />
                                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Password</h2>
                            </div>

                            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Current password</label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">New password</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Confirm new password</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <div className="mt-4 flex justify-end">
                                <Button onClick={handlePasswordChange} disabled={savingPassword}>
                                    {savingPassword ? 'Saving…' : 'Update password'}
                                </Button>
                            </div>

                            {passwordError && (
                                <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{passwordError}</div>
                            )}
                            {passwordMessage && !passwordError && (
                                <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{passwordMessage}</div>
                            )}
                        </div>

                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Globe className="h-4 w-4 text-blue-600" />
                                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Timezone</h2>
                            </div>

                            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Select your timezone</label>
                                    <select
                                        value={displayTimezone}
                                        onChange={(e) => handleTimezoneChange(e.target.value)}
                                        className="w-full rounded-lg border-gray-300 text-sm focus:border-blue-500 focus:ring-blue-500"
                                        disabled={savingTimezone}
                                    >
                                        {TIMEZONES.map((tz) => (
                                            <option key={tz.value} value={tz.value}>{tz.label} — {tz.value}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500">Changing this will synchronize your account and refresh timestamps.</p>
                                </div>

                                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
                                    <div className="flex items-center gap-2 text-gray-800">
                                        <Clock3 className="h-4 w-4" />
                                        <span>Local time preview</span>
                                    </div>
                                    <div className="text-lg font-semibold text-gray-900">{timeString}</div>
                                    <div className="text-xs text-gray-500">{displayTimezone}</div>
                                </div>
                            </div>

                            {timezoneError && (
                                <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{timezoneError}</div>
                            )}
                            {timezoneSuccess && !timezoneError && (
                                <div className="mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{timezoneSuccess}</div>
                            )}
                        </div>

                        {/* Subscription (Nigeria only) */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
                            <div className="flex items-center gap-2 mb-4">
                                <Settings className="h-4 w-4 text-blue-600" />
                                <h2 className="text-base sm:text-lg font-semibold text-gray-900">Subscription</h2>
                            </div>
                            <p className="text-xs text-gray-500 mb-4">Nigeria-only for now. Payments are charged in NGN via Paystack.</p>

                            {loadingPlans ? (
                                <div className="text-sm text-gray-500 text-center py-4">Loading plans...</div>
                            ) : plans ? (
                                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                                    {/* Monthly Plan */}
                                    <div className="rounded-lg border border-gray-200 p-4">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-xl font-bold text-gray-900">$ {plans.monthly.usd}</span>
                                            <span className="text-xs text-gray-500">/ {plans.monthly.period}</span>
                                        </div>
                                        <div className="mt-1 text-sm text-gray-800">{currency.symbol} {plans.monthly.ngn.toLocaleString()}</div>
                                        <ul className="mt-3 text-sm text-gray-700 space-y-1">
                                            {plans.monthly.features.map((feature, idx) => (
                                                <li key={idx}>{feature}</li>
                                            ))}
                                        </ul>
                                        <Button
                                            className="mt-4 w-full"
                                            onClick={() => handleSubscribe('monthly')}
                                            disabled={initiatingPayment === 'monthly'}
                                        >
                                            {initiatingPayment === 'monthly' ? 'Processing...' : 'Start Free Trial'}
                                        </Button>
                                    </div>

                                    {/* Yearly Plan */}
                                    <div className="rounded-lg border border-gray-200 p-4">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-xl font-bold text-gray-900">$ {plans.yearly.usd}</span>
                                            <span className="text-xs text-gray-500">/ {plans.yearly.period}</span>
                                        </div>
                                        <div className="mt-1 text-sm text-gray-800">{currency.symbol} {plans.yearly.ngn.toLocaleString()}</div>
                                        {plans.yearly.savings && (
                                            <div className="mt-1 inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">Save {plans.yearly.savings}</div>
                                        )}
                                        <ul className="mt-3 text-sm text-gray-700 space-y-1">
                                            {plans.yearly.features.map((feature, idx) => (
                                                <li key={idx}>{feature}</li>
                                            ))}
                                        </ul>
                                        <Button
                                            className="mt-4 w-full"
                                            onClick={() => handleSubscribe('yearly')}
                                            disabled={initiatingPayment === 'yearly'}
                                        >
                                            {initiatingPayment === 'yearly' ? 'Processing...' : 'Start Free Trial'}
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-sm text-red-600 text-center py-4">Failed to load plans. Please refresh the page.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
