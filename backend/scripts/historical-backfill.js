#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Historical Backfill CLI
 * 
 * Efficient 7-year backfill script using BullMQ for job queuing,
 * Redis-based rate limiting for Genai, and newest-first processing.
 * 
 * Usage:
 *   node scripts/historical-backfill.js [command] [options]
 * 
 * Commands:
 *   start           Start full backfill (import + AI enrichment)
 *   import-only     Import historical events without AI enrichment
 *   enrich-only     Run AI enrichment on existing events
 *   status          Show backfill progress and queue status
 *   pause           Pause all workers
 *   resume          Resume all workers
 *   clear           Clear all pending jobs
 * 
 * Options:
 *   --years=N       Number of years to backfill (default: 7)
 *   --from=DATE     Start from specific date (ISO format)
 *   --to=DATE       End at specific date (ISO format)
 *   --dry-run       Show what would be done without making changes
 *   --ai-tasks=X    AI tasks to run: analysis,volatility,summary,indepth (default: all)
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  Object.assign(process.env, parsed);
  console.log('✅ Loaded .env from', envPath);
}

const { connectDB, disconnectDB } = require('../src/config/database');
const { initRedis, closeRedis, getRedisClient } = require('../src/config/redis');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';
  const options = {
    years: 7,
    from: null,
    to: null,
    dryRun: false,
    aiTasks: ['analysis', 'volatility', 'summary', 'indepth'],
  };
  
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--years=')) {
      options.years = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--from=')) {
      options.from = arg.split('=')[1];
    } else if (arg.startsWith('--to=')) {
      options.to = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--ai-tasks=')) {
      options.aiTasks = arg.split('=')[1].split(',');
    }
  }
  
  return { command, options };
}

// Calculate date ranges for backfill
function calculateDateRanges(years, fromDate, toDate) {
  const ranges = [];
  const endDate = toDate ? new Date(toDate) : new Date();
  const startDate = fromDate ? new Date(fromDate) : new Date(endDate);
  
  if (!fromDate) {
    startDate.setFullYear(startDate.getFullYear() - years);
  }
  
  // Create weekly ranges (newest first for priority)
  let current = new Date(endDate);
  
  while (current > startDate) {
    const weekEnd = new Date(current);
    const weekStart = new Date(current);
    weekStart.setDate(weekStart.getDate() - 7);
    
    if (weekStart < startDate) {
      weekStart.setTime(startDate.getTime());
    }
    
    ranges.push({
      start: new Date(weekStart),
      end: new Date(weekEnd),
    });
    
    current.setDate(current.getDate() - 7);
  }
  
  return ranges;
}

// Display progress bar
function progressBar(current, total, width = 40) {
  const percent = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percent}% (${current}/${total})`;
}

// Format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Main backfill function
async function runBackfill(options) {
  const {
    initQueues,
    addEventImportJob,
    getQueueStats,
    clearAllQueues,
    pauseAllQueues,
    resumeAllQueues,
    closeQueues,
  } = require('../src/services/queue');
  
  const {
    startWorkers,
    stopWorkers,
    getWorkerStats,
  } = require('../src/services/backfillWorkers');
  
  const {
    getGenaiRateLimitStatus,
    resetGenaiRateLimiter,
  } = require('../src/services/genaiRateLimiter');
  
  const { Event } = require('../src/models/Event');
  
  console.log('\n🚀 Starting Historical Backfill');
  console.log('================================');
  console.log(`Years to backfill: ${options.years}`);
  console.log(`From: ${options.from || `${options.years} years ago`}`);
  console.log(`To: ${options.to || 'now'}`);
  console.log(`AI Tasks: ${options.aiTasks.join(', ')}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log('');
  
  // Calculate date ranges
  const ranges = calculateDateRanges(options.years, options.from, options.to);
  console.log(`📅 Created ${ranges.length} weekly ranges to process`);
  
  if (options.dryRun) {
    console.log('\n[DRY RUN] Would process:');
    console.log(`  - ${ranges.length} weeks of data`);
    console.log(`  - Estimated ${ranges.length * 30} events (avg 30/week)`);
    console.log(`  - Estimated AI calls: ${ranges.length * 30 * 4} (4 per event)`);
    
    const genaiRpm = parseInt(process.env.GENAI_RPM_LIMIT || '30', 10);
    const estimatedMinutes = (ranges.length * 30 * 4) / genaiRpm;
    console.log(`  - Estimated time: ${formatDuration(estimatedMinutes * 60 * 1000)}`);
    return;
  }
  
  // Initialize queues and workers
  await initQueues();
  await startWorkers({
    concurrency: {
      import: 3,
      ai: 1, // Sequential for rate limiting
      news: 2,
    },
  });
  
  // Reset rate limiter for fresh start
  await resetGenaiRateLimiter();
  
  // Queue import jobs (newest first)
  console.log('\n📥 Queueing import jobs...');
  let queued = 0;
  
  for (const range of ranges) {
    await addEventImportJob(range.start, range.end, 'ForexFactory', queued);
    queued++;
    
    if (queued % 50 === 0) {
      console.log(`  Queued ${queued}/${ranges.length} weeks`);
    }
  }
  
  console.log(`✅ Queued ${queued} import jobs`);
  
  // Monitor progress
  console.log('\n📊 Monitoring progress (Ctrl+C to stop)...\n');
  
  const startTime = Date.now();
  let lastStats = null;
  
  const monitorInterval = setInterval(async () => {
    try {
      const queueStats = await getQueueStats();
      const workerStats = getWorkerStats();
      const rateLimitStatus = await getGenaiRateLimitStatus();
      
      const totalEvents = await Event.countDocuments();
      const enrichedEvents = await Event.countDocuments({ aiAnalyzedAt: { $exists: true } });
      
      // Clear previous lines and show status
      process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen
      
      console.log('🔄 Backfill Progress');
      console.log('====================');
      console.log(`Runtime: ${formatDuration(Date.now() - startTime)}`);
      console.log('');
      
      // Queue status
      console.log('📦 Queue Status:');
      for (const [name, stats] of Object.entries(queueStats)) {
        const total = stats.waiting + stats.active + stats.completed + stats.failed;
        console.log(`  ${name}:`);
        console.log(`    ${progressBar(stats.completed, total || 1)}`);
        console.log(`    Active: ${stats.active} | Waiting: ${stats.waiting} | Failed: ${stats.failed}`);
      }
      console.log('');
      
      // Worker status
      console.log('👷 Workers:');
      console.log(`  Import: ${workerStats.workers.import}`);
      console.log(`  AI: ${workerStats.workers.ai}`);
      console.log(`  News: ${workerStats.workers.news}`);
      console.log('');
      
      // Statistics
      console.log('📈 Statistics:');
      console.log(`  Events imported: ${workerStats.eventsImported}`);
      console.log(`  Events enriched: ${workerStats.eventsEnriched}`);
      console.log(`  News fetched: ${workerStats.newsFetched}`);
      console.log(`  Errors: ${workerStats.errors}`);
      console.log(`  Rate limit hits: ${workerStats.rateLimitHits}`);
      console.log('');
      
      // Database status
      console.log('💾 Database:');
      console.log(`  Total events: ${totalEvents}`);
      console.log(`  Enriched: ${enrichedEvents} (${Math.round((enrichedEvents / totalEvents) * 100) || 0}%)`);
      console.log('');
      
      // Genai rate limit
      console.log('🤖 Genai Rate Limit:');
      console.log(`  Tokens: ${rateLimitStatus.remainingTokens}/${rateLimitStatus.maxTokens}`);
      console.log(`  Status: ${rateLimitStatus.isLimited ? '🔴 LIMITED' : '🟢 OK'}`);
      if (rateLimitStatus.cooldownUntil) {
        const remaining = rateLimitStatus.cooldownUntil - Date.now();
        console.log(`  Cooldown: ${formatDuration(remaining)} remaining`);
      }
      
      // Check if done
      const aiStats = queueStats['ai-enrichment'];
      const importStats = queueStats['event-import'];
      
      if (importStats && aiStats) {
        const allDone = 
          importStats.waiting === 0 && importStats.active === 0 &&
          aiStats.waiting === 0 && aiStats.active === 0;
        
        if (allDone && workerStats.eventsImported > 0) {
          console.log('\n✅ Backfill complete!');
          clearInterval(monitorInterval);
          await cleanup();
        }
      }
      
      lastStats = { queueStats, workerStats };
    } catch (error) {
      console.error('Monitor error:', error.message);
    }
  }, 5000);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n⏸️ Gracefully stopping...');
    clearInterval(monitorInterval);
    await cleanup();
  });
  
  async function cleanup() {
    try {
      await stopWorkers();
      await closeQueues();
      await closeRedis();
      await disconnectDB();
      console.log('✅ Cleanup complete');
      process.exit(0);
    } catch (error) {
      console.error('Cleanup error:', error);
      process.exit(1);
    }
  }
}

// Status command
async function showStatus() {
  const { initQueues, getQueueStats, closeQueues } = require('../src/services/queue');
  const { getGenaiRateLimitStatus } = require('../src/services/genaiRateLimiter');
  const { Event } = require('../src/models/Event');
  
  await initQueues();
  
  const queueStats = await getQueueStats();
  const rateLimitStatus = await getGenaiRateLimitStatus();
  
  const totalEvents = await Event.countDocuments();
  const enrichedEvents = await Event.countDocuments({ aiAnalyzedAt: { $exists: true } });
  const withVolatility = await Event.countDocuments({ volatilityScore: { $exists: true } });
  const withSummary = await Event.countDocuments({ aiSummary: { $exists: true } });
  const withIndepth = await Event.countDocuments({ aiInDepthAnalysis: { $exists: true } });
  
  console.log('\n📊 Backfill Status');
  console.log('==================');
  
  console.log('\n💾 Database:');
  console.log(`  Total events: ${totalEvents}`);
  console.log(`  With AI analysis: ${enrichedEvents} (${Math.round((enrichedEvents / totalEvents) * 100) || 0}%)`);
  console.log(`  With volatility: ${withVolatility} (${Math.round((withVolatility / totalEvents) * 100) || 0}%)`);
  console.log(`  With summary: ${withSummary} (${Math.round((withSummary / totalEvents) * 100) || 0}%)`);
  console.log(`  With in-depth: ${withIndepth} (${Math.round((withIndepth / totalEvents) * 100) || 0}%)`);
  
  console.log('\n📦 Queues:');
  for (const [name, stats] of Object.entries(queueStats)) {
    console.log(`  ${name}:`);
    console.log(`    Waiting: ${stats.waiting} | Active: ${stats.active}`);
    console.log(`    Completed: ${stats.completed} | Failed: ${stats.failed}`);
  }
  
  console.log('\n🤖 Genai Rate Limit:');
  console.log(`  Tokens: ${rateLimitStatus.remainingTokens}/${rateLimitStatus.maxTokens}`);
  console.log(`  Status: ${rateLimitStatus.isLimited ? '🔴 LIMITED' : '🟢 OK'}`);
  
  await closeQueues();
}

// Enrich-only command
async function runEnrichOnly(options) {
  const {
    initQueues,
    addAIEnrichmentJob,
    getQueueStats,
    closeQueues,
  } = require('../src/services/queue');
  
  const {
    startWorkers,
    stopWorkers,
    getWorkerStats,
  } = require('../src/services/backfillWorkers');
  
  const { Event } = require('../src/models/Event');
  
  console.log('\n🤖 Starting AI Enrichment Only');
  console.log('==============================');
  
  // Find events needing enrichment (newest first)
  const query = {
    $or: [
      { aiAnalyzedAt: { $exists: false } },
      { volatilityScore: { $exists: false } },
      { aiSummary: { $exists: false } },
    ],
  };
  
  if (options.from) {
    query.eventDateTime = { ...query.eventDateTime, $gte: new Date(options.from) };
  }
  if (options.to) {
    query.eventDateTime = { ...query.eventDateTime, $lte: new Date(options.to) };
  }
  
  const eventsToEnrich = await Event.find(query)
    .sort({ eventDateTime: -1 }) // Newest first
    .select('eventId eventDateTime')
    .lean();
  
  console.log(`Found ${eventsToEnrich.length} events needing enrichment`);
  
  if (options.dryRun) {
    console.log('\n[DRY RUN] Would enrich:');
    console.log(`  - ${eventsToEnrich.length} events`);
    console.log(`  - Tasks: ${options.aiTasks.join(', ')}`);
    return;
  }
  
  if (eventsToEnrich.length === 0) {
    console.log('✅ All events are already enriched');
    return;
  }
  
  // Initialize and queue jobs
  await initQueues();
  await startWorkers({ concurrency: { ai: 1 } });
  
  console.log('\n📥 Queueing enrichment jobs...');
  
  for (const event of eventsToEnrich) {
    await addAIEnrichmentJob(event.eventId, event.eventDateTime, options.aiTasks);
  }
  
  console.log(`✅ Queued ${eventsToEnrich.length} enrichment jobs`);
  console.log('\n📊 Processing... (Ctrl+C to stop)\n');
  
  // Simple progress monitoring
  const startTime = Date.now();
  
  const monitorInterval = setInterval(async () => {
    const stats = await getQueueStats();
    const aiStats = stats['ai-enrichment'];
    const workerStats = getWorkerStats();
    
    if (aiStats) {
      const total = aiStats.waiting + aiStats.active + aiStats.completed + aiStats.failed;
      console.log(`Progress: ${progressBar(aiStats.completed, total)} | ` +
                  `Active: ${aiStats.active} | Failed: ${aiStats.failed} | ` +
                  `Rate limits: ${workerStats.rateLimitHits}`);
      
      if (aiStats.waiting === 0 && aiStats.active === 0) {
        console.log(`\n✅ Enrichment complete in ${formatDuration(Date.now() - startTime)}`);
        clearInterval(monitorInterval);
        await stopWorkers();
        await closeQueues();
      }
    }
  }, 3000);
  
  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n⏸️ Stopping...');
    clearInterval(monitorInterval);
    await stopWorkers();
    await closeQueues();
  });
}

// Main entry point
async function main() {
  const { command, options } = parseArgs();
  
  console.log('🔌 Connecting to databases...');
  await connectDB();
  
  try {
    await initRedis();
  } catch (err) {
    console.warn('⚠️ Redis connection failed, some features may be limited');
  }
  
  try {
    switch (command) {
      case 'start':
        await runBackfill(options);
        break;
        
      case 'import-only':
        options.aiTasks = [];
        await runBackfill(options);
        break;
        
      case 'enrich-only':
        await runEnrichOnly(options);
        break;
        
      case 'status':
        await showStatus();
        await closeRedis();
        await disconnectDB();
        break;
        
      case 'pause':
        const { pauseAllQueues, initQueues: initQ1, closeQueues: closeQ1 } = require('../src/services/queue');
        await initQ1();
        await pauseAllQueues();
        await closeQ1();
        await closeRedis();
        await disconnectDB();
        break;
        
      case 'resume':
        const { resumeAllQueues, initQueues: initQ2, closeQueues: closeQ2 } = require('../src/services/queue');
        await initQ2();
        await resumeAllQueues();
        await closeQ2();
        await closeRedis();
        await disconnectDB();
        break;
        
      case 'clear':
        const { clearAllQueues, initQueues: initQ3, closeQueues: closeQ3 } = require('../src/services/queue');
        await initQ3();
        await clearAllQueues();
        await closeQ3();
        await closeRedis();
        await disconnectDB();
        console.log('✅ All queues cleared');
        break;
        
      default:
        console.log(`Unknown command: ${command}`);
        console.log('\nUsage: node scripts/historical-backfill.js [command] [options]');
        console.log('\nCommands: start, import-only, enrich-only, status, pause, resume, clear');
        console.log('\nOptions:');
        console.log('  --years=N       Years to backfill (default: 7)');
        console.log('  --from=DATE     Start date (ISO format)');
        console.log('  --to=DATE       End date (ISO format)');
        console.log('  --dry-run       Preview without changes');
        console.log('  --ai-tasks=X    AI tasks (analysis,volatility,summary,indepth)');
        await closeRedis();
        await disconnectDB();
    }
  } catch (error) {
    console.error('❌ Error:', error);
    await closeRedis();
    await disconnectDB();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
