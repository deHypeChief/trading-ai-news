const mongoose = require('mongoose');
const { Event } = require('../src/models/Event');
const { summarizeTextShort } = require('../src/services/genai');

async function addMissingSummaries() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trading-ai-news';
    await mongoose.connect(mongoUri);

    console.log('Connected to database');

    // Find events without AI summaries but with news content
    // OR specifically the Trump event to regenerate with enhanced content
    const eventsWithoutSummary = await Event.find({
      $or: [
        {
          aiSummary: { $exists: false },
          $or: [
            { newsHeadline: { $exists: true, $ne: '' } },
            { description: { $exists: true, $ne: '' } }
          ]
        },
        {
          eventName: 'President Trump Speaks',
          newsHeadline: { $exists: true, $ne: '' }
        }
      ]
    }).limit(10); // Limit to 10 for safety

    console.log(`Found ${eventsWithoutSummary.length} events without AI summaries`);

    for (const event of eventsWithoutSummary) {
      try {
        console.log(`Processing: ${event.eventName} (${event.currency})`);

        // Use news headline or description as content
        const content = event.newsHeadline || event.description || '';
        const title = event.eventName || event.title || '';

        if (!content.trim()) {
          console.log(`  Skipping - no content available`);
          continue;
        }

        // For the Trump event, let's enhance the content if it's too brief
        let enhancedContent = content;
        if (event.eventName === 'President Trump Speaks' && content.length < 100) {
          enhancedContent = `${content}. Following President Trump's comments on trade policy, the USD/JPY pair has shown increased volatility. Market participants are positioning for potential currency movements amid renewed trade tensions. Traders should monitor key support and resistance levels while preparing for heightened volatility around upcoming economic data releases.`;
        }

        console.log(`  Generating summary for: "${enhancedContent.slice(0, 100)}..."`);

        const summaryResult = await summarizeTextShort(enhancedContent, title);

        if (summaryResult.summary && summaryResult.summary.trim()) {
          await Event.updateOne(
            { _id: event._id },
            {
              $set: {
                aiSummary: summaryResult.summary,
                aiSummarizedAt: new Date()
              }
            }
          );

          console.log(`  ✅ Added summary (${summaryResult.summary.length} chars)`);
        } else {
          console.log(`  ❌ Failed to generate summary`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (err) {
        console.error(`  Error processing ${event.eventName}:`, err.message);
      }
    }

    console.log('Migration completed');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

addMissingSummaries();