/**
 * scripts/list-genai-models.ts
 *
 * Usage:
 *   GEMINI_API_KEY=your_key_here bun run scripts/list-genai-models.ts
 *
 * Prints available Google GenAI models as JSON and a short readable list.
 */
import { GoogleGenAI } from '@google/genai';

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Missing GEMINI_API_KEY environment variable.');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Also try the REST API directly since SDK may not return full list
    console.log('Fetching models via REST API...');
    const restUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const restResponse = await fetch(restUrl);
    const restData = await restResponse.json() as any;
    console.log('REST API response:', JSON.stringify(restData, null, 2));

    // Print readable list from REST response
    const models = restData?.models || [];
    console.log('\n=== Available GenAI Models ===');
    for (const m of models) {
      const name = m.name || '<unknown>';
      const displayName = m.displayName || '';
      const methods = m.supportedGenerationMethods?.join(', ') || 'N/A';
      console.log(`- ${name}`);
      console.log(`  Display: ${displayName}`);
      console.log(`  Methods: ${methods}`);
      console.log('');
    }

    // Highlight models that support generateContent
    console.log('=== Models supporting generateContent ===');
    for (const m of models) {
      if (m.supportedGenerationMethods?.includes('generateContent')) {
        console.log(`✓ ${m.name}`);
      }
    }
  } catch (err: any) {
    console.error('Failed to list GenAI models:', (err?.message) || err);
    process.exit(2);
  }
}

main();
