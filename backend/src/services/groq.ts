import Groq from 'groq-sdk';
import { Event } from '../models/Event';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

let groqRateLimitedUntil: number | null = null;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isGroqRateLimited(): boolean {
  return groqRateLimitedUntil !== null && groqRateLimitedUntil > Date.now();
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

async function groqChatWithRetry(
  payload: Parameters<typeof groq.chat.completions.create>[0],
  attempts = 3,
  baseDelayMs = 60_000
) {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      if (isGroqRateLimited()) {
        const err: any = new Error('GROQ_RATE_LIMIT');
        err.code = 'GROQ_RATE_LIMIT';
        err.until = groqRateLimitedUntil;
        throw err;
      }
      return await groq.chat.completions.create(payload);
    } catch (err: any) {
      lastError = err;
      const code = err?.error?.code || err?.response?.data?.error?.code || err?.code;
      const isRateLimit = code === 'rate_limit_exceeded' || code === 'GROQ_RATE_LIMIT';
      if (!isRateLimit || i === attempts - 1) break;
      const delay = baseDelayMs * (i + 1);
      console.warn(`Groq rate limit hit; retrying in ${Math.round(delay / 1000)}s (attempt ${i + 2}/${attempts})`);
      groqRateLimitedUntil = Date.now() + delay;
      await sleep(delay);
    }
  }
  const code = lastError?.error?.code || lastError?.response?.data?.error?.code || lastError?.code;
  if (code === 'rate_limit_exceeded' || code === 'GROQ_RATE_LIMIT') {
    groqRateLimitedUntil = Date.now() + 10 * 60 * 1000;
    const err: any = new Error('GROQ_RATE_LIMIT');
    err.code = 'GROQ_RATE_LIMIT';
    err.until = groqRateLimitedUntil;
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

/**
 * Analyze economic event relevance and predict volatility using Groq GPT with memory
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

    const completion = await groqChatWithRetry({
      messages: [
        {
          role: 'system',
          content: 'You are a professional forex and indices trading analyst with deep knowledge of historical market reactions. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('No response from Groq AI');
    }

    const parsed = JSON.parse(response) as EventRelevanceScore;

    // Validate response structure
    if (
      typeof parsed.relevanceScore !== 'number' ||
      !['Low', 'Medium', 'High', 'Extreme'].includes(parsed.volatilityPrediction)
    ) {
      throw new Error('Invalid AI response format');
    }

    return parsed;
  } catch (error: any) {
    console.error('Groq AI analysis failed:', error.message);

    // Fallback to rule-based scoring
    return generateFallbackScore(event);
  }
}

/**
 * Infer detailed volatility fields from Groq GPT with memory (volatilityScore 1-5, window, drivers, bias, executionNotes)
 */
export interface GroqVolatilityOutput {
  volatilityScore: number; // 1-5
  volatilityWindow: 'Pre-Event' | 'At-Release' | 'Post-Release' | 'Extended';
  drivers: string[];
  directionalBias: 'Bullish' | 'Bearish' | 'Neutral' | 'Two-Way';
  executionNotes: string;
}

export async function inferVolatility(event: EventRelevanceInput): Promise<GroqVolatilityOutput> {
  try {
    const pastEventsContext = await getPastEventsContext(event.currency, 3); // Limit to 3 events

    const prompt = `Output JSON for volatility analysis:
{"volatilityScore":1-5,"volatilityWindow":"Pre-Event|At-Release|Post-Release|Extended","drivers":["reason"],"directionalBias":"Bullish|Bearish|Neutral|Two-Way","executionNotes":"action"}

Event: ${event.title} (${event.impact}, ${event.currency})
Prev: ${event.previous || 'N/A'} | Fcst: ${event.forecast || 'N/A'}
${event.description ? event.description.slice(0, 100) : ''}
${pastEventsContext}`;

    const completion = await groqChatWithRetry({
      messages: [
        { role: 'system', content: 'You are a macro volatility analyst with historical context. Output JSON only.' },
        { role: 'user', content: prompt },
      ],
     model: 'llama-3.3-70b-versatile',
      temperature: 0.35,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) throw new Error('No response from Groq AI');
    const parsed = JSON.parse(response) as GroqVolatilityOutput;

    // Basic validation
    if (typeof parsed.volatilityScore !== 'number' || parsed.volatilityScore < 1 || parsed.volatilityScore > 5) {
      throw new Error('Invalid volatilityScore');
    }

    return parsed;
  } catch (err) {
    console.warn('Groq AI volatility inference failed, falling back to rule-based mapping', err?.message || err);

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
    const completion = await groqChatWithRetry({
      messages: [
        {
          role: 'system',
          content: 'You are a concise macro/markets summarizer for traders. Respond with a short paragraph only.',
        },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.35,
      max_tokens: 360,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || '';
    return { summary };
  } catch (error) {
    console.error('Groq AI summarization failed:', (error as any)?.message || error);
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
    const completion = await groqChatWithRetry({
      messages: [
        { role: 'system', content: 'You are a concise macro analyst for FX/indices. Keep to 70-80 words.' },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.35,
      max_tokens: 360,
    });

    return completion.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('Groq AI in-depth analysis failed:', (error as any)?.message || error);
    return '';
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
 * Check if Groq API is available
 */
export async function checkGroqHealth(): Promise<boolean> {
  try {
    const completion = await groqChatWithRetry({
      messages: [{ role: 'user', content: 'ping' }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 5,
    });
    return !!completion.choices[0];
  } catch (error) {
    console.error('Groq health check failed:', error);
    return false;
  }
}
