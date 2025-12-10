import axios from 'axios';

export interface EventNews {
  headline: string;
  url: string;
  source?: string;
  publishedAt?: string;
  summaryHint?: string;
}

/**
 * Fetch a single relevant news article for an economic event using Marketaux
 */
export async function fetchNewsForEvent(
  title: string,
  currency: string,
  eventDate: Date
): Promise<EventNews | null> {
  const apiKey = process.env.MARKETAUX_API_KEY;
  if (!apiKey) {
    console.warn('Marketaux API key not configured');
    return null;
  }

  try {
    const params: any = {
      api_token: apiKey,
      language: 'en',
      limit: 1,
      sort: 'published_desc',
      search: `${title} ${currency}`,
    };

    const response = await axios.get('https://api.marketaux.com/v1/news/all', {
      params,
      timeout: 8000,
      validateStatus: (status) => status >= 200 && status < 500, // handle 4xx gracefully
    });

    if (response.status >= 400) {
      console.warn(`Marketaux fetch skipped (status ${response.status}) for ${title}`);
      return null;
    }

    const article = response.data?.data?.[0];
    if (!article) return null;

    return {
      headline: article.title,
      url: article.url,
      source: article.source,
      publishedAt: article.published_at,
      summaryHint: article.description || article.snippet || article.title,
    };
  } catch (error: any) {
    console.warn('Marketaux fetch failed:', error?.message || error);
    return null;
  }
}
