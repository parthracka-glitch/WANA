const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const CapAlertService = require('../services/capAlertService');

/**
 * GET /interop/cap/v1/alerts/:eventId.xml (BE-27)
 * Serves standard OASIS CAP v1.2 XML alert stream for ERSS Dial 112 / CAD automated ingest.
 */
router.get('/cap/v1/alerts/:eventId.xml', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { xml } = await CapAlertService.generateCapAlertXml({ eventId });

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).send(xml);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /interop/cap/v1/dispatch/:eventId (BE-27)
 * Trigger automated CAD transmission to Government ERSS Dial 112 system.
 */
router.post('/cap/v1/dispatch/:eventId', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { cadEndpointUrl } = req.body;

    const result = await CapAlertService.dispatchToErssCad({
      eventId,
      cadEndpointUrl,
      req,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
