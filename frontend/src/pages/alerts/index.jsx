import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Bell, Save, AlertCircle, Clock, Mail, Calendar as CalendarIcon, LogOut } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function AlertsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Alert settings
  const [enabled, setEnabled] = useState(true);
  const [currencies, setCurrencies] = useState([]);
  const [minImpact, setMinImpact] = useState('Medium');
  const [minRelevanceScore, setMinRelevanceScore] = useState(50);
  const [notifyBefore, setNotifyBefore] = useState([30, 60]);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [emailNotifications, setEmailNotifications] = useState(true);

  const availableCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
  const timingOptions = [
    { value: 15, label: '15 minutes before' },
    { value: 30, label: '30 minutes before' },
    { value: 60, label: '1 hour before' },
    { value: 120, label: '2 hours before' },
  ];

  useEffect(() => {
    if (user?._id) {
      loadAlertSettings();
    }
  }, [user]);

  const loadAlertSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/alerts/user/${user._id}`);
      const data = await response.json();

      if (data.success && data.data) {
        const alert = data.data;
        setEnabled(alert.enabled);
        setCurrencies(alert.currencies || []);
        setMinImpact(alert.minImpact);
        setMinRelevanceScore(alert.minRelevanceScore || 50);
        setNotifyBefore(alert.notifyBefore || [30, 60]);
        setQuietHoursEnabled(alert.quietHoursEnabled);
        setQuietHoursStart(alert.quietHoursStart || '22:00');
        setQuietHoursEnd(alert.quietHoursEnd || '08:00');
        setEmailNotifications(alert.emailNotifications);
      }
    } catch (err) {
      console.error('Failed to load alert settings:', err);
      setError('Failed to load alert settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${API_URL}/api/alerts/user/${user._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled,
          currencies,
          minImpact,
          minRelevanceScore,
          notifyBefore,
          quietHoursEnabled,
          quietHoursStart,
          quietHoursEnd,
          emailNotifications,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Alert settings saved successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.message || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Failed to save alert settings:', err);
      setError('Failed to save alert settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleCurrency = (currency) => {
    setCurrencies(prev =>
      prev.includes(currency)
        ? prev.filter(c => c !== currency)
        : [...prev, currency]
    );
  };

  const toggleNotifyBefore = (minutes) => {
    setNotifyBefore(prev =>
      prev.includes(minutes)
        ? prev.filter(m => m !== minutes)
        : [...prev, minutes]
    );
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Bell className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold">Alert Settings</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/calendar')}>
              <CalendarIcon className="w-4 h-4 mr-2" />
              Calendar
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Status Messages */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <Bell className="w-5 h-5 text-green-600 mt-0.5" />
            <p className="text-green-700">{success}</p>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600 mt-4">Loading settings...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Master Toggle */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold mb-1">Enable Alerts</h2>
                  <p className="text-sm text-gray-600">
                    Receive notifications for upcoming economic events
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            {/* Currency Filters */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-bold mb-4">Currency Filters</h3>
              <p className="text-sm text-gray-600 mb-4">
                Select currencies you want to receive alerts for. Leave empty to receive alerts for all currencies.
              </p>
              <div className="grid grid-cols-4 gap-3">
                {availableCurrencies.map((currency) => (
                  <button
                    key={currency}
                    onClick={() => toggleCurrency(currency)}
                    className={`px-4 py-3 rounded-lg border-2 font-medium transition-colors ${
                      currencies.includes(currency)
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {currency}
                  </button>
                ))}
              </div>
            </div>

            {/* Impact Level */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-bold mb-4">Minimum Impact Level</h3>
              <p className="text-sm text-gray-600 mb-4">
                Only receive alerts for events with this impact level or higher
              </p>
              <div className="grid grid-cols-3 gap-3">
                {['Low', 'Medium', 'High'].map((impact) => (
                  <button
                    key={impact}
                    onClick={() => setMinImpact(impact)}
                    className={`px-4 py-3 rounded-lg border-2 font-medium transition-colors ${
                      minImpact === impact
                        ? impact === 'High'
                          ? 'bg-red-50 border-red-500 text-red-700'
                          : impact === 'Medium'
                          ? 'bg-orange-50 border-orange-500 text-orange-700'
                          : 'bg-green-50 border-green-500 text-green-700'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {impact}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Relevance Score */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-bold mb-4">Minimum AI Relevance Score</h3>
              <p className="text-sm text-gray-600 mb-4">
                Current: {minRelevanceScore}/100
              </p>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={minRelevanceScore}
                onChange={(e) => setMinRelevanceScore(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>0 (All events)</span>
                <span>50</span>
                <span>100 (Only critical)</span>
              </div>
            </div>

            {/* Notification Timing */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Notification Timing
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                When should we notify you before an event?
              </p>
              <div className="space-y-2">
                {timingOptions.map((option) => (
                  <label key={option.value} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyBefore.includes(option.value)}
                      onChange={() => toggleNotifyBefore(option.value)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-gray-700">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Quiet Hours */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    Quiet Hours
                  </h3>
                  <p className="text-sm text-gray-600">
                    Pause notifications during specific hours
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quietHoursEnabled}
                    onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={quietHoursStart}
                      onChange={(e) => setQuietHoursStart(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={quietHoursEnd}
                      onChange={(e) => setQuietHoursEnd(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Notification Channels */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-bold mb-4">Notification Channels</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <Mail className="w-5 h-5 text-gray-600" />
                  <div>
                    <p className="font-medium text-gray-900">Email Notifications</p>
                    <p className="text-xs text-gray-500">Receive alerts via email</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex gap-4">
              <Button
                onClick={saveSettings}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/dashboard')}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
