import { GoogleGenerativeAI } from '@google/generative-ai';

(async () => {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    console.log('Testing direct Gemini API call...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'You are a concise macro/markets summarizer for traders. Respond with a short paragraph only.\n\nSummarize the following market/economic news in 2-4 sentences (60-90 words). Include specific trading measures/recommendations for traders. Keep it crisp, trader-focused, and actionable.\nTitle: President Trump Speaks\nContent: USD/JPY Outlook: Trump Trade Sparks Sharp Rally Against Yen',
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 220,
      },
    });

    const summary = result.response.text().trim();
    console.log('Direct API result:', summary);
    console.log('Length:', summary.length);

  } catch (e) {
    console.log('Direct API Error:', e.message);
    console.log('Full error:', e);
  }
})();