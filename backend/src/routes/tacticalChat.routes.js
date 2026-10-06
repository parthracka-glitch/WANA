const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const TacticalChatService = require('../services/tacticalChatService');

/**
 * GET /tactical-chat/:eventId (FE-21 / BE-28)
 * Retrieve full silent tactical conversation thread for an incident.
 */
router.get('/:eventId', authMiddleware, async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const result = await TacticalChatService.getTacticalMessages(eventId);
    return res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tactical-chat/:eventId/query (FE-21 / BE-28)
 * Control Room Supervisor sends a pre-canned tactical query.
 */
router.post('/:eventId/query', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { queryCode, customText } = req.body;
    const supervisorUid = req.user.uid;
    const supervisorName = req.user.name || req.user.email || 'Supervisor';

    const result = await TacticalChatService.sendSupervisorQuery({
      eventId,
      supervisorUid,
      supervisorName,
      queryCode,
      customText,
      req,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tactical-chat/:eventId/respond (M-15 / BE-28)
 * Citizen taps a covert single-tap answer without emitting audible sound or vibration.
 */
router.post('/:eventId/respond', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { answerCode, customText } = req.body;
    const victimUid = req.user?.uid || null;

    const result = await TacticalChatService.recordVictimResponse({
      eventId,
      victimUid,
      answerCode,
      customText,
      req,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
