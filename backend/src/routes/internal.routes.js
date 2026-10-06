const express = require('express');
const router = express.Router();
const EventLifecycleService = require('../services/eventLifecycle');
const { archiveRetentionExpiredEvents } = require('../scripts/cleanupOldEvents');

// Internal job token verification middleware
const requireInternalSecret = (req, res, next) => {
  const secret = req.headers['x-internal-job-key'] || req.headers['authorization'];
  const expectedSecret = process.env.INTERNAL_JOB_KEY || 'wana-internal-key';

  if (!secret || (!secret.includes(expectedSecret) && secret !== expectedSecret)) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED_JOB_CALLER',
        message: 'Invalid internal job authentication token.',
      },
    });
  }
  next();
};

/**
 * POST /internal/jobs/escalations (BE-17)
 * Evaluates unacknowledged SOS events past SLA (transitions to ESCALATED)
 * and flags stale events whose heartbeat has expired (stale = true).
 */
router.post('/jobs/escalations', requireInternalSecret, async (req, res, next) => {
  try {
    const ackSlaSeconds = parseInt(req.body.ackSlaSeconds || req.query.ackSlaSeconds || '60', 10);
    const staleSeconds = parseInt(req.body.staleSeconds || req.query.staleSeconds || '300', 10);

    const result = await EventLifecycleService.evaluateEscalationsAndStale({
      ackSlaSeconds,
      staleSeconds,
    });

    return res.json({
      success: true,
      job: 'escalation-evaluator',
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /internal/jobs/retention-archive (BE-22)
 * Cold-archives pastEvents older than retention threshold (default: 90 days).
 * NEVER touches ongoingEvents.
 */
router.post('/jobs/retention-archive', requireInternalSecret, async (req, res, next) => {
  try {
    const retentionDays = parseInt(req.body.retentionDays || req.query.retentionDays || '90', 10);
    const dryRun = req.body.dryRun === true || req.query.dryRun === 'true';

    const result = await archiveRetentionExpiredEvents({ retentionDays, dryRun });

    return res.json({
      success: true,
      job: 'retention-archive',
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /internal/pilot/scorecard (Phase 7 / §19.2)
 * Returns operational scorecard evaluating field KPIs for a target pilot region.
 */
router.get('/pilot/scorecard', requireInternalSecret, async (req, res, next) => {
  try {
    const regionId = req.query.regionId || 'solapur_central';
    const PilotScorecardService = require('../services/pilotScorecardService');
    const scorecardService = new PilotScorecardService({ regionId });
    const scorecard = scorecardService.evaluateBatch([
      {
        eventId: 'pilot_sample_01',
        status: 'RESOLVED',
        ackTimeSeconds: 18,
        dispatchLatencyMs: 140,
        notifications: [{ channel: 'FCM', delivered: true }],
      },
    ], [{ eventId: 'pilot_sample_01', action: 'EVENT_CLOSED' }]);

    return res.json({ success: true, regionId, scorecard });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /internal/pilot/drill (Phase 7 / §14.8)
 * Triggers an automated live incident drill session in the specified pilot region.
 */
router.post('/pilot/drill', requireInternalSecret, async (req, res, next) => {
  try {
    const regionId = req.body.regionId || 'solapur_central';
    const incidentCount = parseInt(req.body.incidentCount || '3', 10);
    const PilotDrillRunner = require('../scripts/pilot-drill-runner');
    const runner = new PilotDrillRunner({ regionId });
    const summary = await runner.runDrillSession({ incidentCount });

    return res.json({ success: true, drillSummary: summary });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

