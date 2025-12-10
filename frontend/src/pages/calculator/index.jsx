import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Calculator, DollarSign, TrendingUp, AlertTriangle, Save, Calendar as CalendarIcon, LogOut } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function CalculatorPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Form inputs
  const [accountSize, setAccountSize] = useState('10000');
  const [riskPercentage, setRiskPercentage] = useState('2');
  const [stopLossPips, setStopLossPips] = useState('50');
  const [instrumentType, setInstrumentType] = useState('forex');
  const [lotType, setLotType] = useState('standard'); // standard, mini, micro
  const [useVolatilityAdjustment, setUseVolatilityAdjustment] = useState(false);
  const [volatilityLevel, setVolatilityLevel] = useState('Medium');

  // Results
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (accountSize && riskPercentage && stopLossPips) {
      calculatePosition();
    }
  }, [accountSize, riskPercentage, stopLossPips, instrumentType, lotType, useVolatilityAdjustment, volatilityLevel]);

  const calculatePosition = () => {
    try {
      const account = parseFloat(accountSize);
      const risk = parseFloat(riskPercentage);
      const stopLoss = parseFloat(stopLossPips);

      if (!account || !risk || !stopLoss) {
        setError('Please fill in all required fields');
        return;
      }

      if (account <= 0 || risk <= 0 || stopLoss <= 0) {
        setError('All values must be positive numbers');
        return;
      }

      if (risk > 10) {
        setError('Risk percentage should not exceed 10% for safe trading');
        return;
      }

      setError('');

      // Calculate risk amount
      let riskAmount = (account * risk) / 100;

      // Apply volatility adjustment
      if (useVolatilityAdjustment) {
        const adjustments = {
          'Low': 1.2, // Can risk 20% more in low volatility
          'Medium': 1.0,
          'High': 0.8, // Risk 20% less in high volatility
          'Extreme': 0.6, // Risk 40% less in extreme volatility
        };
        riskAmount *= adjustments[volatilityLevel] || 1.0;
      }

      // Calculate based on instrument type
      let positionSize, lots, pipValue;

      if (instrumentType === 'forex') {
        // Forex calculation
        const lotSizes = {
          standard: 100000,
          mini: 10000,
          micro: 1000,
        };

        const contractSize = lotSizes[lotType];
        
        // For forex, pip value depends on lot size
        // Standard lot: $10 per pip, Mini: $1, Micro: $0.10
        const basePipValue = lotType === 'standard' ? 10 : lotType === 'mini' ? 1 : 0.1;

        // Calculate lots
        lots = riskAmount / (stopLoss * basePipValue);
        positionSize = lots * contractSize;
        pipValue = basePipValue * lots;

      } else {
        // Index/Stock calculation (simplified)
        pipValue = 1; // $1 per point
        positionSize = riskAmount / stopLoss;
        lots = Math.floor(positionSize / 100); // Assuming 100 units per contract
      }

      // Calculate potential profit/loss scenarios
      const scenarios = [
        { pips: stopLoss, label: 'Stop Loss Hit', amount: -riskAmount },
        { pips: stopLoss * 1.5, label: '1.5:1 R:R', amount: riskAmount * 1.5 },
        { pips: stopLoss * 2, label: '2:1 R:R', amount: riskAmount * 2 },
        { pips: stopLoss * 3, label: '3:1 R:R', amount: riskAmount * 3 },
      ];

      setResults({
        riskAmount: riskAmount.toFixed(2),
        positionSize: positionSize.toFixed(2),
        lots: lots.toFixed(3),
        pipValue: pipValue.toFixed(2),
        accountPercentage: risk,
        adjustedForVolatility: useVolatilityAdjustment,
        volatilityLevel: useVolatilityAdjustment ? volatilityLevel : null,
        scenarios,
      });

    } catch (err) {
      setError('Calculation error. Please check your inputs.');
      console.error(err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getVolatilityColor = (level) => {
    const colors = {
      Low: 'text-green-600',
      Medium: 'text-yellow-600',
      High: 'text-orange-600',
      Extreme: 'text-red-600',
    };
    return colors[level] || 'text-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Calculator className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold">Position Size Calculator</h1>
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

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Form */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-green-600" />
              Trading Parameters
            </h2>

            <div className="space-y-6">
              {/* Account Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Size ($) *
                </label>
                <input
                  type="number"
                  value={accountSize}
                  onChange={(e) => setAccountSize(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10000"
                  min="0"
                  step="100"
                />
                <p className="text-xs text-gray-500 mt-1">Your total trading account balance</p>
              </div>

              {/* Risk Percentage */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Risk Per Trade (%) *
                </label>
                <input
                  type="number"
                  value={riskPercentage}
                  onChange={(e) => setRiskPercentage(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="2"
                  min="0.1"
                  max="10"
                  step="0.1"
                />
                <p className="text-xs text-gray-500 mt-1">Recommended: 1-2% per trade</p>
              </div>

              {/* Stop Loss */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stop Loss (Pips/Points) *
                </label>
                <input
                  type="number"
                  value={stopLossPips}
                  onChange={(e) => setStopLossPips(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="50"
                  min="1"
                />
                <p className="text-xs text-gray-500 mt-1">Distance to your stop loss</p>
              </div>

              {/* Instrument Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Instrument Type
                </label>
                <select
                  value={instrumentType}
                  onChange={(e) => setInstrumentType(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="forex">Forex</option>
                  <option value="index">Index/Stock</option>
                </select>
              </div>

              {/* Lot Type (Forex only) */}
              {instrumentType === 'forex' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lot Type
                  </label>
                  <select
                    value={lotType}
                    onChange={(e) => setLotType(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="standard">Standard Lot (100,000 units)</option>
                    <option value="mini">Mini Lot (10,000 units)</option>
                    <option value="micro">Micro Lot (1,000 units)</option>
                  </select>
                </div>
              )}

              {/* Volatility Adjustment */}
              <div className="border-t pt-4">
                <label className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={useVolatilityAdjustment}
                    onChange={(e) => setUseVolatilityAdjustment(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Adjust for Market Volatility (AI-powered)
                  </span>
                </label>

                {useVolatilityAdjustment && (
                  <select
                    value={volatilityLevel}
                    onChange={(e) => setVolatilityLevel(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Low">Low Volatility (+20% position)</option>
                    <option value="Medium">Medium Volatility (normal)</option>
                    <option value="High">High Volatility (-20% position)</option>
                    <option value="Extreme">Extreme Volatility (-40% position)</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900">Error</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {results && (
              <>
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                    Calculation Results
                  </h2>

                  <div className="space-y-4">
                    {/* Main Results */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Position Size</p>
                        <p className="text-2xl font-bold text-blue-600">{results.lots}</p>
                        <p className="text-xs text-gray-500">lots</p>
                      </div>

                      <div className="bg-green-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Risk Amount</p>
                        <p className="text-2xl font-bold text-green-600">${results.riskAmount}</p>
                        <p className="text-xs text-gray-500">{results.accountPercentage}% of account</p>
                      </div>

                      <div className="bg-purple-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Units</p>
                        <p className="text-2xl font-bold text-purple-600">{results.positionSize}</p>
                        <p className="text-xs text-gray-500">currency units</p>
                      </div>

                      <div className="bg-orange-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">Pip Value</p>
                        <p className="text-2xl font-bold text-orange-600">${results.pipValue}</p>
                        <p className="text-xs text-gray-500">per pip/point</p>
                      </div>
                    </div>

                    {results.adjustedForVolatility && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-yellow-900 mb-1">
                          ⚡ Volatility Adjusted
                        </p>
                        <p className="text-xs text-yellow-700">
                          Position size adjusted for <span className={`font-bold ${getVolatilityColor(results.volatilityLevel)}`}>
                            {results.volatilityLevel}
                          </span> market volatility
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Profit/Loss Scenarios */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-bold mb-4">Profit/Loss Scenarios</h3>
                  <div className="space-y-3">
                    {results.scenarios.map((scenario, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          scenario.amount < 0
                            ? 'bg-red-50 border-red-200'
                            : 'bg-green-50 border-green-200'
                        }`}
                      >
                        <div>
                          <p className="font-medium text-gray-900">{scenario.label}</p>
                          <p className="text-xs text-gray-600">{scenario.pips.toFixed(0)} pips</p>
                        </div>
                        <p className={`text-lg font-bold ${scenario.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {scenario.amount < 0 ? '-' : '+'}${Math.abs(scenario.amount).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-4">
                  <Button className="flex-1" variant="outline">
                    <Save className="w-4 h-4 mr-2" />
                    Save Calculation
                  </Button>
                  <Button className="flex-1">
                    Share Results
                  </Button>
                </div>
              </>
            )}

            {!results && !error && (
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <Calculator className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Fill in the form to calculate your position size</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
