const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');

/**
 * POST /cleanup/events
 * DECOMMISSIONED (HF-03 / BE-22)
 * Uncoordinated in-process cleanup daemons and unauthenticated manual cleanup
 * endpoints have been removed to prevent accidental or unauthorized archival of emergency events.
 * Archival is managed exclusively via Cloud Scheduler and audited Cloud Run jobs.
 */
router.post('/events', authMiddleware, (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Manual cleanup endpoint decommissioned. Scheduled lifecycle is managed via Cloud Scheduler.',
    code: 'CLEANUP_DECOMMISSIONED'
  });
});

module.exports = router;
