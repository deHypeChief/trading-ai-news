import Groq from 'groq-sdk';

(async () => {
  try {
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    console.log('Testing direct Groq API call...');
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are a concise macro/markets summarizer for traders. Respond with a short paragraph only.',
        },
        {
          role: 'user',
          content: 'Summarize the following market/economic news in 2-4 sentences (60-90 words). Include specific trading measures/recommendations for traders. Keep it crisp, trader-focused, and actionable.\nTitle: President Trump Speaks\nContent: USD/JPY Outlook: Trump Trade Sparks Sharp Rally Against Yen',
        },
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0.4,
      max_tokens: 220,
    });

    const summary = completion.choices[0]?.message?.content?.trim() || '';
    console.log('Direct API result:', summary);
    console.log('Length:', summary.length);

  } catch (e) {
    console.log('Direct API Error:', e.message);
    console.log('Full error:', e);
  }
})();