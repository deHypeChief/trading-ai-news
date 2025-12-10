/* eslint-disable react/react-in-jsx-scope */
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Calendar, Filter, AlertCircle, LogOut } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function CalendarPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [selectedCurrency, setSelectedCurrency] = useState('');
  const [selectedImpact, setSelectedImpact] = useState('');
  const [minRelevance, setMinRelevance] = useState('');
  const [currencies, setCurrencies] = useState([]);
  
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchCurrencies();
    fetchEvents();
  }, [selectedCurrency, selectedImpact, minRelevance]);

  const fetchCurrencies = async () => {
    try {
      const response = await fetch(`${API_URL}/api/calendar/meta/currencies`);
      const data = await response.json();
      if (data.success) {
        setCurrencies(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch currencies:', err);
    }
  };

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      // Date range: next 7 days
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());
      
      if (selectedCurrency) params.append('currency', selectedCurrency);
      if (selectedImpact) params.append('impact', selectedImpact);
      if (minRelevance) params.append('minRelevance', minRelevance);

      const response = await fetch(`${API_URL}/api/calendar?${params}`);
      const data = await response.json();

      if (data.success) {
        setEvents(data.data.events);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Failed to fetch calendar events');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getImpactColor = (impact) => {
    switch (impact) {
      case 'High': return 'bg-red-100 text-red-800 border-red-300';
      case 'Medium': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Low': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getRelevanceColor = (score) => {
    if (score >= 80) return 'text-red-600 font-bold';
    if (score >= 60) return 'text-orange-600 font-semibold';
    if (score >= 40) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getVolatilityBadge = (volatility) => {
    const colors = {
      Extreme: 'bg-red-600 text-white',
      High: 'bg-orange-500 text-white',
      Medium: 'bg-yellow-500 text-white',
      Low: 'bg-green-500 text-white',
    };
    return colors[volatility] || 'bg-gray-500 text-white';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const groupedEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.eventDateTime) - new Date(b.eventDateTime));
    return sorted.reduce((acc, evt) => {
      const key = formatDate(evt.eventDateTime);
      if (!acc[key]) acc[key] = [];
      acc[key].push(evt);
      return acc;
    }, {});
  }, [events]);

  const historicalHint = (event) => {
    const hasHighImpact = event.impact === 'High';
    const highScore = (event.aiRelevanceScore || 0) >= 60;
    if (hasHighImpact || highScore) {
      return `Historically, high-impact releases like this often come with heightened volatility and can lean bullish for ${event.currency || 'the currency'} when the print beats forecasts, and bearish when it misses. Treat this as context, not a certainty.`;
    }
    return `Past releases of this type tend to move gradually, with a mild bullish bias on upside surprises and softening when data disappoints. Use this as color only, not a guarantee.`;
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Calendar className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold">Smart Money Calendar</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Welcome, {user?.username || 'Trader'}</span>
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')}>
              Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Filters</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Currency
              </label>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Currencies</option>
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Impact Level
              </label>
              <select
                value={selectedImpact}
                onChange={(e) => setSelectedImpact(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Impacts</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Min AI Score
              </label>
              <select
                value={minRelevance}
                onChange={(e) => setMinRelevance(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Any Score</option>
                <option value="80">80+ (Critical)</option>
                <option value="60">60+ (High)</option>
                <option value="40">40+ (Medium)</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button 
                onClick={() => {
                  setSelectedCurrency('');
                  setSelectedImpact('');
                  setMinRelevance('');
                }}
                variant="outline"
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Events List */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold">Economic Events (Next 7 Days)</h2>
            <p className="text-sm text-gray-600 mt-1">
              {events.length} events found
            </p>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-600 mt-4">Loading events...</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-red-600">{error}</p>
            </div>
          ) : events.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No events found matching your filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-700">
                    <th className="px-4 py-3 text-left font-semibold">Date / Time</th>
                    <th className="px-4 py-3 text-left font-semibold">Event</th>
                    <th className="px-4 py-3 text-left font-semibold">Impact</th>
                    <th className="px-4 py-3 text-left font-semibold">Currency</th>
                    <th className="px-4 py-3 text-left font-semibold">Previous</th>
                    <th className="px-4 py-3 text-left font-semibold">Forecast</th>
                    <th className="px-4 py-3 text-left font-semibold">Actual</th>
                    <th className="px-4 py-3 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Object.entries(groupedEvents).map(([dayLabel, dayEvents]) => (
                    <>
                      <tr key={dayLabel} className="bg-gray-100">
                        <td colSpan={8} className="px-4 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">{dayLabel}</td>
                      </tr>
                      {dayEvents.map((event) => {
                        const isExpanded = expandedId === event._id;
                        return (
                          <>
                            <tr
                              key={event._id}
                              className="hover:bg-gray-50 cursor-pointer"
                              onClick={() => setExpandedId(isExpanded ? null : event._id)}
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                                <div className="text-xs text-gray-600">{formatTime(event.eventDateTime)}</div>
                              </td>
                              <td className="px-4 py-3 max-w-xs">
                                <div className="font-semibold text-gray-900 line-clamp-2">{event.eventName}</div>
                                <div className="text-xs text-gray-500">{event.country}</div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs font-medium border ${getImpactColor(event.impact)}`}>
                                  {event.impact}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-800">
                                <div className="font-medium">{event.currency}</div>
                              </td>
                              <td className="px-4 py-3 text-gray-800">{event.previous ?? '—'}</td>
                              <td className="px-4 py-3 text-gray-800">{event.forecast ?? '—'}</td>
                              <td className="px-4 py-3 text-gray-800">{event.actual ?? '—'}</td>
                              <td className="px-4 py-3 space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" onClick={() => setSelectedEvent(event)}>View more</Button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-white" key={`${event._id}-expanded`}>
                                <td colSpan={8} className="px-4 py-4">
                                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 space-y-3">
                                    {event.aiSummary ? (
                                      <div>
                                        <p className="font-semibold text-gray-900 mb-1">AI Summary</p>
                                        <p className="text-gray-700 leading-relaxed">{event.aiSummary}</p>
                                      </div>
                                    ) : (
                                      <p className="text-gray-600">No AI summary yet for this event.</p>
                                    )}
                                    {(event.newsHeadline || event.newsSource) && (
                                      <div className="text-xs text-gray-600">
                                        {event.newsHeadline && <p className="font-medium text-gray-900 text-sm">{event.newsHeadline}</p>}
                                        {event.newsSource && (
                                          <p>Source: {event.newsSource}{event.newsPublishedAt ? ` • ${formatDateTime(event.newsPublishedAt)}` : ''}</p>
                                        )}
                                      </div>
                                    )}
                                    {(event.previous || event.forecast || event.actual) && (
                                      <div className="grid grid-cols-3 gap-3 text-sm">
                                        {event.previous && (
                                          <div>
                                            <span className="text-gray-500">Previous:</span>
                                            <span className="ml-2 font-medium">{event.previous}</span>
                                          </div>
                                        )}
                                        {event.forecast && (
                                          <div>
                                            <span className="text-gray-500">Forecast:</span>
                                            <span className="ml-2 font-medium">{event.forecast}</span>
                                          </div>
                                        )}
                                        {event.actual && (
                                          <div>
                                            <span className="text-gray-500">Actual:</span>
                                            <span className="ml-2 font-medium text-green-600">{event.actual}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto shadow-xl no-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-2xl font-bold">{selectedEvent.eventName}</h2>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-500 hover:text-gray-700">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded text-sm font-medium border ${getImpactColor(selectedEvent.impact)}`}>
                  {selectedEvent.impact} Impact
                </span>
                {selectedEvent.volatilityPrediction && (
                  <span className={`px-3 py-1 rounded text-sm font-medium ${getVolatilityBadge(selectedEvent.volatilityPrediction)}`}>
                    {selectedEvent.volatilityPrediction} Volatility
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Currency:</span>
                  <span className="ml-2 font-medium">{selectedEvent.currency}</span>
                </div>
                <div>
                  <span className="text-gray-500">Country:</span>
                  <span className="ml-2 font-medium">{selectedEvent.country}</span>
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>
                  <span className="ml-2 font-medium">{formatDate(selectedEvent.eventDateTime)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Time:</span>
                  <span className="ml-2 font-medium">{formatTime(selectedEvent.eventDateTime)}</span>
                </div>
              </div>

              {selectedEvent.aiRelevanceScore && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">AI Analysis</h3>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-sm text-gray-700">Relevance Score:</span>
                      <span className={`text-lg font-bold ${getRelevanceColor(selectedEvent.aiRelevanceScore)}`}>
                        {selectedEvent.aiRelevanceScore}/100
                      </span>
                    </div>
                    {selectedEvent.aiReasoning && (
                      <p className="text-sm text-gray-700 mb-3">{selectedEvent.aiReasoning}</p>
                    )}
                    {selectedEvent.tradingRecommendation && (
                      <div className="bg-white p-3 rounded border border-blue-200">
                        <p className="text-sm font-medium text-blue-900">💡 Trading Recommendation:</p>
                        <p className="text-sm text-gray-700 mt-1">{selectedEvent.tradingRecommendation}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedEvent.aiSummary && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">AI Summary</h3>
                  <p className="text-sm text-gray-800 leading-relaxed">{selectedEvent.aiSummary}</p>
                  <p className="text-sm text-gray-700 mt-2 italic">{historicalHint(selectedEvent)}</p>
                  {(selectedEvent.newsHeadline || selectedEvent.newsSource) && (
                    <div className="mt-3 text-sm text-gray-800">
                      {selectedEvent.newsHeadline && <p className="font-medium text-gray-900">{selectedEvent.newsHeadline}</p>}
                      {selectedEvent.newsSource && (
                        <p className="text-xs text-gray-600">Source: {selectedEvent.newsSource}{selectedEvent.newsPublishedAt ? ` • ${formatDateTime(selectedEvent.newsPublishedAt)}` : ''}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedEvent.aiInDepthAnalysis && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">In-depth Analysis (AI)</h3>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{selectedEvent.aiInDepthAnalysis}</p>
                </div>
              )}

              {selectedEvent.description && (
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-sm text-gray-700">{selectedEvent.description}</p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setSelectedEvent(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
