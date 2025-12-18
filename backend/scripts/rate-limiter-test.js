/*
  Simple rate limiter integration test script.
  Usage: node scripts/rate-limiter-test.js
  Environment variables:
    TEST_URL (default http://localhost:3001/api/health)
    REQUESTS (default 150)
    CONCURRENCY (default 20)
*/

const TEST_URL = process.env.TEST_URL || 'http://localhost:3001/api/health';
const REQUESTS = parseInt(process.env.REQUESTS || '150', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '20', 10);

async function worker(id, url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    const headers = {};
    ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'].forEach(h => {
      if (res.headers.get(h)) headers[h] = res.headers.get(h);
    });
    return { status: res.status, headers };
  } catch (err) {
    return { status: 'ERR', error: String(err) };
  }
}

async function runBurst() {
  console.log(`Testing rate limiter against ${TEST_URL} — ${REQUESTS} requests, concurrency ${CONCURRENCY}`);

  let inFlight = 0;
  let index = 0;
  const results = [];

  return new Promise((resolve) => {
    function next() {
      while (inFlight < CONCURRENCY && index < REQUESTS) {
        const id = index++;
        inFlight++;
        worker(id, TEST_URL)
          .then(r => results.push(r))
          .catch(e => results.push({ status: 'ERR', error: String(e) }))
          .finally(() => {
            inFlight--;
            if (index < REQUESTS) next();
            else if (inFlight === 0) resolve(results);
          });
      }
    }
    next();
  });
}

(async () => {
  const results = await runBurst();
  const summary = results.reduce((acc, r) => {
    const key = String(r.status);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log('--- Summary ---');
  console.log(summary);

  // Show first 5 429 responses headers if any
  const resp429 = results.filter(r => r.status === 429).slice(0, 5);
  if (resp429.length) {
    console.log('Sample 429 headers:');
    resp429.forEach((r, i) => console.log(i + 1, r.headers));
  }

  // Body-size protection test
  const largeBody = 'a'.repeat(1_200_000); // 1.2MB
  try {
    const res = await fetch(TEST_URL, { method: 'POST', body: largeBody, headers: { 'Content-Type': 'text/plain' } });
    console.log('Large body POST status:', res.status);
    if (res.status === 413) console.log('Payload too large protection working (413)');
    else console.log('Payload test result — check server logs or configuration');
  } catch (e) {
    console.error('Payload test error:', e);
  }

  // Exit code non-zero if > 10% requests failed with non-2xx and non-429
  const errorCount = results.filter(r => !(r.status === 200 || r.status === 429)).length;
  if (errorCount / results.length > 0.1) process.exit(1);
  process.exit(0);
})();
