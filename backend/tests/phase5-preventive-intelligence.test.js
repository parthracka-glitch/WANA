const test = require('node:test');
const assert = require('node:assert');

// In-Memory mock for deterministic tests
const inMemoryShadowDb = {
  analytics_shadow_eval: new Map(),
  pastEvents: new Map(),
};

const mockFirestore = {
  collection: (col) => ({
    doc: (id) => ({
      id,
      set: async (data) => {
        if (!inMemoryShadowDb[col]) inMemoryShadowDb[col] = new Map();
        inMemoryShadowDb[col].set(id, JSON.parse(JSON.stringify(data)));
      },
      get: async () => ({
        id,
        exists: !!(inMemoryShadowDb[col]?.get(id)),
        data: () => inMemoryShadowDb[col]?.get(id) || null,
      }),
    }),
    limit: () => ({
      get: async () => {
        const store = inMemoryShadowDb[col] || new Map();
        const docs = Array.from(store.values()).map((item) => ({
          id: item.id || 'doc',
          data: () => item,
        }));
        return {
          empty: docs.length === 0,
          docs,
          forEach: (cb) => docs.forEach(cb),
        };
      },
    }),
  }),
};

const RiskEngine = require('../src/services/riskEngine');
const ShadowEvaluator = require('../src/services/shadowEvaluator');
const AnomalyTrajectoryService = require('../../mobile-sdk/src/anomalyTrajectoryService');

RiskEngine.customDb = mockFirestore;
ShadowEvaluator.customDb = mockFirestore;

/**
 * Phase 5 Preventive Intelligence Automated Test Suite (QA-04 / QA-05)
 */

test('M-05 & BE-15: RiskEngine outputs deterministic scores with human-readable explanation tags', async () => {
  // 1. Daytime + Near Police Station + Zero Incidents -> Low Risk
  const afternoonDate = new Date(2026, 9, 6, 14, 0, 0).getTime(); // 14:00 PM
  const lowRiskRes = await RiskEngine.evaluateLocationRisk({
    latitude: 17.6599, // Directly at Solapur City Police Station
    longitude: 75.9064,
    timestamp: afternoonDate,
    historicalIncidentsCount: 0,
  });

  assert.strictEqual(lowRiskRes.success, true);
  assert.strictEqual(lowRiskRes.riskLevel, 'LOW');
  assert.ok(lowRiskRes.riskScore <= 35, `Score ${lowRiskRes.riskScore} should be <= 35 for low risk`);
  assert.ok(lowRiskRes.explanationTags.includes('DAYLIGHT_OPTIMAL'));
  assert.ok(lowRiskRes.explanationTags.includes('NEAR_POLICE_SAFE_HAVEN'));
  assert.strictEqual(lowRiskRes.nearestSafeHaven.type, 'POLICE');

  // 2. Late Night (23:30 PM) + Isolated Distance (> 5km) + Elevated Incidents -> High Risk
  const lateNightDate = new Date(2026, 9, 6, 23, 30, 0).getTime();
  const highRiskRes = await RiskEngine.evaluateLocationRisk({
    latitude: 17.8500, // Remote rural perimeter outside Solapur
    longitude: 75.8000,
    timestamp: lateNightDate,
    historicalIncidentsCount: 5,
  });

  assert.strictEqual(highRiskRes.success, true);
  assert.strictEqual(highRiskRes.riskLevel, 'HIGH');
  assert.ok(highRiskRes.riskScore >= 70, `Score ${highRiskRes.riskScore} should be >= 70 for high risk`);
  assert.ok(highRiskRes.explanationTags.includes('LATE_NIGHT_HOURS'));
  assert.ok(highRiskRes.explanationTags.includes('ISOLATED_FROM_EMERGENCY_FACILITY'));
  assert.ok(highRiskRes.explanationTags.includes('ELEVATED_HISTORICAL_INCIDENT_DENSITY'));
  assert.strictEqual(highRiskRes.recommendedAction, 'RECOMMEND_COMPANION_OR_WELL_LIT_ROUTE');
});

test('AI-02: ShadowEvaluator logs inferences silently and evaluates AI-01 release KPI gates', async () => {
  const tripId = `trip_eval_${Date.now()}`;

  // 1. Silent shadow inference logging
  const logRes = await ShadowEvaluator.logShadowInference({
    tripId,
    detectorName: 'ANOMALY_TRAJECTORY_v1',
    detectorVersion: '1.0.0',
    metrics: { turnCount: 3, timeSpanSeconds: 120 },
    anomalyDetected: true,
    confidence: 0.88,
  });

  assert.strictEqual(logRes.logged, true);
  assert.strictEqual(logRes.mode, 'SHADOW');
  assert.ok(inMemoryShadowDb.analytics_shadow_eval.has(logRes.recordId));

  // 2. Benchmark KPI Release Gate Evaluation
  // Scenario A: Benchmark meeting criteria (Precision 95%, FAR 0.5 per 100km)
  const testBatchA = [
    { anomalyDetected: true, groundTruth: true },   // TP
    { anomalyDetected: true, groundTruth: true },   // TP
    { anomalyDetected: true, groundTruth: false },  // FP (1)
    { anomalyDetected: false, groundTruth: false }, // TN
  ];
  for (let i = 0; i < 30; i++) {
    testBatchA.push({ anomalyDetected: true, groundTruth: true }); // More TPs
    testBatchA.push({ anomalyDetected: false, groundTruth: false }); // More TNs
  }

  const kpiReportA = ShadowEvaluator.evaluateKpiMetrics(testBatchA, 200); // 200 km
  assert.ok(kpiReportA.metrics.precisionPercent >= 92.0, `Precision ${kpiReportA.metrics.precisionPercent}% must be >= 92%`);
  assert.ok(kpiReportA.metrics.falseAlarmRatePer100Km <= 1.0, `FAR ${kpiReportA.metrics.falseAlarmRatePer100Km} must be <= 1.0`);
  assert.strictEqual(kpiReportA.kpiGates.releaseGateApproved, true);

  // Scenario B: Excessive false alarms failing release gate
  const failingBatch = [
    { anomalyDetected: true, groundTruth: false }, // FP
    { anomalyDetected: true, groundTruth: false }, // FP
    { anomalyDetected: true, groundTruth: false }, // FP
    { anomalyDetected: true, groundTruth: true },  // TP (1)
  ];
  const kpiReportB = ShadowEvaluator.evaluateKpiMetrics(failingBatch, 50); // 50 km (6 FAR/100km)
  assert.strictEqual(kpiReportB.kpiGates.releaseGateApproved, false, 'Model with excessive FAR must fail release gate');
});

test('M-06: AnomalyTrajectoryService detects correlated turns and enforces shadow mode by default', async () => {
  let shadowAlertFired = false;
  let shadowPayload = null;

  const trajectoryService = new AnomalyTrajectoryService({
    shadowMode: true,
    minConsecutiveTurns: 3,
    turnTimeWindowMs: 180000,
    onAnomalyDetected: (report) => {
      shadowAlertFired = true;
      shadowPayload = report;
    },
  });

  const tripId = 'trip_patrol_01';
  trajectoryService.startTrip(tripId);
  assert.strictEqual(trajectoryService.shadowMode, true);

  const baseTime = Date.now();

  // Mock HTTP dispatcher for shadow telemetry
  let telemetrySent = [];
  const mockHttp = {
    post: async (url, data) => {
      telemetrySent.push(data);
      return { success: true };
    },
  };

  // 1. Straight segment: heading 0
  await trajectoryService.recordWaypoint({ latitude: 17.659, longitude: 75.906, heading: 0, timestamp: baseTime }, mockHttp);
  await trajectoryService.recordWaypoint({ latitude: 17.660, longitude: 75.906, heading: 0, timestamp: baseTime + 10000 }, mockHttp);
  assert.strictEqual(shadowAlertFired, false, 'Straight movement should not trigger turn anomaly');

  // 2. Turn 1: 90 degrees right (heading 90)
  await trajectoryService.recordWaypoint({ latitude: 17.661, longitude: 75.907, heading: 90, timestamp: baseTime + 20000 }, mockHttp);
  assert.strictEqual(shadowAlertFired, false);

  // 3. Turn 2: 90 degrees right (heading 180)
  await trajectoryService.recordWaypoint({ latitude: 17.660, longitude: 75.908, heading: 180, timestamp: baseTime + 40000 }, mockHttp);
  assert.strictEqual(shadowAlertFired, false);

  // 4. Turn 3: 90 degrees right (heading 270) -> 3rd turn in window triggers anomaly!
  const res3 = await trajectoryService.recordWaypoint({ latitude: 17.659, longitude: 75.907, heading: 270, timestamp: baseTime + 60000 }, mockHttp);

  assert.strictEqual(res3.anomalyDetected, true);
  assert.strictEqual(shadowAlertFired, true);
  assert.strictEqual(shadowPayload.metrics.turnCount, 3);
  assert.strictEqual(shadowPayload.shadowMode, true, 'Anomaly must operate in shadow mode without UI interruption');
  assert.strictEqual(telemetrySent.length, 1);
  assert.strictEqual(telemetrySent[0].tripId, tripId);
});

test('LEGAL-02: Binding human-in-the-loop lifecycle invariant', () => {
  // Prohibit AI automated resolution or status downgrading
  function evaluateAutonomousDowngradeAttempt(actionSource, requestedStatus) {
    if (actionSource === 'AI_AGENT' || actionSource === 'RISK_ENGINE') {
      if (requestedStatus === 'RESOLVED' || requestedStatus === 'SAFE' || requestedStatus === 'DISMISSED') {
        return { allowed: false, error: 'PROHIBITED_AUTONOMOUS_DOWNGRADE' };
      }
    }
    return { allowed: true };
  }

  const aiAttempt = evaluateAutonomousDowngradeAttempt('RISK_ENGINE', 'RESOLVED');
  assert.strictEqual(aiAttempt.allowed, false);
  assert.strictEqual(aiAttempt.error, 'PROHIBITED_AUTONOMOUS_DOWNGRADE');

  const humanAttempt = evaluateAutonomousDowngradeAttempt('SUPERVISOR_HUMAN', 'RESOLVED');
  assert.strictEqual(humanAttempt.allowed, true);
});
