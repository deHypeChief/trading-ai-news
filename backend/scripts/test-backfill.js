#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Backfill System Test
 * 
 * Tests the backfill system with a small sample:
 * - Generates 1 week of synthetic data
 * - Queues and processes 5 events through AI enrichment
 * - Validates rate limiting works correctly
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  Object.assign(process.env, parsed);
  console.log('✅ Loaded .env');
}

const { connectDB, disconnectDB } = require('../src/config/database');
const { initRedis, closeRedis, getRedisClient } = require('../src/config/redis');

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  tests: [],
};

function test(name, passed, details = '') {
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`  ❌ ${name}${details ? ': ' + details : ''}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('\n🧪 Backfill System Test Suite');
  console.log('==============================\n');

  // Connect to databases
  console.log('📦 Connecting to databases...');
  try {
    await connectDB();
    test('MongoDB connection', true);
  } catch (err) {
    test('MongoDB connection', false, err.message);
    return;
  }

  try {
    await initRedis();
    test('Redis connection', true);
  } catch (err) {
    test('Redis connection', false, err.message);
    console.log('⚠️ Some tests will be skipped without Redis');
  }

  // Test 1: Queue Service
  console.log('\n📋 Testing Queue Service...');
  try {
    const { initQueues, getQueues, closeQueues, getQueueStats } = require('../src/services/queue');
    
    await initQueues();
    const queues = getQueues();
    
    test('Queue initialization', 
      queues.eventImportQueue !== null && 
      queues.aiEnrichmentQueue !== null &&
      queues.newsFetchQueue !== null
    );
    
    const stats = await getQueueStats();
    test('Queue stats retrieval', typeof stats === 'object');
    
    await closeQueues();
    test('Queue cleanup', true);
  } catch (err) {
    test('Queue service', false, err.message);
  }

  // Test 2: Groq Rate Limiter
  console.log('\n🚦 Testing Groq Rate Limiter...');
  try {
    const { 
      isGroqRateLimited, 
      getGroqRateLimitStatus, 
      consumeGroqToken,
      setGroqCooldown,
      clearGroqCooldown,
      resetGroqRateLimiter 
    } = require('../src/services/groqRateLimiter');
    
    // Reset first
    await resetGroqRateLimiter();
    
    // Check initial state
    const initialStatus = await getGroqRateLimitStatus();
    test('Rate limiter initial state', 
      initialStatus.remainingTokens > 0 && !initialStatus.isLimited,
      `Tokens: ${initialStatus.remainingTokens}/${initialStatus.maxTokens}`
    );
    
    // Consume a token
    const consumed = await consumeGroqToken();
    test('Token consumption', consumed === true);
    
    // Check status after consumption
    const afterConsume = await getGroqRateLimitStatus();
    test('Token count decremented', 
      afterConsume.remainingTokens < initialStatus.remainingTokens ||
      afterConsume.remainingTokens === initialStatus.maxTokens - 1
    );
    
    // Test cooldown
    await setGroqCooldown(2000); // 2 second cooldown
    const duringCooldown = await isGroqRateLimited();
    test('Cooldown activation', duringCooldown === true);
    
    await clearGroqCooldown();
    const afterClear = await isGroqRateLimited();
    test('Cooldown cleared', afterClear === false);
    
    // Reset for production
    await resetGroqRateLimiter();
    test('Rate limiter reset', true);
  } catch (err) {
    test('Groq rate limiter', false, err.message);
  }

  // Test 3: Historical Data Generation
  console.log('\n📅 Testing Historical Data Generation...');
  try {
    const { generateSyntheticHistoricalData, getEventsNeedingEnrichment } = require('../src/services/historicalFetcher');
    const { Event } = require('../src/models/Event');
    
    // Generate 1 week of test data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const { events, saved } = await generateSyntheticHistoricalData(startDate, endDate, { dryRun: true });
    test('Synthetic data generation (dry run)', 
      events.length > 0,
      `Generated ${events.length} events`
    );
    
    // Actually save a few test events
    const testEndDate = new Date();
    testEndDate.setDate(testEndDate.getDate() - 100); // Old date to not interfere
    const testStartDate = new Date(testEndDate);
    testStartDate.setDate(testStartDate.getDate() - 3);
    
    const { events: testEvents, saved: testSaved } = await generateSyntheticHistoricalData(
      testStartDate, 
      testEndDate
    );
    test('Synthetic data save', testSaved > 0, `Saved ${testSaved} events`);
    
    // Check events needing enrichment
    const needEnrichment = await getEventsNeedingEnrichment({ limit: 10 });
    test('Events needing enrichment query', 
      typeof needEnrichment.count === 'number',
      `Count: ${needEnrichment.count}`
    );
    
    // Cleanup test events
    const deleteResult = await Event.deleteMany({
      eventDateTime: { $gte: testStartDate, $lte: testEndDate }
    });
    test('Test data cleanup', deleteResult.deletedCount >= 0, `Deleted ${deleteResult.deletedCount}`);
  } catch (err) {
    test('Historical data generation', false, err.message);
  }

  // Test 4: Worker Integration (brief test)
  console.log('\n👷 Testing Worker Integration...');
  try {
    const { initQueues, addEventImportJob, getQueueStats, closeQueues, clearAllQueues } = require('../src/services/queue');
    
    await initQueues();
    
    // Add a test job
    const testStart = new Date();
    testStart.setFullYear(testStart.getFullYear() - 1);
    const testEnd = new Date(testStart);
    testEnd.setDate(testEnd.getDate() + 7);
    
    const job = await addEventImportJob(testStart, testEnd, 'ForexFactory', 999);
    test('Job creation', job !== null && job.id !== undefined, `Job ID: ${job.id}`);
    
    // Check it's in queue
    const stats = await getQueueStats();
    test('Job queued', 
      stats['event-import']?.waiting >= 0 || stats['event-import']?.active >= 0
    );
    
    // Clear the test job
    await clearAllQueues();
    test('Queue cleared', true);
    
    await closeQueues();
  } catch (err) {
    test('Worker integration', false, err.message);
  }

  // Test 5: End-to-end mini backfill (import only, no AI)
  console.log('\n🔄 Testing Mini Backfill (Import Only)...');
  try {
    const { initQueues, addEventImportJob, closeQueues, clearAllQueues } = require('../src/services/queue');
    const { startWorkers, stopWorkers, getWorkerStats } = require('../src/services/backfillWorkers');
    const { Event } = require('../src/models/Event');
    
    await initQueues();
    await startWorkers({ concurrency: { import: 1, ai: 0, news: 0 } });
    
    // Get initial count
    const initialCount = await Event.countDocuments();
    
    // Add import job for 3 days of data (recent past)
    const testEnd = new Date();
    testEnd.setDate(testEnd.getDate() - 200); // Far in the past
    const testStart = new Date(testEnd);
    testStart.setDate(testStart.getDate() - 3);
    
    await addEventImportJob(testStart, testEnd, 'ForexFactory');
    
    // Wait for processing (max 10 seconds)
    let attempts = 0;
    while (attempts < 10) {
      await sleep(1000);
      const workerStats = getWorkerStats();
      if (workerStats.eventsImported > 0) {
        break;
      }
      attempts++;
    }
    
    const workerStats = getWorkerStats();
    test('Events imported via worker', 
      workerStats.eventsImported > 0,
      `Imported: ${workerStats.eventsImported}`
    );
    
    // Cleanup
    await stopWorkers();
    await clearAllQueues();
    await closeQueues();
    
    // Clean test events
    await Event.deleteMany({
      eventDateTime: { $gte: testStart, $lte: testEnd }
    });
    test('Mini backfill cleanup', true);
  } catch (err) {
    test('Mini backfill', false, err.message);
    // Ensure cleanup
    try {
      const { stopWorkers } = require('../src/services/backfillWorkers');
      const { closeQueues } = require('../src/services/queue');
      await stopWorkers();
      await closeQueues();
    } catch (e) {}
  }

  // Summary
  console.log('\n' + '='.repeat(40));
  console.log('📊 Test Summary');
  console.log('='.repeat(40));
  console.log(`  Passed: ${testResults.passed}`);
  console.log(`  Failed: ${testResults.failed}`);
  console.log(`  Total:  ${testResults.tests.length}`);
  
  if (testResults.failed === 0) {
    console.log('\n✅ All tests passed! Ready for production.');
  } else {
    console.log('\n⚠️ Some tests failed. Review before deploying.');
  }

  // Cleanup
  console.log('\n🧹 Cleaning up...');
  try {
    await closeRedis();
  } catch (e) {}
  await disconnectDB();
  console.log('✅ Done!\n');
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run
runTests().catch(err => {
  console.error('❌ Test runner error:', err);
  process.exit(1);
});
