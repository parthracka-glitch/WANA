const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const EvidenceService = require('../services/evidenceService');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const admin = require('../configuration/firebaseConfig');
const db = admin.firestore();
const { AppError } = require('../middleware/errorHandler');

/**
 * POST /evidence/upload (BE-09 & M-04)
 * Ingest chunked multimedia evidence during active SOS.
 * Verifies SHA-256 integrity digest before persisting.
 */
router.post('/upload', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const {
      eventId,
      chunkIndex,
      totalChunks,
      mediaType,
      mimeType,
      clientSha256,
      payloadBase64,
    } = req.body;

    if (!payloadBase64) {
      throw new AppError('Evidence chunk data (payloadBase64) is required', 400, 'MISSING_PAYLOAD');
    }

    const payloadBuffer = Buffer.from(payloadBase64, 'base64');

    const result = await EvidenceService.ingestChunk({
      eventId,
      chunkIndex,
      totalChunks,
      mediaType,
      mimeType,
      clientSha256,
      payloadBuffer,
      uploaderUid: req.user?.uid || null,
      req,
    });

    return res.status(201).json({
      success: true,
      message: 'Evidence chunk ingested and SHA-256 checksum verified',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /evidence/:eventId (FE-18)
 * List all evidence segments for an event.
 * Scoped to authorized regional supervisor or admin.
 */
router.get('/:eventId', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const actorRole = req.user.role;
    const actorRegionId = (req.user.regionId || req.user.region || 'all').toString().toLowerCase().trim();

    const items = await EvidenceService.listEvidenceForEvent({
      eventId,
      actorRole,
      actorRegionId,
    });

    return res.status(200).json({
      success: true,
      eventId,
      count: items.length,
      data: items,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /evidence/:eventId/:evidenceId/playback-url (FE-18 & LEGAL-01)
 * Generates a short-lived (5-minute TTL) signed streaming URL and records an immutable audit log.
 */
router.post('/:eventId/:evidenceId/playback-url', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { eventId, evidenceId } = req.params;
    const actorUid = req.user.uid;
    const actorRole = req.user.role;
    const actorRegionId = (req.user.regionId || req.user.region || 'all').toString().toLowerCase().trim();

    const result = await EvidenceService.getSignedPlaybackUrl({
      eventId,
      evidenceId,
      actorUid,
      actorRole,
      actorRegionId,
      req,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /evidence/:eventId/:evidenceId/stream (FE-18)
 * Streams evidence media chunk using validated HMAC token and expiration check.
 * Direct downloads are prohibited.
 */
router.get('/:eventId/:evidenceId/stream', async (req, res, next) => {
  try {
    const { eventId, evidenceId } = req.params;
    const { token, expires, actor } = req.query;

    if (!token || !expires || !actor) {
      return res.status(403).json({ error: { code: 'UNAUTHORIZED_STREAM', message: 'Missing stream authorization token' } });
    }

    const expiresAt = Number(expires);
    if (Date.now() > expiresAt) {
      return res.status(403).json({ error: { code: 'TOKEN_EXPIRED', message: 'Streaming session has expired. Request a new playback link.' } });
    }

    const tokenSecret = process.env.JWT_SECRET || 'wana_evidence_signing_key_secure_2026';
    const expectedSig = crypto
      .createHmac('sha256', tokenSecret)
      .update(`${eventId}:${evidenceId}:${expiresAt}:${actor}`)
      .digest('hex');

    if (token !== expectedSig) {
      return res.status(403).json({ error: { code: 'INVALID_SIGNATURE', message: 'Tampered or invalid stream token' } });
    }

    // Retrieve chunk payload
    const doc = await db.collection('evidence').doc(evidenceId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence media chunk not found' } });
    }

    const chunk = doc.data();
    if (!chunk.dataBase64) {
      return res.status(500).json({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Media stream buffer unavailable' } });
    }

    const buffer = Buffer.from(chunk.dataBase64, 'base64');

    res.writeHead(200, {
      'Content-Type': chunk.mimeType || 'audio/webm',
      'Content-Length': buffer.length,
      'Content-Disposition': 'inline', // Prohibits forced download attachment
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    });

    return res.end(buffer);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /evidence/cleanup-expired (BE-09)
 * Automated retention purge job.
 */
router.post('/cleanup-expired', authMiddleware, requireRole(['admin']), async (req, res, next) => {
  try {
    const result = await EvidenceService.cleanupExpiredEvidence();
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
