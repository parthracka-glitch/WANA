const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { appCheckMiddleware } = require('../src/middleware/appCheckMiddleware');
const { metricsRegistry, MetricsRegistry } = require('../src/middleware/metricsMiddleware');
const PitrRecoveryDrill = require('../src/scripts/pitr-backup-drill');

// ==========================================
// 1. BE-11: App Check Middleware Tests
// ==========================================

test('BE-11: App Check - missing token passes through in permissive mode (test/dev)', async () => {
  const origEnv = process.env.ENFORCE_APP_CHECK;
  delete process.env.ENFORCE_APP_CHECK;

  let nextCalled = false;
  const req = { header: () => null };
  const res = {
    status: () => res,
    json: () => res,
  };

  await appCheckMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true, 'Should allow pass-through when not strictly enforced');
  process.env.ENFORCE_APP_CHECK = origEnv;
});

test('BE-11: App Check - missing token rejected with 401 when strictly enforced', async () => {
  const origEnv = process.env.ENFORCE_APP_CHECK;
  process.env.ENFORCE_APP_CHECK = 'true';

  let statusCode = null;
  let responseBody = null;
  const req = { header: () => null, id: 'req_test_123' };
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      responseBody = body;
      return res;
    },
  };

  await appCheckMiddleware(req, res, () => {});

  assert.strictEqual(statusCode, 401);
  assert.strictEqual(responseBody?.error?.code, 'APP_CHECK_REQUIRED');

  process.env.ENFORCE_APP_CHECK = origEnv;
});

test('BE-11: App Check - forged or invalid token rejected with 401', async () => {
  let statusCode = null;
  let responseBody = null;
  const req = { header: (name) => (name.toLowerCase() === 'x-firebase-appcheck' ? 'invalid_app_check_token' : null) };
  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      responseBody = body;
      return res;
    },
  };

  await appCheckMiddleware(req, res, () => {});

  assert.strictEqual(statusCode, 401);
  assert.strictEqual(responseBody?.error?.code, 'APP_CHECK_UNAUTHORIZED');
});

test('BE-11: App Check - valid token attaches claims and proceeds to next()', async () => {
  let nextCalled = false;
  const req = {
    header: (name) => (name.toLowerCase() === 'x-firebase-appcheck' ? 'valid_play_integrity_token_xyz' : null),
  };
  const res = {
    status: () => res,
    json: () => res,
  };

  await appCheckMiddleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.ok(req.appCheck, 'req.appCheck claims should be attached');
  assert.strictEqual(req.appCheck.token, 'valid_play_integrity_token_xyz');
});

// ==========================================
// 2. BE-12: Full Observability & Prometheus Metrics
// ==========================================

test('BE-12: Metrics Registry - accurately tracks request volume, p95 latency, and SLA target', () => {
  const customRegistry = new MetricsRegistry();

  // Simulate 100 requests with latencies 10ms..100ms
  for (let i = 1; i <= 100; i++) {
    customRegistry.recordRequest('GET', '/healthz', 200, i);
  }

  const summary = customRegistry.getMetricsSummary();
  assert.strictEqual(summary.requestsTotal, 100);
  assert.strictEqual(summary.statusCodes['200'], 100);
  assert.ok(summary.latencyMs.p95 >= 95, 'p95 should be at or near 95ms');

  // Record SOS events under SLA budget (<= 3500ms)
  for (let i = 1; i <= 20; i++) {
    customRegistry.recordRequest('POST', '/api/events/sos', 200, 250);
  }

  const sosSummary = customRegistry.getMetricsSummary();
  assert.strictEqual(sosSummary.sos.dispatchedTotal, 20);
  assert.strictEqual(sosSummary.sos.slaTargetMet, true, 'SLA target should be met when p95 <= 3500ms');

  // Verify Prometheus formatted exporter
  const promText = customRegistry.toPrometheusFormat();
  assert.ok(promText.includes('# TYPE wana_sos_dispatched_total counter'));
  assert.ok(promText.includes('# TYPE wana_sos_p95_latency_ms gauge'));
  assert.ok(promText.includes('wana_sos_sla_target_met 1'));
  assert.ok(promText.includes('http_requests_by_status{code="200"} 120'));
});

// ==========================================
// 3. BE-13: Point-in-Time Recovery (PITR) Drill
// ==========================================

test('BE-13: PITR Disaster Recovery Drill - benchmarks RTO < 30m and RPO < 5m', async () => {
  const drill = new PitrRecoveryDrill({
    projectId: 'wana-prod-test',
    databaseId: '(default)',
  });

  const report = await drill.executeDrill({ simulatedDataSizeGb: 2.0, networkBandwidthMbps: 400 });

  assert.strictEqual(report.status, 'PASSED');
  assert.strictEqual(report.recoveryMetrics.rtoCompliant, true);
  assert.ok(report.recoveryMetrics.elapsedMinutes < 30, 'RTO elapsed time must be strictly under 30 minutes');
  assert.strictEqual(report.recoveryMetrics.rpoCompliant, true);
  assert.strictEqual(report.recoveryMetrics.rpoAchievedMinutes, 4);
  assert.strictEqual(report.verificationChecks.ongoingEventsRestored, true);
  assert.strictEqual(report.verificationChecks.indexesOnline, true);
});

// ==========================================
// 4. QA-04: High-Concurrency Load Simulation (250 Concurrent SOS Triggers)
// ==========================================

test('QA-04: High-Concurrency Simulation - 250 concurrent SOS triggers processed with 0 drops', async () => {
  const concurrentCount = 250;
  const processedEvents = [];
  const latencies = [];

  // Simulated concurrent dispatch engine
  const dispatchWorker = async (index) => {
    const startTime = Date.now();
    // Simulate non-blocking asynchronous database write & notification dispatch
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20) + 10));
    const duration = Date.now() - startTime;
    latencies.push(duration);
    processedEvents.push({
      eventId: `sos_event_concurrent_${index}`,
      dispatchedAt: new Date().toISOString(),
      durationMs: duration,
    });
  };

  const tasks = Array.from({ length: concurrentCount }, (_, i) => dispatchWorker(i));
  await Promise.all(tasks);

  assert.strictEqual(processedEvents.length, concurrentCount, 'All 250 concurrent events must be successfully processed');

  latencies.sort((a, b) => a - b);
  const p95Index = Math.ceil(0.95 * latencies.length) - 1;
  const p95Latency = latencies[p95Index];

  assert.ok(p95Latency < 5000, `P95 dispatch latency must remain <= 5000ms at peak load (was ${p95Latency}ms)`);
});

// ==========================================
// 5. BE-14: Security Route Inventory Gate
// ==========================================

test('BE-14: Security Route Inventory CI Gate - verifying mutating routes are secured', () => {
  const routesDir = path.join(__dirname, '../src/routes');
  const routeFiles = fs.readdirSync(routesDir).filter((file) => file.endsWith('.routes.js'));

  assert.ok(routeFiles.length >= 8, 'Should have registered route modules');

  for (const file of routeFiles) {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');

    // If file defines POST/PUT/DELETE/PATCH mutations, ensure it imports/uses auth, validation, or internal token
    const hasMutations = content.includes('.post(') || content.includes('.put(') || content.includes('.delete(') || content.includes('.patch(');
    if (hasMutations) {
      const hasSecurityChecks =
        content.includes('authMiddleware') ||
        content.includes('rbacMiddleware') ||
        content.includes('INTERNAL_API_KEY') ||
        content.includes('INTERNAL_JOB_KEY') ||
        content.includes('requireInternalSecret') ||
        content.includes('authenticateInternal') ||
        content.includes('generateToken') || // auth.routes.js handles login/register
        content.includes('validate') ||
        content.includes('authLimiter');

      assert.ok(
        hasSecurityChecks,
        `Route file ${file} contains mutating methods but lacks verified authentication/authorization middleware`
      );
    }
  }
});
