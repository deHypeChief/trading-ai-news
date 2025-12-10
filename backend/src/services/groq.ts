import Groq from 'groq-sdk';

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
 * Analyze economic event relevance and predict volatility using Groq AI
 */
export async function analyzeEventRelevance(
  event: EventRelevanceInput
): Promise<EventRelevanceScore> {
  try {
    const prompt = `You are an expert forex and indices trading analyst. Analyze this economic event and provide:
1. Relevance score (0-100) for forex/indices traders
2. Volatility prediction (Low/Medium/High/Extreme)
3. Brief reasoning (max 100 words)
4. Trading recommendation (max 50 words)

Event Details:
- Title: ${event.title}
- Description: ${event.description || 'N/A'}
- Currency: ${event.currency}
- Impact Level: ${event.impact}
- Previous: ${event.previous || 'N/A'}
- Forecast: ${event.forecast || 'N/A'}
- Actual: ${event.actual || 'N/A'}

Respond in this exact JSON format:
{
  "relevanceScore": <number 0-100>,
  "volatilityPrediction": "<Low|Medium|High|Extreme>",
  "reasoning": "<brief explanation>",
  "tradingRecommendation": "<actionable advice>"
}`;

    const completion = await groqChatWithRetry({
      messages: [
        {
          role: 'system',
          content: 'You are a professional forex and indices trading analyst. Always respond with valid JSON only.',
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
 * Generate a concise summary (2-4 sentences) for a news snippet or event description.
 */
export async function summarizeTextShort(content: string, title?: string): Promise<SummaryResult> {
  const safeContent = content?.trim() || '';
  if (!safeContent) return { summary: '' };

  const prompt = `Summarize the following market/economic news in 2-4 sentences (60-90 words). Keep it crisp, trader-focused, and avoid fluff.
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
      temperature: 0.4,
      max_tokens: 220,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || '';
    return { summary };
  } catch (error) {
    console.error('Groq summarization failed:', (error as any)?.message || error);
    return { summary: safeContent.slice(0, 400) };
  }
}

/**
 * Generate a medium-length in-depth analysis with historical color (120-180 words)
 */
export async function generateInDepthAnalysis(event: InDepthAnalysisInput): Promise<string> {
  const contentBlock = [event.description, event.newsSummary].filter(Boolean).join('\n');
  const prompt = `You are a senior FX strategist. Write a medium-length (120-180 words) in-depth analysis for traders.
Keep it factual, actionable, and avoid long-winded prose. Include:
- What happened and why the market moved.
- Any notable surprises vs. forecast.
- How this typically impacts ${event.currency} given historical reactions.
- A balanced take (bullish/bearish drivers) without being absolute or adding disclaimers like "Treat this as context, not a certainty."

Event
- Title: ${event.title}
- Impact: ${event.impact}
- Currency: ${event.currency}
- Previous: ${event.previous || 'N/A'} | Forecast: ${event.forecast || 'N/A'} | Actual: ${event.actual || 'N/A'}
- News headline: ${event.newsHeadline || 'N/A'}
- Notes: ${contentBlock || 'N/A'}

Respond with one paragraph.`;

  try {
    const completion = await groqChatWithRetry({
      messages: [
        { role: 'system', content: 'You are a concise macro analyst for FX/indices. Keep to 120-180 words.' },
        { role: 'user', content: prompt },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.35,
      max_tokens: 360,
    });

    return completion.choices[0]?.message?.content?.trim() || '';
  } catch (error) {
    console.error('Groq in-depth analysis failed:', (error as any)?.message || error);
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
