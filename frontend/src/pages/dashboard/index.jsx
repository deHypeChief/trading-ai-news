/* eslint-disable react/react-in-jsx-scope */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { Button } from '@/components/ui/button';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, LogOut, Clock3, ChevronLeft, ChevronRight, AlertCircle, Filter, Menu, X, User, Settings } from 'lucide-react';

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

export default function Dashboard() {
	const { user, logout, updateUser } = useAuth();
	const navigate = useNavigate();
	const [now, setNow] = useState(new Date());
	const [todayEvents, setTodayEvents] = useState([]);
	const [selectedDate, setSelectedDate] = useState(null); // yyyy-mm-dd
	const [page, setPage] = useState(1);
	const pageSize = 5;
	const [expandedEventId, setExpandedEventId] = useState(null);
	const [modalEvent, setModalEvent] = useState(null);
	const [storyIndex, setStoryIndex] = useState(0);

	const [events, setEvents] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [eventsOffset, setEventsOffset] = useState(0);
	const [hasMoreEvents, setHasMoreEvents] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const eventsLimit = 10;

	const [loadingEvents, setLoadingEvents] = useState(true);
	const [eventsError, setEventsError] = useState('');

	// Timezone control
	const fallbackTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	const [displayTimezone, setDisplayTimezone] = useState(user?.timezone || fallbackTz);
	const [showTimezoneMenu, setShowTimezoneMenu] = useState(false);
	const [savingTimezone, setSavingTimezone] = useState(false);
	const [timezoneError, setTimezoneError] = useState('');

	// Filters
	const [selectedCurrency, setSelectedCurrency] = useState('');
	const [selectedImpact, setSelectedImpact] = useState('');
	const [selectedImpactLevels, setSelectedImpactLevels] = useState({ High: true, Medium: true, Low: false });
	const [minRelevance] = useState('');
	const [currencies, setCurrencies] = useState([]);
	const [selectedCurrencies, setSelectedCurrencies] = useState({});

	const [selectedEvent, setSelectedEvent] = useState(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [userMenuOpen, setUserMenuOpen] = useState(false);
	const [showFilters, setShowFilters] = useState(false);

	const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(timer);
	}, []);

	useEffect(() => {
		const fetchEvents = async () => {
			try {
				setLoadingEvents(true);
				setEventsError('');

				const startDate = new Date();
				startDate.setHours(0, 0, 0, 0);
				startDate.setDate(startDate.getDate() - 30); // Include past 30 days
				const endDate = new Date(startDate);
				endDate.setFullYear(endDate.getFullYear() + 1);

				const params = new URLSearchParams({
					startDate: startDate.toISOString(),
					endDate: endDate.toISOString(),
					limit: '1000',
					offset: '0',
				});

				const res = await fetch(`${API_URL}/api/calendar?${params}`);
				const data = await res.json();

				if (!data.success) throw new Error(data.message || 'Failed to load events');

				console.log('Fetched', data.data.events.length, 'events for calendar');
				console.log('Date range:', startDate.toISOString(), 'to', endDate.toISOString());

				// Sort by relevance desc then impact then time
				const sorted = [...data.data.events].sort((a, b) => {
					const relA = a.aiRelevanceScore ?? 0;
					const relB = b.aiRelevanceScore ?? 0;
					if (relB !== relA) return relB - relA;
					const impactRank = { High: 3, Medium: 2, Low: 1 };
					const impA = impactRank[a.impact] || 0;
					const impB = impactRank[b.impact] || 0;
					if (impB !== impA) return impB - impA;
					return new Date(a.eventDateTime) - new Date(b.eventDateTime);
				});

				setTodayEvents(sorted);
				setPage(1);
			} catch (err) {
				setEventsError(err.message || 'Failed to load events');
			} finally {
				setLoadingEvents(false);
			}
		};

		fetchEvents();
	}, [API_URL]);

	useEffect(() => {
		setDisplayTimezone(user?.timezone || fallbackTz);
	}, [user, fallbackTz]);

	const userTimezone = displayTimezone;
	const timeString = useMemo(() => {
		try {
			return new Intl.DateTimeFormat('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				timeZone: userTimezone,
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
	}, [now, userTimezone, fallbackTz]);

	// TradingView Ticker Tape Widget
	useEffect(() => {
		const script = document.createElement('script');
		script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
		script.async = true;
		script.innerHTML = JSON.stringify({
			symbols: [
				{ proName: "FOREXCOM:SPXUSD", title: "S&P 500" },
				{ proName: "FOREXCOM:NSXUSD", title: "US 100" },
				{ proName: "FX_IDC:EURUSD", title: "EUR/USD" },
				{ proName: "FX_IDC:GBPUSD", title: "GBP/USD" },
				{ proName: "FX_IDC:USDJPY", title: "USD/JPY" },
				{ proName: "FX_IDC:USDCHF", title: "USD/CHF" },
				{ proName: "FX_IDC:AUDUSD", title: "AUD/USD" },
				{ proName: "FX_IDC:USDCAD", title: "USD/CAD" },
				{ proName: "BITSTAMP:BTCUSD", title: "Bitcoin" },
				{ proName: "BITSTAMP:ETHUSD", title: "Ethereum" }
			],
			showSymbolLogo: true,
			colorTheme: "light",
			isTransparent: false,
			displayMode: "adaptive",
			locale: "en"
		});

		const container = document.querySelector('.tradingview-widget-container__widget');
		if (container) {
			container.appendChild(script);
		}

		return () => {
			if (container && script.parentNode) {
				container.removeChild(script);
			}
		};
	}, []);

	const formatDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

	const impactColor = {
		High: 'bg-red-100 text-red-700 border border-red-200',
		Medium: 'bg-orange-100 text-orange-700 border border-orange-200',
		Low: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
	};

	// Build daily buckets for mini-calendar heatmap
	const dayBuckets = useMemo(() => {
		const buckets = {};
		console.log('Building dayBuckets from', todayEvents.length, 'events');
		todayEvents.forEach((evt) => {
			const d = new Date(evt.eventDateTime);
			const key = formatDateKey(d);
			if (!buckets[key]) buckets[key] = { high: 0, medium: 0, low: 0 };
			if (evt.impact === 'High') buckets[key].high += 1;
			else if (evt.impact === 'Medium') buckets[key].medium += 1;
			else buckets[key].low += 1;
		});
		console.log('Day buckets created:', Object.keys(buckets).length, 'days with events');
		return buckets;
	}, [todayEvents]);

	const dayColor = (key) => {
		const bucket = dayBuckets[key];
		if (!bucket) return 'bg-gray-50 text-gray-400';
		if (bucket.low >= bucket.high && bucket.low >= bucket.medium) return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
		if (bucket.medium >= bucket.high) return 'bg-orange-100 text-orange-700 border border-orange-200';
		return 'bg-red-100 text-red-700 border border-red-200';
	};

	const filteredEvents = useMemo(() => {
		if (!selectedDate) return todayEvents;
		return todayEvents.filter((evt) => {
			const key = formatDateKey(new Date(evt.eventDateTime));
			return key === selectedDate;
		});
	}, [selectedDate, todayEvents]);

	const hotStories = useMemo(() => {
		const list = todayEvents
			.filter((evt) => evt.newsHeadline || evt.aiSummary)
			.sort((a, b) => (b.aiRelevanceScore ?? 0) - (a.aiRelevanceScore ?? 0))
			.slice(0, 10);
		return list;
	}, [todayEvents]);

	useEffect(() => {
		setStoryIndex(0);
	}, [hotStories.length]);

	const [monthOffset, setMonthOffset] = useState(0);
	const currentMonth = useMemo(() => {
		const d = new Date();
		d.setMonth(d.getMonth() + monthOffset);
		return d;
	}, [monthOffset]);

	const monthLabel = currentMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' });

	const daysInMonth = useMemo(() => {
		const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
		const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
		const startDay = start.getDay();
		const days = [];
		for (let i = 0; i < startDay; i++) days.push(null);
		for (let d = 1; d <= end.getDate(); d++) days.push(d);
		return days;
	}, [currentMonth]);

	const isDaySelected = (key) => selectedDate === key;

	const handleDayClick = (key) => {
		setSelectedDate((prev) => (prev === key ? null : key));
		setPage(1);
	};

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

	const fetchEvents = async (loadMore = false) => {
		try {
			if (loadMore) {
				setLoadingMore(true);
			} else {
				setLoading(true);
				setEventsOffset(0);
			}

			const params = new URLSearchParams();

			// Date range: from today midnight for next year
			const startDate = new Date();
			startDate.setHours(0, 0, 0, 0);
			const endDate = new Date(startDate);
			endDate.setFullYear(endDate.getFullYear() + 1);

			params.append('startDate', startDate.toISOString());
			params.append('endDate', endDate.toISOString());
			params.append('limit', eventsLimit.toString());
			params.append('offset', (loadMore ? eventsOffset : 0).toString());

			if (selectedCurrency) params.append('currency', selectedCurrency);
			if (selectedImpact) params.append('impact', selectedImpact);
			if (minRelevance) params.append('minRelevance', minRelevance);

			const response = await fetch(`${API_URL}/api/calendar?${params}`);
			const data = await response.json();

			if (data.success) {
				const newEvents = data.data.events;
				const currentOffset = loadMore ? eventsOffset : 0;

				if (loadMore) {
					setEvents(prev => [...prev, ...newEvents]);
				} else {
					setEvents(newEvents);
				}

				const newOffset = currentOffset + newEvents.length;
				setEventsOffset(newOffset);

				// Check if there are more events to load
				const hasMore = newOffset < data.data.total;
				console.log('📊 Events Pagination:', {
					loadMore,
					newEventsCount: newEvents.length,
					currentOffset,
					newOffset,
					totalEvents: data.data.total,
					hasMore,
					eventsLimit
				});
				setHasMoreEvents(hasMore);
			} else {
				setError(data.message);
			}
		} catch (err) {
			setError('Failed to fetch calendar events');
			console.error(err);
		} finally {
			if (loadMore) {
				setLoadingMore(false);
			} else {
				setLoading(false);
			}
		}
	};

	const handleLoadMore = () => {
		if (!loadingMore && hasMoreEvents) {
			fetchEvents(true);
		}
	};

	const handleTimezoneSelect = async (tz) => {
		if (!user) return;
		setTimezoneError('');
		setShowTimezoneMenu(false);
		setSavingTimezone(true);
		const previousTz = displayTimezone;
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
		} catch (err) {
			setDisplayTimezone(previousTz);
			setTimezoneError(err.message || 'Failed to update timezone');
		} finally {
			setSavingTimezone(false);
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
			Low: 'bg-orange-500 text-white',
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
		<div className="min-h-screen bg-gray-50" style={{ zoom: '90%' }}>
			{/* Navigation */}
			<nav className="bg-white border-b fixed top-0 left-0 right-0 z-50">
				<div className="mx-auto px-4 sm:px-6 lg:px-20">
					<div className="flex justify-between items-center h-16">
						<Link to="/dashboard" className="flex items-center gap-2">
							<div className="flex items-center gap-2">
								<img src="/smlogo.png" alt="" className='w-10 h-10' />
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

			<div className="px-4 sm:px-6 lg:px-20">
				{/* TradingView Ticker Tape */}
				<div className="bg-white border-b fixed top-16 left-0 right-0 z-40">
					<div className="flex flex-col sm:flex-row">
						{/* Ticker - full width on mobile, flex-1 on larger screens */}
						<div className="w-full sm:flex-1 overflow-hidden">
							<div className="tradingview-widget-container" style={{ height: '46px' }}>
								<div className="tradingview-widget-container__widget"></div>
							</div>
						</div>
						{/* Timezone selector - full width on mobile, min-width on larger screens */}
						<div className="w-full sm:relative sm:w-auto">
							<button
								onClick={() => setShowTimezoneMenu((v) => !v)}
								className="w-full sm:min-w-fit px-4 py-2 sm:border-l bg-gray-50 flex items-center justify-center sm:justify-start gap-2 cursor-pointer hover:bg-gray-100 transition"
								type="button"
							>
								<Clock3 className="h-4 w-4 text-gray-600" />
								<span className="text-sm font-medium text-gray-700">{timeString}</span>
								<span className="text-xs text-gray-500 hidden sm:inline">{userTimezone}</span>
							</button>
							{showTimezoneMenu && (
								<div className="absolute right-0 mt-2 w-full sm:w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
									{timezoneError && (
										<div className="px-3 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
											{timezoneError}
										</div>
									)}
									<div className="max-h-64 overflow-y-auto">
										{TIMEZONES.map((tz) => {
											const isActive = tz.value === displayTimezone;
											return (
												<button
													key={tz.value}
													onClick={() => handleTimezoneSelect(tz.value)}
													disabled={savingTimezone}
													className={`w-full text-left px-3 py-2 flex flex-col border-b last:border-b-0 hover:bg-gray-50 ${isActive ? 'bg-blue-50' : ''}`}
													type="button"
												>
													<span className="text-sm font-medium text-gray-900">{tz.label}</span>
													<span className="text-[11px] text-gray-500">{tz.value}</span>
												</button>
											);
										})}
									</div>
									<div className="px-3 py-2 text-[11px] text-gray-500 border-t bg-gray-50">
										{savingTimezone ? 'Synchronizing timezone…' : 'Click to sync your account timezone.'}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Main Content */}
				<div className="py-8 mt-10 md:mt-0" style={{ paddingTop: '140px' }}>
					{/* Primary layout matching sketch */}
					<div className='relative grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 '>

						<div className="w-full flex-1 mx-auto order-2 lg:order-1">
							{/* Events List */}
							<div className="bg-white rounded-lg shadow-sm w-full">
								<div className='w-full flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 sm:p-6 gap-4 sm:gap-0'>
									<div className="flex-1">
										<h2 className="text-lg font-bold">Economic Events</h2>
									</div>
									<div className='flex flex-col sm:flex-row gap-2 sm:gap-5'>
										<button
											className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium"
											onClick={() => setShowFilters(!showFilters)}
										>
											<Filter className="h-4 w-4 inline mr-2" />
											Filters
										</button>
									</div>
								</div>

								{/* Filter Panel - Forex Factory Style */}
								{showFilters && (
									<div className="border-t px-4 sm:px-6 py-6 sm:py-8">
										<div className="space-y-4 gap-8 max-w-6xl">
											<div className='flex flex-col lg:flex-row gap-4 lg:gap-3'>
												{/* Expected Impact */}
												<div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
													<div className="flex items-center justify-between mb-3">
														<h3 className="font-semibold text-gray-900 text-sm">Expected Impact</h3>
														<div className="flex gap-3">
															<button
																onClick={() => setSelectedImpactLevels({ High: true, Medium: true, Low: false })}
																className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
															>
																all
															</button>
															<span className="text-gray-300">|</span>
															<button
																onClick={() => setSelectedImpactLevels({ High: false, Medium: false, Low: false })}
																className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
															>
																none
															</button>
														</div>
													</div>
													<div className="flex flex-wrap gap-4">
														<label className="flex items-center gap-3 cursor-pointer group">
															<div className="relative">
																<input
																	type="checkbox"
																	checked={selectedImpactLevels.High}
																	onChange={(e) => setSelectedImpactLevels({ ...selectedImpactLevels, High: e.target.checked })}
																	className="w-4 h-4 accent-red-600"
																/>
															</div>
															<div className="flex items-center gap-2">
																<span className="w-4 h-4 bg-red-600 rounded-md"></span>
																<span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">High</span>
															</div>
														</label>
														<label className="flex items-center gap-3 cursor-pointer group">
															<div className="relative">
																<input
																	type="checkbox"
																	checked={selectedImpactLevels.Medium}
																	onChange={(e) => setSelectedImpactLevels({ ...selectedImpactLevels, Medium: e.target.checked })}
																	className="w-4 h-4 accent-orange-500"
																/>
															</div>
															<div className="flex items-center gap-2">
																<span className="w-4 h-4 bg-orange-500 rounded-md"></span>
																<span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">Medium</span>
															</div>
														</label>
														<label className="flex items-center gap-3 cursor-pointer group">
															<div className="relative">
																<input
																	type="checkbox"
																	checked={selectedImpactLevels.Low}
																	onChange={(e) => setSelectedImpactLevels({ ...selectedImpactLevels, Low: e.target.checked })}
																	className="w-4 h-4 accent-yellow-500"
																/>
															</div>
															<div className="flex items-center gap-2">
																<span className="w-4 h-4 bg-yellow-500 rounded-md"></span>
																<span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">Low</span>
															</div>
														</label>
													</div>
												</div>

												{/* Currencies */}
												<div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
													<div className="flex items-center justify-between mb-3">
														<h3 className="font-semibold text-gray-900 text-sm">Currencies</h3>
														<div className="flex gap-3">
															<button
																onClick={() => setSelectedCurrencies(['AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'JPY', 'NZD', 'USD'].reduce((acc, c) => ({ ...acc, [c]: true }), {}))}
																className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
															>
																all
															</button>
															<span className="text-gray-300">|</span>
															<button
																onClick={() => setSelectedCurrencies({})}
																className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
															>
																none
															</button>
														</div>
													</div>
													<div className="flex items-center gap-3">
														{['AUD', 'CAD', 'CHF', 'CNY', 'EUR', 'GBP', 'JPY', 'NZD', 'USD'].map((curr) => (
															<label key={curr} className="flex items-center gap-2 cursor-pointer group">
																<input
																	type="checkbox"
																	checked={selectedCurrencies[curr] || false}
																	onChange={(e) => setSelectedCurrencies({ ...selectedCurrencies, [curr]: e.target.checked })}
																	className="w-4 h-4 accent-blue-600"
																/>
																<span className="text-xs font-medium text-gray-700 group-hover:text-gray-900">{curr}</span>
															</label>
														))}
													</div>
												</div>
											</div>

											{/* Action Buttons */}
											<div className="flex flex-col sm:flex-row gap-3 sm:gap-3 justify-end">
												<button
													onClick={() => {
														const impactStr = Object.entries(selectedImpactLevels)
															.filter(([, v]) => v)
															.map(([k]) => k)
															.join(',');
														setSelectedImpact(impactStr);
														const currStr = Object.entries(selectedCurrencies)
															.filter(([, v]) => v)
															.map(([k]) => k)
															.join(',');
														setSelectedCurrency(currStr);
														setShowFilters(false);
													}}
													className="px-4 py-2 bg-[#FF0000] text-white text-sm rounded-lg font-medium  transition-all shadow-sm hover:shadow-md"
												>
													Apply Filter
												</button>
												<button
													onClick={() => setShowFilters(false)}
													className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
												>
													Cancel
												</button>
											</div>
										</div>
									</div>
								)}



								{loading ? (
									<div className="p-12 text-center">
										<div className="inline-block w-8 h-8 border-4 border-[#FF0000] border-t-transparent rounded-full animate-spin"></div>
										<p className="text-gray-600 mt-4">Loading events...</p>
									</div>
								) : error ? (
									<div className="p-12 text-center">
										<AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
										<p className="text-red-600">{error}</p>
									</div>
								) : events.length === 0 ? (
									<div className="p-12 text-center w-full">
										<Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
										<p className="text-gray-600">No events found matching your filters</p>
									</div>
								) : (
									<div className="overflow-x-auto">
										<table className="min-w-full text-sm">
											<thead>
												<tr className="bg-gray-50 text-gray-700">
													<th className="px-2 sm:px-4 py-3 text-left font-semibold text-xs sm:text-sm">Date / Time</th>
													<th className="px-2 sm:px-4 py-3 text-left font-semibold text-xs sm:text-sm">Event</th>
													<th className="px-2 sm:px-4 py-3 text-left font-semibold text-xs sm:text-sm hidden sm:table-cell">Impact</th>
													<th className="px-2 sm:px-4 py-3 text-left font-semibold text-xs sm:text-sm hidden md:table-cell">Previous</th>
													<th className="px-2 sm:px-4 py-3 text-left font-semibold text-xs sm:text-sm hidden md:table-cell">Forecast</th>
													<th className="px-2 sm:px-4 py-3 text-left font-semibold text-xs sm:text-sm hidden lg:table-cell">Actual</th>
												</tr>
											</thead>
											<tbody className="divide-y divide-gray-200">
												{Object.entries(groupedEvents).map(([dayLabel, dayEvents]) => (
													<>
														<tr key={dayLabel} className="bg-gray-100">
															<td colSpan={6} className="px-2 sm:px-4 py-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">{dayLabel}</td>
														</tr>
														{dayEvents.map((event) => {
															const isExpanded = expandedEventId === event._id;
															return (
																<>
																	<tr
																		key={event._id}
																		className="hover:bg-gray-50 cursor-pointer"
																		onClick={() => setExpandedEventId(isExpanded ? null : event._id)}
																	>
																		<td className="px-2 sm:px-4 py-3 whitespace-nowrap text-gray-800">
																			<div className="text-xs text-gray-600">{formatTime(event.eventDateTime)}</div>
																		</td>
																		<td className="px-2 sm:px-4 py-3 max-w-xs">
																			<div className="flex items-center gap-2 mb-1">
																				<span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded border border-blue-300">
																					{event.currency}
																				</span>
																				<span className="font-semibold text-gray-900 text-sm sm:text-base">{event.eventName}</span>
																			</div>
																			<div className="text-xs text-gray-500">{event.country}</div>
																		</td>
																		<td className="px-2 sm:px-4 py-3 hidden sm:table-cell">
																			<span className={`px-2 py-1 rounded text-xs font-medium border ${getImpactColor(event.impact)}`}>
																				{event.impact}
																			</span>
																		</td>
																		<td className="px-2 sm:px-4 py-3 text-gray-800 hidden md:table-cell">{event.previous ?? '—'}</td>
																		<td className="px-2 sm:px-4 py-3 text-gray-800 hidden md:table-cell">{event.forecast ?? '—'}</td>
																		<td className="px-2 sm:px-4 py-3 text-gray-800 hidden lg:table-cell">{event.actual ?? '—'}</td>
																	</tr>
																	{isExpanded && (
																		<tr className="bg-white" key={`${event._id}-expanded`}>
																			<td colSpan={6} className="px-2 sm:px-4 py-4">
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
																						<div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
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
																					<Button size="sm" onClick={() => setSelectedEvent(event)}>View more</Button>
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

										{/* Load More Button */}
										{hasMoreEvents && (
											<div className="flex justify-center py-6">
												<Button
													onClick={handleLoadMore}
													disabled={loadingMore}
													variant="outline"
													size="lg"
												>
													{loadingMore ? 'Loading...' : 'Load More Events'}
												</Button>
											</div>
										)}
									</div>
								)}
							</div>
						</div>
						<div className="lg:sticky space-y-6 h-fit lg:top-32 order-1 lg:order-2">
							<div className="bg-white rounded-lg shadow p-4 h-fit">
								<div className="flex items-center justify-between mb-3">
									<button
										className="p-2 rounded-full hover:bg-gray-100"
										onClick={() => setMonthOffset((m) => m - 1)}
										aria-label="Previous month"
									>
										<ChevronLeft className="h-4 w-4" />
									</button>
									<div className="text-center">
										{/* <p className="text-xs text-gray-500">Local time</p> */}
										<p className="text-sm font-semibold text-gray-800">{monthLabel}</p>
									</div>
									<button
										className="p-2 rounded-full hover:bg-gray-100"
										onClick={() => setMonthOffset((m) => m + 1)}
										aria-label="Next month"
									>
										<ChevronRight className="h-4 w-4" />
									</button>
								</div>

								<div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs text-gray-500 mb-2">
									{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
										<div key={`${d}-${i}`}>{d}</div>
									))}
								</div>
								<div className="grid grid-cols-7 gap-1 sm:gap-2 text-center">
									{daysInMonth.map((day, idx) => {
										if (!day) return <div key={idx} className="h-8 sm:h-9" />;
										const dateKey = formatDateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
										const hasEvents = !!dayBuckets[dateKey];
										const colorClass = dayColor(dateKey);
										const selected = isDaySelected(dateKey);
										return (
											<button
												key={idx}
												type="button"
												onClick={() => hasEvents && handleDayClick(dateKey)}
												className={`h-8 sm:h-9 flex items-center justify-center rounded text-sm font-medium transition ${selected ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
													} ${hasEvents ? `${colorClass} hover:shadow-sm` : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
											>
												{day}
											</button>
										);
									})}
								</div>
								<div className="mt-3 text-xs text-gray-500 flex flex-wrap gap-2 sm:gap-3">
									<span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-200" /> High</span>
									<span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100 border border-orange-200" /> Medium</span>
									<span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-200" /> Low</span>
								</div>
							</div>

							<div className="bg-white rounded-lg shadow p-4 sm:p-5 h-fit">
								<div className="flex items-center justify-between mb-3">
									<div>
										<h3 className="text-sm font-semibold text-gray-900">Hot Stories</h3>
										<p className="text-xs text-gray-600">Curated market-moving headlines</p>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="ghost"
											size="icon"
											disabled={hotStories.length === 0}
											onClick={() => setStoryIndex((i) => (i - 1 + hotStories.length) % hotStories.length)}
											aria-label="Previous story"
										>
											<ChevronLeft className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											disabled={hotStories.length === 0}
											onClick={() => setStoryIndex((i) => (i + 1) % hotStories.length)}
											aria-label="Next story"
										>
											<ChevronRight className="h-4 w-4" />
										</Button>
									</div>
								</div>

								{hotStories.length === 0 ? (
									<div className="p-4 text-gray-600 bg-gray-50 rounded border border-dashed">No hot stories yet.</div>
								) : (
									<div className="space-y-3">
										{hotStories.slice(storyIndex, storyIndex + 1).map((story, idx) => {
											const storyTime = formatTime(story.newsPublishedAt || story.eventDateTime);
											const storyDate = formatDate(story.newsPublishedAt || story.eventDateTime);
											return (
												<div key={`${story._id || story.eventId}-${idx}`} className="p-4 border rounded-lg bg-gray-50 cursor-pointer" onClick={() => setModalEvent(story)}>
													<div className="flex items-center justify-between mb-2">
														<div className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${impactColor[story.impact] || 'bg-gray-100 text-gray-700'}`}>
															{story.impact} impact
														</div>
														<span className="text-xs text-gray-500">{story.currency} • {storyTime}</span>
													</div>
													<p className="font-semibold text-sm text-gray-900 mb-1">{story.newsHeadline || story.eventName}</p>
													<p className="text-xs text-gray-700 line-clamp-3 mb-2">{story.aiSummary || 'No AI summary available yet.'}</p>
													<p className="text-xs text-gray-500">{story.newsSource || 'Calendar'} • {storyDate}</p>
													<div className="mt-3 flex items-center gap-2">
														{/* <Button size="sm" variant="outline" onClick={() => setSelectedDate(formatDateKey(new Date(story.eventDateTime)))}>
														Jump to date
													</Button> */}
														{/* <Button size="sm" onClick={() => setModalEvent(story)}>Open story</Button> */}
													</div>
												</div>
											);
										})}
										{hotStories.length > 1 && (
											<div className="text-xs text-gray-500 text-right">{storyIndex + 1} / {hotStories.length}</div>
										)}
									</div>
								)}
							</div>
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
											{/* <p className="text-sm text-gray-700 mt-2 italic">{historicalHint(selectedEvent)}</p> */}
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

				{
					modalEvent && (
						<div
							className="fixed inset-0 bg-black/30 backdrop-blur-[1px] flex items-center justify-center p-4 z-50"
							onClick={() => setModalEvent(null)}
						>
							<div
								className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[85vh] overflow-y-auto shadow-xl no-scrollbar"
								onClick={(e) => e.stopPropagation()}
							>
								<div className="flex justify-between items-start mb-4">
									<h2 className="text-2xl font-bold">{modalEvent.eventName}</h2>
									<button onClick={() => setModalEvent(null)} className="text-gray-500 hover:text-gray-700">
										✕
									</button>
								</div>

								<div className="space-y-4">
									<div className="flex gap-2">
										<span className={`px-3 py-1 rounded text-sm font-medium border ${getImpactColor(modalEvent.impact)}`}>
											{modalEvent.impact} Impact
										</span>
										{modalEvent.volatilityPrediction && (
											<span className={`px-3 py-1 rounded text-sm font-medium ${getVolatilityBadge(modalEvent.volatilityPrediction)}`}>
												{modalEvent.volatilityPrediction} Volatility
											</span>
										)}
									</div>

									<div className="grid grid-cols-2 gap-4 text-sm">
										<div>
											<span className="text-gray-500">Currency:</span>
											<span className="ml-2 font-medium">{modalEvent.currency}</span>
										</div>
										<div>
											<span className="text-gray-500">Country:</span>
											<span className="ml-2 font-medium">{modalEvent.country}</span>
										</div>
										<div>
											<span className="text-gray-500">Date:</span>
											<span className="ml-2 font-medium">{formatDate(modalEvent.eventDateTime)}</span>
										</div>
										<div>
											<span className="text-gray-500">Time:</span>
											<span className="ml-2 font-medium">{formatTime(modalEvent.eventDateTime)}</span>
										</div>
									</div>

									{modalEvent.aiRelevanceScore && (
										<div className="border-t pt-4">
											<h3 className="font-semibold mb-2">AI Analysis</h3>
											<div className="bg-blue-50 p-4 rounded-lg">
												<div className="flex items-center gap-2 mb-3">
													<span className="text-sm text-gray-700">Relevance Score:</span>
													<span className={`text-lg font-bold ${getRelevanceColor(modalEvent.aiRelevanceScore)}`}>
														{modalEvent.aiRelevanceScore}/100
													</span>
												</div>
												{modalEvent.aiReasoning && (
													<p className="text-sm text-gray-700 mb-3">{modalEvent.aiReasoning}</p>
												)}
												{modalEvent.tradingRecommendation && (
													<div className="bg-white p-3 rounded border border-blue-200">
														<p className="text-sm font-medium text-blue-900">💡 Trading Recommendation:</p>
														<p className="text-sm text-gray-700 mt-1">{modalEvent.tradingRecommendation}</p>
													</div>
												)}
											</div>
										</div>
									)}

									{modalEvent.aiSummary && (
										<div className="border-t pt-4">
											<h3 className="font-semibold mb-2">AI Summary</h3>
											<p className="text-sm text-gray-800 leading-relaxed">{modalEvent.aiSummary}</p>
											{(modalEvent.newsHeadline || modalEvent.newsSource) && (
												<div className="mt-3 text-sm text-gray-800">
													{modalEvent.newsHeadline && <p className="font-medium text-gray-900">{modalEvent.newsHeadline}</p>}
													{modalEvent.newsSource && (
														<p className="text-xs text-gray-600">
															Source: {modalEvent.newsSource}
															{modalEvent.newsPublishedAt ? ` • ${formatDateTime(modalEvent.newsPublishedAt)}` : ''}
														</p>
													)}
												</div>
											)}
										</div>
									)}

									{modalEvent.aiInDepthAnalysis && (
										<div className="border-t pt-4">
											<h3 className="font-semibold mb-2">In-depth Analysis (AI)</h3>
											<p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{modalEvent.aiInDepthAnalysis}</p>
										</div>
									)}

									{modalEvent.description && (
										<div className="border-t pt-4">
											<h3 className="font-semibold mb-2">Description</h3>
											<p className="text-sm text-gray-700">{modalEvent.description}</p>
										</div>
									)}

									{(modalEvent.previous || modalEvent.forecast || modalEvent.actual) && (
										<div className="border-t pt-3 grid grid-cols-3 gap-3 text-sm">
											{modalEvent.previous && (
												<div>
													<p className="text-gray-500">Previous</p>
													<p className="font-medium">{modalEvent.previous}</p>
												</div>
											)}
											{modalEvent.forecast && (
												<div>
													<p className="text-gray-500">Forecast</p>
													<p className="font-medium">{modalEvent.forecast}</p>
												</div>
											)}
											{modalEvent.actual && (
												<div>
													<p className="text-gray-500">Actual</p>
													<p className="font-medium text-green-600">{modalEvent.actual}</p>
												</div>
											)}
										</div>
									)}
								</div>

								<div className="mt-6 flex justify-end">
									<Button onClick={() => setModalEvent(null)}>Close</Button>
								</div>
							</div>
						</div>
					)
				}
			</div>
		</div >
	);
}
