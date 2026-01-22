import { GoogleGenAI } from '@google/genai';
import { Event } from '../models/Event';
import { consumeGenaiToken, isGenaiRateLimited, setGenaiCooldown } from './genaiRateLimiter';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get relevant past events for memory context
 */
async function getPastEventsContext(currency: string, limit = 2): Promise<string> {
  try {
    const pastEvents = await Event.find({
      currency,
      aiAnalyzedAt: { $exists: true },
      eventDateTime: { $lt: new Date() }
    })
      .sort({ eventDateTime: -1 })
      .limit(limit)
      .select('eventName aiReasoning tradingRecommendation volatilityPrediction realizedPipMove')
      .lean();

    if (pastEvents.length === 0) return '';

    const context = pastEvents.map(event =>
      `${event.eventName}: ${event.volatilityPrediction} volatility, ${event.realizedPipMove ? event.realizedPipMove + ' pips' : ''}`
    ).join('; ');

    return pastEvents.length ? `\nHistorical: ${context}` : '';
  } catch (error) {
    console.warn('Failed to fetch past events context:', error);
    return '';
  }
}

async function genaiGenerateWithRetry(
  model: string,
  contents: any[],
  config: any,
  attempts = 3,
  baseDelayMs = 60_000,
  skipRateLimitCheck = false
) {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      if (!skipRateLimitCheck) {
        if (await isGenaiRateLimited()) {
          const err: any = new Error('GENAI_RATE_LIMIT');
          err.code = 'GENAI_RATE_LIMIT';
          err.until = Date.now() + baseDelayMs;
          throw err;
        }
        const allowed = await consumeGenaiToken();
        if (!allowed) {
          const err: any = new Error('GENAI_RATE_LIMIT');
          err.code = 'GENAI_RATE_LIMIT';
          throw err;
        }
      }
      return await ai.models.generateContent({
        model,
        contents,
        config,
      });
    } catch (err: any) {
      lastError = err;

      // If model is not found (non-public model), attempt a fallback to 'gemini-2.0-flash'
      const isNotFound = err?.code === 404 || err?.status === 404 || err?.status === 'NOT_FOUND' || (err?.message && String(err.message).toLowerCase().includes('not found'));
      if (isNotFound && model !== 'gemini-2.0-flash') {
        try {
          console.warn(`Model ${model} not found; falling back to gemini-2.0-flash`);
          if (!skipRateLimitCheck) {
            const allowed = await consumeGenaiToken();
            if (!allowed) {
              const rateErr: any = new Error('GENAI_RATE_LIMIT');
              rateErr.code = 'GENAI_RATE_LIMIT';
              throw rateErr;
            }
          }
          return await ai.models.generateContent({ model: 'gemini-2.0-flash', contents, config });
        } catch (fallbackErr: any) {
          lastError = fallbackErr;
        }
      }

      const code = err?.code || err?.status;
      const isRateLimit = code === 429 || code === 'RESOURCE_EXHAUSTED' || code === 'GENAI_RATE_LIMIT';
      
      // If Google returned a 429, set cooldown to prevent further requests
      if ((code === 429 || code === 'RESOURCE_EXHAUSTED') && err?.code !== 'GENAI_RATE_LIMIT') {
        console.warn('[GenAI] Google API rate limit hit, setting 10s cooldown');
        await setGenaiCooldown(10000);
      }
      
      if (!isRateLimit || i === attempts - 1) break;
      const delay = baseDelayMs * (i + 1);
      console.warn(`GenAI rate limit hit; retrying in ${Math.round(delay / 1000)}s (attempt ${i + 2}/${attempts})`);
      await sleep(delay);
    }
  }
  const code = lastError?.code || lastError?.status;
  if (code === 429 || code === 'RESOURCE_EXHAUSTED' || code === 'GENAI_RATE_LIMIT') {
    // Cooldown handled by rate limiter
    const err: any = new Error('GENAI_RATE_LIMIT');
    err.code = 'GENAI_RATE_LIMIT';
    throw err;
  }
  throw lastError;
}

async function genaiGenerateStreamWithRetry(
  model: string,
  contents: any[],
  config: any,
  attempts = 3,
  baseDelayMs = 60_000
) {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      if (await isGenaiRateLimited()) {
        const err: any = new Error('GENAI_RATE_LIMIT');
        err.code = 'GENAI_RATE_LIMIT';
        err.until = Date.now() + baseDelayMs;
        throw err;
      }
      const allowed = await consumeGenaiToken();
      if (!allowed) {
        const err: any = new Error('GENAI_RATE_LIMIT');
        err.code = 'GENAI_RATE_LIMIT';
        throw err;
      }
      return await ai.models.generateContentStream({
        model,
        contents,
        config,
      });
    } catch (err: any) {
      lastError = err;

      // If model is not found, attempt fallback to 'gemini-2.0-flash' using non-stream generate
      const isNotFound = err?.code === 404 || err?.status === 404 || err?.status === 'NOT_FOUND' || (err?.message && String(err.message).toLowerCase().includes('not found'));
      if (isNotFound && model !== 'gemini-2.0-flash') {
        try {
          console.warn(`Model ${model} not found for stream API; falling back to gemini-2.0-flash (non-stream)`);
          const allowed = await consumeGenaiToken();
          if (!allowed) {
            const rateErr: any = new Error('GENAI_RATE_LIMIT');
            rateErr.code = 'GENAI_RATE_LIMIT';
            throw rateErr;
          }
          return await ai.models.generateContent({ model: 'gemini-2.0-flash', contents, config });
        } catch (fallbackErr: any) {
          lastError = fallbackErr;
        }
      }

      const code = err?.code || err?.status;
      const isRateLimit = code === 429 || code === 'RESOURCE_EXHAUSTED' || code === 'GENAI_RATE_LIMIT';
      
      // If Google returned a 429, set cooldown to prevent further requests
      if ((code === 429 || code === 'RESOURCE_EXHAUSTED') && err?.code !== 'GENAI_RATE_LIMIT') {
        console.warn('[GenAI] Google API rate limit hit (stream), setting 10s cooldown');
        await setGenaiCooldown(10000);
      }
      
      if (!isRateLimit || i === attempts - 1) break;
      const delay = baseDelayMs * (i + 1);
      console.warn(`GenAI rate limit hit; retrying in ${Math.round(delay / 1000)}s (attempt ${i + 2}/${attempts})`);
      await sleep(delay);
    }
  }
  const code = lastError?.code || lastError?.status;
  if (code === 429 || code === 'RESOURCE_EXHAUSTED' || code === 'GENAI_RATE_LIMIT') {
    const err: any = new Error('GENAI_RATE_LIMIT');
    err.code = 'GENAI_RATE_LIMIT';
    throw err;
  }
  throw lastError;
}

export interface EventRelevanceInput {
  title: string;
  description?: string;
  currency: string;
  impact: 'Low' | 'Medium' | 'High';
  previous?: string;
  forecast?: string;
  actual?: string;
}

export interface EventRelevanceScore {
  relevanceScore: number; // 0-100
  volatilityPrediction: 'Low' | 'Medium' | 'High' | 'Extreme';
  reasoning: string;
  tradingRecommendation: string;
}

export interface SummaryResult {
  summary: string;
}

export interface InDepthAnalysisInput extends EventRelevanceInput {
  newsHeadline?: string;
  newsSummary?: string;
}

export interface StructuredAnalysisInput extends EventRelevanceInput {
  newsHeadline?: string;
  newsSummary?: string;
}

export interface StructuredAnalysisResult {
  anticipatedVolatility: number; // 1-10
  whatThisMeans: string;
  marketImpact: string;
  crossAssetImpact: string;
}

/**
 * Analyze economic event relevance and predict volatility using Google Gemini with memory
 */
export async function analyzeEventRelevance(
  event: EventRelevanceInput
): Promise<EventRelevanceScore> {
  try {
    const pastEventsContext = await getPastEventsContext(event.currency);

    const prompt = `Analyze this economic event for forex traders. Output JSON only:
{
  "relevanceScore": 0-100,
  "volatilityPrediction": "Low|Medium|High|Extreme",
  "reasoning": "brief explanation",
  "tradingRecommendation": "actionable advice"
}

Event: ${event.title} (${event.impact} impact, ${event.currency})
Previous: ${event.previous || 'N/A'} | Forecast: ${event.forecast || 'N/A'} | Actual: ${event.actual || 'N/A'}
${event.description ? `Description: ${event.description.slice(0, 150)}` : ''}
${pastEventsContext}`;

    const contents = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const config = {
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 500,
      },
      responseMimeType: 'application/json',
    };

    const response = await genaiGenerateWithRetry('gemini-2.0-flash', contents, config, 3, 60_000, false);

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No response from Google Gemini');
    }

    const parsed = JSON.parse(text) as EventRelevanceScore;

    // Validate response structure
    if (
      typeof parsed.relevanceScore !== 'number' ||
      !['Low', 'Medium', 'High', 'Extreme'].includes(parsed.volatilityPrediction)
    ) {
      throw new Error('Invalid AI response format');
    }

    return parsed;
  } catch (error: any) {
    console.error('Google Gemini analysis failed:', error.message);

    // Fallback to rule-based scoring
    return generateFallbackScore(event);
  }
}

/**
 * Infer detailed volatility fields from Google Gemini with memory (volatilityScore 1-5, window, drivers, bias, executionNotes)
 */
export interface GenaiVolatilityOutput {
  volatilityScore: number; // 1-5
  volatilityWindow: 'Pre-Event' | 'At-Release' | 'Post-Release' | 'Extended';
  drivers: string[];
  directionalBias: 'Bullish' | 'Bearish' | 'Neutral' | 'Two-Way';
  executionNotes: string;
}

export async function inferVolatility(event: EventRelevanceInput): Promise<GenaiVolatilityOutput> {
  try {
    const pastEventsContext = await getPastEventsContext(event.currency, 3); // Limit to 3 events

    const prompt = `Output JSON for volatility analysis:
{"volatilityScore":1-5,"volatilityWindow":"Pre-Event|At-Release|Post-Release|Extended","drivers":["reason"],"directionalBias":"Bullish|Bearish|Neutral|Two-Way","executionNotes":"action"}

Event: ${event.title} (${event.impact}, ${event.currency})
Prev: ${event.previous || 'N/A'} | Fcst: ${event.forecast || 'N/A'}
${event.description ? event.description.slice(0, 100) : ''}
${pastEventsContext}`;

    const contents = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const config = {
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 400,
      },
      responseMimeType: 'application/json',
    };

    const response = await genaiGenerateWithRetry('gemini-2.0-flash', contents, config, 3, 60_000, false);

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Google Gemini');
    const parsed = JSON.parse(text) as GenaiVolatilityOutput;

    // Basic validation
    if (typeof parsed.volatilityScore !== 'number' || parsed.volatilityScore < 1 || parsed.volatilityScore > 5) {
      throw new Error('Invalid volatilityScore');
    }

    return parsed;
  } catch (err) {
    console.warn('Google Gemini volatility inference failed, falling back to rule-based mapping', err?.message || err);

    // Fallback: map textual volatilityPrediction to numeric
    const fallback = await analyzeEventRelevance(event);
    const mapping: any = { Low: 1, Medium: 3, High: 4, Extreme: 5 };
    const score = mapping[fallback.volatilityPrediction] || 3;

    return {
      volatilityScore: score,
      volatilityWindow: 'At-Release',
      drivers: [fallback.reasoning || 'Rule-based fallback'],
      directionalBias: 'Two-Way',
      executionNotes: fallback.tradingRecommendation || 'Monitor event',
    };
  }
}

/**
 * Generate a concise summary (2-4 sentences) for a news snippet or event description.
 */
export async function summarizeTextShort(content: string, title?: string): Promise<SummaryResult> {
  const safeContent = content?.trim() || '';
  if (!safeContent) return { summary: '' };

  const prompt = `Summarize the following market/economic news in 2-4 sentences (60-90 words). Include specific trading measures/recommendations for traders. Keep it crisp, trader-focused, and actionable.
Title: ${title || 'N/A'}
Content: ${safeContent}`;

  try {
    const contents = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const config = {
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 360,
      },
      tools: [{ googleSearch: {} }],
    };

    const response = await genaiGenerateWithRetry('gemini-2.0-flash', contents, config, 3, 60_000, false);

    const summary = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    return { summary };
  } catch (error) {
    console.error('Google Gemini summarization failed:', (error as any)?.message || error);
    return { summary: safeContent.slice(0, 400) };
  }
}

/**
 * Generate a medium-length in-depth analysis with historical color (120-180 words)
 */
export async function generateInDepthAnalysis(event: InDepthAnalysisInput): Promise<string> {
  const pastEventsContext = await getPastEventsContext(event.currency);

  const contentBlock = [event.description, event.newsSummary].filter(Boolean).join('\n');
  const prompt = `Write a concise analysis (70-80 words) for traders:
- What happened and market reaction
- Surprises vs. forecast  
- Historical impact on ${event.currency}
- Balanced outlook

Event: ${event.title} (${event.impact} impact)
Previous: ${event.previous || 'N/A'} | Forecast: ${event.forecast || 'N/A'} | Actual: ${event.actual || 'N/A'}
News: ${event.newsHeadline || 'N/A'}
Notes: ${contentBlock ? contentBlock.slice(0, 200) : 'N/A'}
${pastEventsContext}`;

  try {
    const contents = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const config = {
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 360,
      },
      tools: [{ googleSearch: {} }],
    };

    const response = await genaiGenerateWithRetry('gemini-2.0-flash', contents, config, 3, 60_000, false);

    return response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } catch (error) {
    console.error('Google Gemini in-depth analysis failed:', (error as any)?.message || error);
    return '';
  }
}

/**
 * Generate structured analysis for SaaS dashboard with specific Markdown format
 */
export async function generateStructuredAnalysis(event: StructuredAnalysisInput): Promise<StructuredAnalysisResult> {
  const pastEventsContext = await getPastEventsContext(event.currency);

  const contentBlock = [event.description, event.newsSummary].filter(Boolean).join('\n');
  const prompt = `Analyze this economic event for forex traders.
  Role: You are a Fundamental/macro analyst at morgan stanley bank helping push fundamental analysis updates to technical based traders. your language should be in a friendly and easy/actionable for novice to fundamental/ global macros. Your output must be strictly formatted in Markdown for a SaaS Dashboard (AN AI powered economic calender )
Formatting Rules:

ZERO Conversational Filler: Do not say "Here is your analysis," "I hope this helps," or "Would you like more?"
Structure: Use only the headers and bullet points defined below.
No Technical Jargon: Never use "Orderblocks," "FVG," or "Liquidity."
Anticipated Volatility Logic (The 10/10 Rule):

Calculate impact based on the Dollar (DXY).
this should be based on the probability of the dollar expanding or consolidating based on the relative economic events/conditions at that date
   Output JSON only with this exact structure:
{
  "anticipatedVolatility": number (1-10 scale based on DXY impact probability),
  "whatThisMeans": "2-sentence explanation of what the data means for the economy in plain English",
  "marketImpact": "Major currency affected (EURO/POUND/YEN etc based on event) with direction and reason",
  "crossAssetImpact": "Effects on MAJORS, GOLD, STOCKS in a single paragraph: direction and reason"
}

Focus on fundamental/macro analysis for novice traders. Volatility scale: 1=minimal DXY impact, 10=extreme DXY expansion/consolidation.

Event: ${event.title} (${event.impact} impact, ${event.currency})
Previous: ${event.previous || 'N/A'} | Forecast: ${event.forecast || 'N/A'} | Actual: ${event.actual || 'N/A'}
News: ${event.newsHeadline || 'N/A'}
Notes: ${contentBlock ? contentBlock.slice(0, 300) : 'N/A'}
${pastEventsContext}`;

  try {
    const contents = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const config = {
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
      },
      responseMimeType: 'application/json',
    };

    const response = await genaiGenerateWithRetry('gemini-2.0-flash', contents, config, 3, 60_000, true);

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('No response from Google Gemini');
    }

    console.log('Raw Gemini response:', text); // Debug log

    let parsed = JSON.parse(text);
    
    // Handle case where Gemini returns an array
    if (Array.isArray(parsed)) {
      parsed = parsed[0];
    }

    // Ensure it's the expected object structure
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid response structure');
    }

    const result = parsed as StructuredAnalysisResult;

    // Validate response structure
    if (
      typeof result.anticipatedVolatility !== 'number' ||
      result.anticipatedVolatility < 1 || result.anticipatedVolatility > 10 ||
      !result.whatThisMeans || !result.marketImpact || !result.crossAssetImpact
    ) {
      throw new Error('Invalid structured analysis response format');
    }

    return result;
  } catch (error: any) {
    console.error('Google Gemini structured analysis failed:', error?.message || error);
    
    // If rate limited, re-throw so callers don't save fallback to DB
    if (error?.code === 'GENAI_RATE_LIMIT' || error?.code === 429 || error?.code === 'RESOURCE_EXHAUSTED') {
      const err: any = new Error('GENAI_RATE_LIMIT');
      err.code = 'GENAI_RATE_LIMIT';
      err.isFallback = false;
      throw err;
    }
    
    // For other errors, return fallback but mark it as such
    const fallback: StructuredAnalysisResult & { isFallback?: boolean } = {
      anticipatedVolatility: 5,
      whatThisMeans: 'This economic event may influence market sentiment and currency movements.',
      marketImpact: `${event.currency} may experience volatility based on the event outcome.`,
      crossAssetImpact: 'The event could have ripple effects across major currency pairs, commodities, and equity markets depending on the surprise factor.',
    };
    (fallback as any).isFallback = true;
    return fallback;
  }
}

/**
 * Batch analyze multiple events efficiently
 */

export async function batchAnalyzeEvents(
  events: EventRelevanceInput[]
): Promise<Map<string, EventRelevanceScore>> {
  const results = new Map<string, EventRelevanceScore>();

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const promises = batch.map((event) =>
      analyzeEventRelevance(event)
        .then(score => ({ event: event.title, score }))
        .catch(err => {
          console.error(`Failed to analyze ${event.title}:`, err);
          return { event: event.title, score: generateFallbackScore(event) };
        })
    );

    const batchResults = await Promise.all(promises);
    batchResults.forEach(({ event, score }) => {
      results.set(event, score);
    });

    // Small delay between batches
    if (i + batchSize < events.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Generate fallback score when AI fails (rule-based)
 */
function generateFallbackScore(event: EventRelevanceInput): EventRelevanceScore {
  let relevanceScore = 50; // Base score

  // Adjust based on impact level
  if (event.impact === 'High') relevanceScore += 30;
  else if (event.impact === 'Medium') relevanceScore += 15;

  // Adjust based on currency (major pairs)
  const majorCurrencies = ['USD', 'EUR', 'GBP', 'JPY'];
  if (majorCurrencies.includes(event.currency)) relevanceScore += 10;

  // Cap at 100
  relevanceScore = Math.min(100, relevanceScore);

  // Determine volatility
  let volatilityPrediction: 'Low' | 'Medium' | 'High' | 'Extreme' = 'Medium';
  if (relevanceScore >= 80) volatilityPrediction = 'Extreme';
  else if (relevanceScore >= 65) volatilityPrediction = 'High';
  else if (relevanceScore >= 45) volatilityPrediction = 'Medium';
  else volatilityPrediction = 'Low';

  return {
    relevanceScore,
    volatilityPrediction,
    reasoning: `Rule-based analysis: ${event.impact} impact ${event.currency} event. AI analysis unavailable.`,
    tradingRecommendation: 'Monitor price action around event release. Set appropriate stop losses.',
  };
}

/**
 * Check if Google Gemini API is available
 */
export async function checkGenaiHealth(): Promise<boolean> {
  try {
    const contents = [
      {
        role: 'user',
        parts: [{ text: 'ping' }],
      },
    ];

    const config = {
      generationConfig: {
        maxOutputTokens: 5,
      },
    };

    const response = await genaiGenerateWithRetry('gemini-2.0-flash', contents, config, 3, 60_000, false);
    return !!response.candidates?.[0];
  } catch (error) {
    console.error('Google Gemini health check failed:', error);
    return false;
  }
}

/**
 * List available GenAI models (useful for debugging when a model is unavailable)
 */
export async function listGenaiModels(): Promise<any[]> {
  try {
    // The GoogleGenAI client exposes listModels which returns available models
    const models = await ai.listModels();
    return models;
  } catch (error) {
    console.error('Failed to list GenAI models:', (error as any)?.message || error);
    throw error;
  }
}

export { isGenaiRateLimited };
