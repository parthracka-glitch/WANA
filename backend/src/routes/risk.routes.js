const express = require('express');
const router = express.Router();
const RiskEngine = require('../services/riskEngine');
const ShadowEvaluator = require('../services/shadowEvaluator');
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');

/**
 * POST /risk/evaluate (M-05 & BE-15)
 * Explainable geospatial & temporal risk evaluation for locations or safe-route planning.
 */
router.post('/evaluate', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const { latitude, longitude, timestamp, historicalIncidentsCount } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        error: { code: 'INVALID_COORDINATES', message: 'latitude and longitude are required' },
      });
    }

    const assessment = await RiskEngine.evaluateLocationRisk({
      latitude: Number(latitude),
      longitude: Number(longitude),
      timestamp: timestamp ? Number(timestamp) : Date.now(),
      historicalIncidentsCount: historicalIncidentsCount !== undefined ? Number(historicalIncidentsCount) : null,
    });

    return res.status(200).json(assessment);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /risk/shadow-eval (AI-02)
 * Ingest shadow-mode AI anomaly telemetry from mobile devices without user alert disruption.
 */
router.post('/shadow-eval', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const {
      tripId,
      detectorName,
      detectorVersion,
      metrics,
      anomalyDetected,
      confidence,
    } = req.body;

    const result = await ShadowEvaluator.logShadowInference({
      tripId,
      detectorName,
      detectorVersion,
      metrics,
      anomalyDetected,
      confidence,
    });

    return res.status(200).json({
      success: true,
      message: 'Shadow telemetry recorded for model validation',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
