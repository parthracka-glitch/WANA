const express = require('express');
const router = express.Router();
const { optionalAuthMiddleware } = require('../middleware/authMiddleware');
const SmsUplinkService = require('../services/smsUplinkService');

/**
 * POST /sms-uplink/webhook (BE-25)
 * Webhook ingestion endpoint for cellular SMS gateways (Twilio, Exotel, ERSS Dial 112).
 * Supports standard parameters: From/from/sender and Body/body/message.
 */
router.post('/webhook', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const from = req.body.From || req.body.from || req.body.sender || req.query.From || null;
    const body = req.body.Body || req.body.body || req.body.message || req.query.Body || null;
    const gateway = req.body.gateway || req.headers['x-gateway-provider'] || 'GENERIC_SMS_GATEWAY';

    const result = await SmsUplinkService.processIncomingSms({
      from,
      body,
      gateway,
      req,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
        status: result.status,
      });
    }

    return res.status(200).json({
      success: true,
      status: result.status,
      eventId: result.eventId,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
