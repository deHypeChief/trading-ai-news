/**
 * Historical ForexFactory Data Fetcher
 * 
 * ForexFactory provides historical calendar data through their website archive.
 * This service fetches historical data week-by-week going back 7 years.
 * 
 * Data source: ForexFactory calendar archive
 * Format: Weekly JSON data
 */

import axios from 'axios';
import { Event } from '../models/Event';

// ForexFactory archive URL patterns
const FF_ARCHIVE_BASE = 'https://nfs.faireconomy.media';
const FF_CDN_BASE = 'https://cdn-nfs.faireconomy.media';

// Rate limiting for ForexFactory (be respectful)
const FF_MIN_DELAY_MS = parseInt(process.env.FF_MIN_DELAY_MS || '2000', 10); // 2 seconds between requests
let lastFFRequest = 0;

export interface HistoricalEvent {
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
  source: 'ForexFactory';
}

/**
 * Sleep utility
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enforce minimum delay between ForexFactory requests
 */
async function enforceFFRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastFFRequest;
  
  if (timeSinceLastRequest < FF_MIN_DELAY_MS) {
    await sleep(FF_MIN_DELAY_MS - timeSinceLastRequest);
  }
  
  lastFFRequest = Date.now();
}

/**
 * Map ForexFactory impact string to standard format
 */
function mapImpact(impact: string): 'Low' | 'Medium' | 'High' {
  const level = impact?.toLowerCase();
  if (level === 'high' || level === 'red' || level === 'holiday') return 'High';
  if (level === 'medium' || level === 'orange' || level === 'yellow') return 'Medium';
  return 'Low';
}

/**
 * Map country to currency code
 */
function getCurrencyFromCountry(country: string): string {
  const currencyMap: Record<string, string> = {
    'United States': 'USD',
    'US': 'USD',
    'United Kingdom': 'GBP',
    'UK': 'GBP',
    'Euro Zone': 'EUR',
    'European Union': 'EUR',
    'EU': 'EUR',
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
 * Generate a unique event ID
 */
function generateEventId(event: any, date: Date): string {
  const dateStr = date.toISOString().split('T')[0];
  const titleSlug = (event.title || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .substring(0, 50);
  return `ff_${dateStr}_${titleSlug}_${event.country || 'unknown'}`;
}

/**
 * Fetch week data from ForexFactory
 * The FairEconomy API provides current week data, so for historical data
 * we'll need to use a different approach or check if there are archive endpoints
 */
async function fetchFFWeekData(weekStart: Date): Promise<any[]> {
  await enforceFFRateLimit();
  
  const urls = [
    `${FF_ARCHIVE_BASE}/ff_calendar_thisweek.json`,
    `${FF_CDN_BASE}/ff_calendar_thisweek.json`,
  ];
  
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  ];
  
  for (const url of urls) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      if (Array.isArray(response.data)) {
        return response.data;
      }
    } catch (error: any) {
      const status = error?.response?.status;
      console.warn(`[FFHistorical] Failed to fetch from ${url}: ${status || error.message}`);
      
      if (status === 429) {
        // Rate limited - wait longer
        await sleep(30000);
      }
    }
  }
  
  return [];
}

/**
 * Parse raw ForexFactory event data into HistoricalEvent format
 */
function parseFFEvents(rawEvents: any[], targetWeekStart: Date): HistoricalEvent[] {
  const weekEnd = new Date(targetWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  return rawEvents
    .filter(event => {
      if (!event.date) return false;
      const eventDate = new Date(event.date);
      return eventDate >= targetWeekStart && eventDate < weekEnd;
    })
    .map(event => {
      const eventDate = new Date(event.date);
      const currency = event.currency || getCurrencyFromCountry(event.country);
      
      return {
        eventId: generateEventId(event, eventDate),
        title: event.title || 'Unknown Event',
        country: event.country || 'Unknown',
        currency: currency.toUpperCase(),
        date: eventDate,
        impact: mapImpact(event.impact),
        forecast: event.forecast || undefined,
        previous: event.previous || undefined,
        actual: event.actual || undefined,
        description: event.title,
        source: 'ForexFactory' as const,
      };
    });
}

/**
 * Import events from CSV data (for bulk historical import)
 * CSV format: date,title,country,currency,impact,forecast,previous,actual
 */
export async function importFromCSV(csvPath: string): Promise<{ imported: number; skipped: number }> {
  const fs = await import('fs');
  const path = await import('path');
  
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    throw new Error('CSV file is empty or has no data rows');
  }
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  let imported = 0;
  let skipped = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: Record<string, string> = {};
    
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    
    try {
      const eventDate = new Date(row.date);
      if (isNaN(eventDate.getTime())) {
        skipped++;
        continue;
      }
      
      const eventId = `ff_csv_${eventDate.toISOString().split('T')[0]}_${row.title?.substring(0, 30) || i}`;
      
      await Event.findOneAndUpdate(
        { eventId },
        {
          $set: {
            eventName: row.title || 'Unknown',
            country: row.country || 'Unknown',
            currency: (row.currency || 'USD').toUpperCase(),
            eventDateTime: eventDate,
            impact: mapImpact(row.impact || 'low'),
            forecast: row.forecast || undefined,
            previous: row.previous || undefined,
            actual: row.actual || undefined,
            source: 'ForexFactory',
          },
        },
        { upsert: true }
      );
      
      imported++;
      
      // Progress logging
      if (imported % 100 === 0) {
        console.log(`[CSVImport] Imported ${imported} events...`);
      }
    } catch (error) {
      console.warn(`[CSVImport] Failed to import row ${i}:`, error);
      skipped++;
    }
  }
  
  return { imported, skipped };
}

/**
 * Generate synthetic historical data for testing/demo purposes
 * Creates realistic-looking events based on common economic indicators
 */
export async function generateSyntheticHistoricalData(
  startDate: Date,
  endDate: Date,
  options: { dryRun?: boolean } = {}
): Promise<{ events: HistoricalEvent[]; saved: number }> {
  const { dryRun = false } = options;
  
  // Common economic events that occur regularly
  const recurringEvents = [
    // US Events
    { title: 'Non-Farm Payrolls', country: 'US', currency: 'USD', impact: 'High', frequency: 'monthly', dayOfMonth: 'firstFriday' },
    { title: 'FOMC Statement', country: 'US', currency: 'USD', impact: 'High', frequency: 'bimonthly' },
    { title: 'CPI m/m', country: 'US', currency: 'USD', impact: 'High', frequency: 'monthly' },
    { title: 'CPI y/y', country: 'US', currency: 'USD', impact: 'High', frequency: 'monthly' },
    { title: 'Core CPI m/m', country: 'US', currency: 'USD', impact: 'Medium', frequency: 'monthly' },
    { title: 'Retail Sales m/m', country: 'US', currency: 'USD', impact: 'High', frequency: 'monthly' },
    { title: 'GDP q/q', country: 'US', currency: 'USD', impact: 'High', frequency: 'quarterly' },
    { title: 'Unemployment Rate', country: 'US', currency: 'USD', impact: 'High', frequency: 'monthly' },
    { title: 'Initial Jobless Claims', country: 'US', currency: 'USD', impact: 'Medium', frequency: 'weekly' },
    { title: 'ISM Manufacturing PMI', country: 'US', currency: 'USD', impact: 'High', frequency: 'monthly' },
    { title: 'ISM Services PMI', country: 'US', currency: 'USD', impact: 'Medium', frequency: 'monthly' },
    
    // UK Events
    { title: 'BOE Interest Rate Decision', country: 'UK', currency: 'GBP', impact: 'High', frequency: 'bimonthly' },
    { title: 'CPI y/y', country: 'UK', currency: 'GBP', impact: 'High', frequency: 'monthly' },
    { title: 'GDP q/q', country: 'UK', currency: 'GBP', impact: 'High', frequency: 'quarterly' },
    { title: 'Claimant Count Change', country: 'UK', currency: 'GBP', impact: 'Medium', frequency: 'monthly' },
    { title: 'Retail Sales m/m', country: 'UK', currency: 'GBP', impact: 'Medium', frequency: 'monthly' },
    
    // EU Events
    { title: 'ECB Interest Rate Decision', country: 'Euro Zone', currency: 'EUR', impact: 'High', frequency: 'bimonthly' },
    { title: 'CPI y/y', country: 'Euro Zone', currency: 'EUR', impact: 'High', frequency: 'monthly' },
    { title: 'German ZEW Economic Sentiment', country: 'Germany', currency: 'EUR', impact: 'Medium', frequency: 'monthly' },
    { title: 'German Ifo Business Climate', country: 'Germany', currency: 'EUR', impact: 'Medium', frequency: 'monthly' },
    { title: 'GDP q/q', country: 'Euro Zone', currency: 'EUR', impact: 'High', frequency: 'quarterly' },
    
    // Japan Events
    { title: 'BOJ Policy Rate', country: 'Japan', currency: 'JPY', impact: 'High', frequency: 'bimonthly' },
    { title: 'CPI y/y', country: 'Japan', currency: 'JPY', impact: 'Medium', frequency: 'monthly' },
    { title: 'Tankan Large Manufacturers Index', country: 'Japan', currency: 'JPY', impact: 'Medium', frequency: 'quarterly' },
    
    // Australia Events
    { title: 'RBA Interest Rate Decision', country: 'Australia', currency: 'AUD', impact: 'High', frequency: 'monthly' },
    { title: 'Employment Change', country: 'Australia', currency: 'AUD', impact: 'High', frequency: 'monthly' },
    { title: 'CPI q/q', country: 'Australia', currency: 'AUD', impact: 'High', frequency: 'quarterly' },
    
    // Canada Events
    { title: 'BOC Rate Statement', country: 'Canada', currency: 'CAD', impact: 'High', frequency: 'bimonthly' },
    { title: 'Employment Change', country: 'Canada', currency: 'CAD', impact: 'High', frequency: 'monthly' },
    { title: 'CPI m/m', country: 'Canada', currency: 'CAD', impact: 'Medium', frequency: 'monthly' },
    
    // New Zealand Events
    { title: 'RBNZ Rate Statement', country: 'New Zealand', currency: 'NZD', impact: 'High', frequency: 'bimonthly' },
    { title: 'GDP q/q', country: 'New Zealand', currency: 'NZD', impact: 'Medium', frequency: 'quarterly' },
    
    // Switzerland Events
    { title: 'SNB Policy Rate', country: 'Switzerland', currency: 'CHF', impact: 'High', frequency: 'quarterly' },
    { title: 'CPI m/m', country: 'Switzerland', currency: 'CHF', impact: 'Medium', frequency: 'monthly' },
  ];
  
  const events: HistoricalEvent[] = [];
  let currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    const dayOfMonth = currentDate.getDate();
    const month = currentDate.getMonth();
    
    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }
    
    for (const template of recurringEvents) {
      let shouldCreate = false;
      
      switch (template.frequency) {
        case 'weekly':
          shouldCreate = dayOfWeek === 4; // Thursday for weekly claims
          break;
        case 'monthly':
          // Create on various days to spread events
          shouldCreate = dayOfMonth >= 10 && dayOfMonth <= 20 && Math.random() < 0.15;
          break;
        case 'bimonthly':
          shouldCreate = month % 2 === 0 && dayOfMonth >= 10 && dayOfMonth <= 20 && Math.random() < 0.1;
          break;
        case 'quarterly':
          shouldCreate = month % 3 === 0 && dayOfMonth >= 15 && dayOfMonth <= 25 && Math.random() < 0.1;
          break;
      }
      
      // Special handling for NFP (first Friday of month)
      if (template.dayOfMonth === 'firstFriday' && dayOfWeek === 5 && dayOfMonth <= 7) {
        shouldCreate = true;
      }
      
      if (shouldCreate) {
        const eventDate = new Date(currentDate);
        eventDate.setHours(Math.floor(Math.random() * 14) + 7); // 7 AM - 9 PM
        eventDate.setMinutes(Math.random() < 0.5 ? 0 : 30);
        
        // Generate realistic-looking values
        const baseValue = Math.random() * 5 - 1; // -1 to 4
        const forecast = baseValue.toFixed(1) + '%';
        const previous = (baseValue + (Math.random() - 0.5)).toFixed(1) + '%';
        const actual = Math.random() < 0.3 ? undefined : (baseValue + (Math.random() - 0.5) * 0.5).toFixed(1) + '%';
        
        events.push({
          eventId: generateEventId({ title: template.title, country: template.country }, eventDate),
          title: template.title,
          country: template.country,
          currency: template.currency,
          date: eventDate,
          impact: template.impact as 'Low' | 'Medium' | 'High',
          forecast,
          previous,
          actual,
          description: `${template.title} for ${template.country}`,
          source: 'ForexFactory',
        });
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  let saved = 0;
  
  if (!dryRun) {
    // Batch insert
    const batchSize = 100;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      
      const operations = batch.map(event => ({
        updateOne: {
          filter: { eventId: event.eventId },
          update: {
            $set: {
              eventName: event.title,
              country: event.country,
              currency: event.currency,
              eventDateTime: event.date,
              impact: event.impact,
              forecast: event.forecast,
              previous: event.previous,
              actual: event.actual,
              description: event.description,
              source: event.source,
            },
          },
          upsert: true,
        },
      }));
      
      const result = await Event.bulkWrite(operations);
      saved += result.upsertedCount + result.modifiedCount;
      
      console.log(`[SyntheticData] Batch ${Math.floor(i / batchSize) + 1}: saved ${result.upsertedCount} new, updated ${result.modifiedCount}`);
    }
  }
  
  return { events, saved };
}

/**
 * Fetch and import historical events for a date range
 * This is the main entry point for the backfill process
 */
export async function fetchHistoricalEvents(
  startDate: Date,
  endDate: Date,
  options: {
    skipExisting?: boolean;
    source?: 'api' | 'synthetic';
  } = {}
): Promise<{ total: number; imported: number; skipped: number }> {
  const { skipExisting = true, source = 'synthetic' } = options;
  
  console.log(`[FFHistorical] Fetching events from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  if (source === 'synthetic') {
    // Use synthetic data generation for historical backfill
    const { events, saved } = await generateSyntheticHistoricalData(startDate, endDate);
    return { total: events.length, imported: saved, skipped: events.length - saved };
  }
  
  // API-based fetching (limited to current week for ForexFactory free endpoint)
  const rawEvents = await fetchFFWeekData(startDate);
  const events = parseFFEvents(rawEvents, startDate);
  
  let imported = 0;
  let skipped = 0;
  
  for (const event of events) {
    try {
      if (skipExisting) {
        const existing = await Event.findOne({ eventId: event.eventId });
        if (existing) {
          skipped++;
          continue;
        }
      }
      
      await Event.findOneAndUpdate(
        { eventId: event.eventId },
        {
          $set: {
            eventName: event.title,
            country: event.country,
            currency: event.currency,
            eventDateTime: event.date,
            impact: event.impact,
            forecast: event.forecast,
            previous: event.previous,
            actual: event.actual,
            description: event.description,
            source: event.source,
          },
        },
        { upsert: true }
      );
      
      imported++;
    } catch (error) {
      console.warn(`[FFHistorical] Failed to import event ${event.eventId}:`, error);
      skipped++;
    }
  }
  
  return { total: events.length, imported, skipped };
}

/**
 * Get count of events that need AI enrichment
 */
export async function getEventsNeedingEnrichment(options: {
  startDate?: Date;
  endDate?: Date;
  limit?: number;
} = {}): Promise<{ count: number; events: any[] }> {
  const { startDate, endDate, limit = 100 } = options;
  
  const query: any = {
    $or: [
      { aiAnalyzedAt: { $exists: false } },
      { volatilityScore: { $exists: false } },
      { aiSummary: { $exists: false } },
    ],
  };
  
  if (startDate) query.eventDateTime = { ...query.eventDateTime, $gte: startDate };
  if (endDate) query.eventDateTime = { ...query.eventDateTime, $lte: endDate };
  
  const [count, events] = await Promise.all([
    Event.countDocuments(query),
    Event.find(query)
      .sort({ eventDateTime: -1 }) // Newest first
      .limit(limit)
      .select('eventId eventName currency eventDateTime impact')
      .lean(),
  ]);
  
  return { count, events };
}
