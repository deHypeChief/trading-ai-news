import axios from 'axios';

const TRADING_ECONOMICS_BASE_URL = 'https://api.tradingeconomics.com';
const FOREX_FACTORY_PRIMARY_URL = process.env.FOREX_FACTORY_URL || 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const FOREX_FACTORY_MIRROR_URL = process.env.FOREX_FACTORY_MIRROR_URL || 'https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.json';

export interface EconomicEvent {
  eventId: string;
  title: string;
  country: string;
  currency: string;
  date: Date;
  impact: 'Low' | 'Medium' | 'High';
  forecast?: string;
  previous?: string;
  actual?: string;
  description?: string;
  source: 'TradingEconomics' | 'ForexFactory';
}

/**
 * Fetch economic events from Trading Economics API
 */
async function fetchFromTradingEconomics(
  startDate: Date,
  endDate: Date
): Promise<EconomicEvent[]> {
  try {
    const apiKey = process.env.TRADING_ECONOMICS_API_KEY;
    
    if (!apiKey) {
      throw new Error('Trading Economics API key not configured');
    }

    const response = await axios.get(`${TRADING_ECONOMICS_BASE_URL}/calendar`, {
      params: {
        c: apiKey,
        d1: startDate.toISOString().split('T')[0],
        d2: endDate.toISOString().split('T')[0],
        limit: 1000,
      },
      timeout: 10000,
    });

    return response.data.map((event: any) => ({
      eventId: `te_${event.CalendarId}`,
      title: event.Event,
      country: event.Country,
      currency: event.Currency || getCurrencyFromCountry(event.Country),
      date: new Date(event.Date),
      impact: mapImpactLevel(event.Importance),
      forecast: event.Forecast?.toString(),
      previous: event.Previous?.toString(),
      actual: event.Actual?.toString(),
      description: event.Category,
      source: 'TradingEconomics' as const,
    }));
  } catch (error: any) {
    console.error('Trading Economics API error:', error.message);
    throw error;
  }
}

/**
 * Fetch economic events from Forex Factory (fallback)
 */
async function fetchFromForexFactory(url: string): Promise<EconomicEvent[]> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        // Mimic browser UA to avoid strict rate limiting
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
    });

    return response.data.map((event: any) => ({
      eventId: `ff_${event.title}_${event.date}`,
      title: event.title,
      country: event.country,
      currency: event.impact?.toLowerCase() === 'usd' ? 'USD' : getCurrencyFromCountry(event.country),
      date: new Date(event.date),
      impact: mapForexFactoryImpact(event.impact),
      forecast: event.forecast,
      previous: event.previous,
      actual: event.actual,
      description: event.title,
      source: 'ForexFactory' as const,
    }));
  } catch (error: any) {
    console.error('Forex Factory API error:', error.message);
    throw error;
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 3, baseDelayMs = 3000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.response?.status;
      const isRateLimit = status === 429 || status === 503;
      if (i === attempts - 1 || !isRateLimit) break;
      const delay = Math.min(baseDelayMs * Math.pow(2, i), 30000);
      const jitter = Math.random() * 1000;
      const totalDelay = delay + jitter;
      console.warn(
        `[${label}] attempt ${i + 1} failed (status ${status || 'unknown'}); retrying in ${Math.round(totalDelay)}ms`
      );
      await sleep(totalDelay);
    }
  }
  throw lastError;
}

async function fetchForexFactoryWithFallbacks(): Promise<EconomicEvent[]> {
  const urls = [FOREX_FACTORY_PRIMARY_URL, FOREX_FACTORY_MIRROR_URL].filter(Boolean);
  let lastError: any;

  for (const url of urls) {
    try {
      return await fetchFromForexFactory(url);
    } catch (err: any) {
      lastError = err;
      console.warn(`[ForexFactory] failed from ${url}: ${err?.message || err}`);
    }
  }

  throw lastError;
}

/**
 * Fetch economic events with automatic fallback
 */
export async function fetchEconomicEvents(
  startDate: Date,
  endDate: Date
): Promise<EconomicEvent[]> {
  try {
    const apiKey = process.env.TRADING_ECONOMICS_API_KEY;

    // Try Trading Economics first if key is present
    if (apiKey) {
      try {
        const events = await fetchFromTradingEconomics(startDate, endDate);
        console.log(`✅ Fetched ${events.length} events from Trading Economics`);
        return events;
      } catch (error) {
        console.warn('⚠️ Trading Economics unavailable, falling back to Forex Factory');
      }
    } else {
      console.warn('⚠️ Trading Economics key missing, using Forex Factory fallback');
    }

    try {
      const events = await withRetry(() => fetchForexFactoryWithFallbacks(), 'ForexFactory', 5, 8000);
      console.log(`✅ Fetched ${events.length} events from Forex Factory`);
      return filterEventsByDateRange(events, startDate, endDate);
    } catch (fallbackError) {
      console.error('❌ All data sources failed');
      throw new Error('Unable to fetch economic calendar data from any source');
    }
  } catch (error) {
    console.error('fetchEconomicEvents failed:', (error as any)?.message || error);
    throw error;
  }
}

/**
 * Filter events by date range
 */
function filterEventsByDateRange(
  events: EconomicEvent[],
  startDate: Date,
  endDate: Date
): EconomicEvent[] {
  return events.filter(event => {
    const eventDate = new Date(event.date);
    return eventDate >= startDate && eventDate <= endDate;
  });
}

/**
 * Map impact level from Trading Economics importance
 */
function mapImpactLevel(importance: string): 'Low' | 'Medium' | 'High' {
  const level = importance?.toLowerCase();
  if (level === '3' || level === 'high') return 'High';
  if (level === '2' || level === 'medium') return 'Medium';
  return 'Low';
}

/**
 * Map Forex Factory impact string
 */
function mapForexFactoryImpact(impact: string): 'Low' | 'Medium' | 'High' {
  const level = impact?.toLowerCase();
  if (level === 'high' || level === 'red') return 'High';
  if (level === 'medium' || level === 'orange') return 'Medium';
  return 'Low';
}

/**
 * Map country to currency code
 */
function getCurrencyFromCountry(country: string): string {
  const currencyMap: Record<string, string> = {
    'United States': 'USD',
    'United Kingdom': 'GBP',
    'Euro Zone': 'EUR',
    'Germany': 'EUR',
    'France': 'EUR',
    'Italy': 'EUR',
    'Spain': 'EUR',
    'Japan': 'JPY',
    'China': 'CNY',
    'Australia': 'AUD',
    'Canada': 'CAD',
    'Switzerland': 'CHF',
    'New Zealand': 'NZD',
    'Sweden': 'SEK',
    'Norway': 'NOK',
    'Denmark': 'DKK',
    'Poland': 'PLN',
    'Turkey': 'TRY',
    'South Africa': 'ZAR',
    'Mexico': 'MXN',
    'Brazil': 'BRL',
    'India': 'INR',
    'South Korea': 'KRW',
    'Singapore': 'SGD',
    'Hong Kong': 'HKD',
  };

  return currencyMap[country] || 'USD';
}

/**
 * Get events for today
 */
export async function getTodayEvents(): Promise<EconomicEvent[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return fetchEconomicEvents(today, tomorrow);
}

/**
 * Get upcoming high-impact events (next 48 hours)
 */
export async function getUpcomingHighImpactEvents(): Promise<EconomicEvent[]> {
  const now = new Date();
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const events = await fetchEconomicEvents(now, in48Hours);
  
  return events
    .filter(event => event.impact === 'High')
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Test API connectivity
 */
export async function testApiConnectivity(): Promise<{
  tradingEconomics: boolean;
  forexFactory: boolean;
}> {
  const results = {
    tradingEconomics: false,
    forexFactory: false,
  };

  try {
    await fetchFromTradingEconomics(new Date(), new Date());
    results.tradingEconomics = true;
  } catch (error) {
    // Trading Economics unavailable
  }

  try {
    await fetchFromForexFactory();
    results.forexFactory = true;
  } catch (error) {
    // Forex Factory unavailable
  }

  return results;
}
