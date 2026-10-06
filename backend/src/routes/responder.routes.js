const express = require('express');
const router = express.Router();
const ResponderService = require('../services/responderService');
const { authMiddleware } = require('../middleware/authMiddleware');

/**
 * Community Responder Routes (BE-23)
 * Endpoints for citizen volunteers and field units responding to active SOS events.
 */

// POST /responders/events/:id/accept
router.post('/events/:id/accept', authMiddleware, async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const responderUid = req.user.uid;
    const { name, phone, location } = req.body;

    const result = await ResponderService.acceptEvent({
      eventId,
      responderUid,
      responderName: name || req.user.name || 'Volunteer',
      responderPhone: phone || req.user.phone || null,
      responderEmail: req.user.email || null,
      location,
      req,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /responders/events/:id/decline
router.post('/events/:id/decline', authMiddleware, async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const responderUid = req.user.uid;
    const { reason } = req.body;

    const result = await ResponderService.declineOrWithdraw({
      eventId,
      responderUid,
      reason,
      req,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

// GET /responders/events/:id
router.get('/events/:id', authMiddleware, async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const responders = await ResponderService.getRespondersForEvent(eventId);
    res.status(200).json({ success: true, eventId, count: responders.length, responders });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
