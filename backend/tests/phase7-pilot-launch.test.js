const test = require('node:test');
const assert = require('node:assert');

const { PILOT_REGIONS, isCoordinateInPilotRegion } = require('../src/configuration/pilotConfig');
const PilotScorecardService = require('../src/services/pilotScorecardService');
const PilotDrillRunner = require('../src/scripts/pilot-drill-runner');

// ==========================================
// 1. Pilot Region Configuration & Boundary Tests
// ==========================================

test('Phase 7: Pilot Configuration - defines active Solapur and standby Pune municipal zones', () => {
  assert.ok(PILOT_REGIONS.solapur_central, 'Solapur pilot region must be defined');
  assert.strictEqual(PILOT_REGIONS.solapur_central.status, 'ACTIVE_PILOT');
  assert.strictEqual(PILOT_REGIONS.solapur_central.emergencyHelplines.police, '112');
  assert.strictEqual(PILOT_REGIONS.solapur_central.emergencyHelplines.womenHelpline, '1091');
  assert.strictEqual(PILOT_REGIONS.solapur_central.slas.ackTargetSeconds, 60);

  assert.ok(PILOT_REGIONS.pune_municipal, 'Pune pilot region must be defined');
  assert.strictEqual(PILOT_REGIONS.pune_municipal.emergencyHelplines.police, '112');
});

test('Phase 7: Geofence Boundary Check - validates coordinates in vs out of Solapur pilot zone', () => {
  // Solapur center: 17.6599° N, 75.9064° E
  const inSolapur = isCoordinateInPilotRegion(17.6599, 75.9064, 'solapur_central');
  assert.strictEqual(inSolapur, true, 'Solapur center coordinate must fall within boundary');

  // Mumbai: 19.0760° N, 72.8777° E (outside Solapur)
  const outsideSolapur = isCoordinateInPilotRegion(19.076, 72.8777, 'solapur_central');
  assert.strictEqual(outsideSolapur, false, 'Mumbai coordinate must fall outside Solapur boundary');

  // Delhi: 28.6139° N, 77.2090° E (outside Solapur)
  const farOutside = isCoordinateInPilotRegion(28.6139, 77.209, 'solapur_central');
  assert.strictEqual(farOutside, false, 'Delhi coordinate must fall outside Solapur boundary');
});

// ==========================================
// 2. Pilot Performance Scorecard & Metric Evaluator Tests
// ==========================================

test('Phase 7: Scorecard Service - empty batch returns NO_DATA status gracefully', () => {
  const service = new PilotScorecardService({ regionId: 'solapur_central' });
  const report = service.evaluateBatch([], []);

  assert.strictEqual(report.totalIncidents, 0);
  assert.strictEqual(report.kpiStatus, 'NO_DATA');
});

test('Phase 7: Scorecard Service - passing batch satisfies all §19.2 success measures', () => {
  const service = new PilotScorecardService({
    regionId: 'solapur_central',
    slaAckSeconds: 60,
    slaLatencyBudgetMs: 5000,
  });

  const mockEvents = [
    {
      eventId: 'evt_01',
      dispatchLatencyMs: 120,
      ackTimeSeconds: 22,
      status: 'RESOLVED',
      notifications: [{ delivered: true }],
    },
    {
      eventId: 'evt_02',
      dispatchLatencyMs: 250,
      ackTimeSeconds: 15,
      status: 'RESOLVED',
      notifications: [{ delivered: true }],
    },
    {
      eventId: 'evt_03',
      dispatchLatencyMs: 180,
      ackTimeSeconds: 35,
      status: 'RESOLVED',
      notifications: [{ delivered: true }],
    },
    {
      eventId: 'evt_04',
      dispatchLatencyMs: 310,
      ackTimeSeconds: 40,
      status: 'RESOLVED',
      notifications: [{ delivered: true }],
    },
  ];

  const mockAuditLogs = [
    { eventId: 'evt_01', action: 'EVENT_CLOSED' },
    { eventId: 'evt_02', action: 'EVENT_CLOSED' },
    { eventId: 'evt_03', action: 'EVENT_CLOSED' },
    { eventId: 'evt_04', action: 'EVENT_CLOSED' },
  ];

  const scorecard = service.evaluateBatch(mockEvents, mockAuditLogs);

  assert.strictEqual(scorecard.totalIncidents, 4);
  assert.strictEqual(scorecard.kpiStatus, 'PASSED');
  assert.strictEqual(scorecard.kpiGate.latencyBudgetTargetMet, true);
  assert.strictEqual(scorecard.kpiGate.supervisorAckTargetMet, true);
  assert.strictEqual(scorecard.kpiGate.notificationDeliveryTargetMet, true);
  assert.strictEqual(scorecard.kpiGate.auditChainIntegrityTargetMet, true);
  assert.strictEqual(scorecard.metrics.ackCompliancePercent, 100);
  assert.ok(scorecard.metrics.p95LatencyMs <= 5000);
});

test('Phase 7: Scorecard Service - flags ACTION_REQUIRED when ack SLA or latency target is breached', () => {
  const service = new PilotScorecardService({
    regionId: 'solapur_central',
    slaAckSeconds: 60,
    slaLatencyBudgetMs: 3500,
  });

  const degradedEvents = [
    {
      eventId: 'deg_01',
      dispatchLatencyMs: 6200, // Breaches latency SLA
      ackTimeSeconds: 120, // Breaches 60s ack SLA
      status: 'ESCALATED',
    },
    {
      eventId: 'deg_02',
      dispatchLatencyMs: 4500,
      ackTimeSeconds: 85,
      status: 'ESCALATED',
    },
  ];

  const scorecard = service.evaluateBatch(degradedEvents, []);

  assert.strictEqual(scorecard.kpiStatus, 'ACTION_REQUIRED');
  assert.strictEqual(scorecard.kpiGate.latencyBudgetTargetMet, false);
  assert.strictEqual(scorecard.kpiGate.supervisorAckTargetMet, false);
  assert.ok(scorecard.recommendations.some((r) => r.includes('latency')));
  assert.ok(scorecard.recommendations.some((r) => r.includes('Supervisor on-duty coverage')));
});

// ==========================================
// 3. Pilot Drill Runner End-to-End Simulation Tests
// ==========================================

test('Phase 7: Pilot Drill Runner - executes simulated live-incident drill session successfully', async () => {
  const runner = new PilotDrillRunner({ regionId: 'solapur_central' });
  const summary = await runner.runDrillSession({ incidentCount: 3, supervisorResponseDelayMs: 15 });

  assert.strictEqual(summary.regionId, 'solapur_central');
  assert.strictEqual(summary.incidentCount, 3);
  assert.strictEqual(summary.status, 'DRILL_PASSED');
  assert.ok(summary.scorecard, 'Scorecard must be present');
  assert.strictEqual(summary.scorecard.kpiStatus, 'PASSED');
  assert.ok(summary.certification.certifiedBy);
  assert.ok(summary.certification.standardsCompliance.includes('WANA_MASTER_BLUEPRINT'));
});
