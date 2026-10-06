const express = require('express');
const router = express.Router();
const admin = require('../configuration/firebaseConfig');
const db = admin.firestore();
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbacMiddleware');
const EventLifecycleService = require('../services/eventLifecycle');

/**
 * POST /events/sos (BE-06, BE-16)
 * Idempotent SOS Ingestion Pipeline with server-side geospatial routing.
 * Optional authentication: citizen app may supply Bearer token or pass victimUid.
 */
router.post('/sos', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const {
      eventId,
      victimUid,
      victimName,
      victimPhone,
      location,
      type,
      batteryLevel,
    } = req.body;

    const callerUid = req.user?.uid || victimUid || `anon_${Date.now()}`;

    const result = await EventLifecycleService.ingestSosEvent({
      eventId,
      victimUid: callerUid,
      victimName: victimName || (req.user?.name || req.user?.email || 'Citizen'),
      victimPhone: victimPhone || (req.user?.phone || null),
      location,
      type: type || 'GENERAL',
      batteryLevel,
      req,
    });

    const statusCode = result.status === 'CREATED' ? 201 : 200;
    return res.status(statusCode).json({
      success: true,
      data: result.event,
      idempotent: result.idempotent,
      status: result.status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /events/:eventId/heartbeat (M-02)
 * Continuous GPS location streamer called every 15-30 seconds by mobile foreground service.
 * Refreshes coordinates, resets stale heartbeat status, and stores route breadcrumbs.
 */
router.post('/:eventId/heartbeat', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { location, batteryLevel } = req.body;

    const result = await EventLifecycleService.recordLocationHeartbeat({
      eventId,
      location,
      batteryLevel,
      callerUid: req.user?.uid || null,
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
 * GET /events/:eventId/breadcrumbs (M-02)
 * Returns the recorded GPS route breadcrumbs for an incident.
 */
router.get('/:eventId/breadcrumbs', authMiddleware, async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const snapshot = await db
      .collection('ongoingEvents')
      .doc(eventId)
      .collection('breadcrumbs')
      .orderBy('timestamp', 'asc')
      .limit(200)
      .get();

    const breadcrumbs = [];
    snapshot.forEach((doc) => breadcrumbs.push({ id: doc.id, ...doc.data() }));

    return res.json({
      success: true,
      eventId,
      count: breadcrumbs.length,
      data: breadcrumbs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /events/:eventId/ack (BE-17)
 * Acknowledge incident: transitions status from DISPATCHED -> ACKNOWLEDGED.
 * Scoped to regional supervisor or admin.
 */
router.post('/:eventId/ack', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const supervisorUid = req.user.uid;
    const supervisorRole = req.user.role;
    const supervisorRegionId = req.user.regionId || req.user.region || 'all';

    const result = await EventLifecycleService.acknowledgeEvent({
      eventId,
      supervisorUid,
      supervisorRole,
      supervisorRegionId: supervisorRegionId.toString().toLowerCase().trim(),
      req,
    });

    return res.json({
      success: true,
      message: result.message,
      data: result.event,
      redundant: !!result.redundant,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /events/resolve/:eventId (BE-07)
 * Atomic incident closure: moves event from ongoingEvents -> pastEvents with acceptors.
 * Scoped to victim owner OR authorized regional supervisor / admin.
 */
router.post('/resolve/:eventId', authMiddleware, async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const actorUid = req.user.uid;
    const actorRole = req.user.role || 'user';
    const actorRegionId = (req.user.regionId || req.user.region || 'all').toString().toLowerCase().trim();
    const resolutionType = req.body.resolutionType || (actorRole === 'user' ? 'SAFE' : 'SUPERVISOR_CLOSED');
    const resolutionNotes = req.body.reason || req.body.resolutionNotes || '';

    const result = await EventLifecycleService.closeEvent({
      eventId,
      actorUid,
      actorRole,
      actorRegionId,
      resolutionType,
      resolutionNotes,
      req,
    });

    return res.json({
      success: true,
      message: 'Event resolved successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /events/ongoing (FE-04, FE-06)
 * Real-time list of active ongoing events filtered strictly by supervisor region.
 */
router.get('/ongoing', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const callerRegion = (req.user.regionId || req.user.region || 'all').toString().toLowerCase().trim();
    const targetRegion = (req.query.regionId || callerRegion).toString().toLowerCase().trim();

    let queryRef = db.collection('ongoingEvents');

    // Region restriction: supervisor can only query their assigned region
    if (callerRegion !== 'all') {
      queryRef = queryRef.where('regionId', '==', callerRegion);
    } else if (targetRegion && targetRegion !== 'all') {
      queryRef = queryRef.where('regionId', '==', targetRegion);
    }

    if (req.query.status) {
      const statuses = req.query.status.split(',').map((s) => s.trim().toUpperCase());
      if (statuses.length === 1) {
        queryRef = queryRef.where('status', '==', statuses[0]);
      }
    }

    const snapshot = await queryRef.get();
    const events = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      // Apply in-memory multi-status or stale filter if required
      if (req.query.stale !== undefined) {
        const isStale = req.query.stale === 'true';
        if (!!data.stale !== isStale) return;
      }
      events.push({ id: doc.id, ...data });
    });

    return res.json({
      success: true,
      count: events.length,
      data: events,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /events/past (FE-07)
 * Historical past events archive with server-side pagination and region scoping.
 */
router.get('/past', authMiddleware, requireRole(['supervisor', 'admin']), async (req, res, next) => {
  try {
    const callerRegion = (req.user.regionId || req.user.region || 'all').toString().toLowerCase().trim();
    const targetRegion = (req.query.regionId || callerRegion).toString().toLowerCase().trim();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));

    let queryRef = db.collection('pastEvents');

    if (callerRegion !== 'all') {
      queryRef = queryRef.where('regionId', '==', callerRegion);
    } else if (targetRegion && targetRegion !== 'all') {
      queryRef = queryRef.where('regionId', '==', targetRegion);
    }

    const snapshot = await queryRef.get();
    let records = [];
    snapshot.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
    });

    // Sort descending by resolved_at or timestamp
    records.sort((a, b) => {
      const aTime = a.resolved_at?.toMillis ? a.resolved_at.toMillis() : (a.timestamp?.toMillis ? a.timestamp.toMillis() : 0);
      const bTime = b.resolved_at?.toMillis ? b.resolved_at.toMillis() : (b.timestamp?.toMillis ? b.timestamp.toMillis() : 0);
      return bTime - aTime;
    });

    const total = records.length;
    const startIndex = (page - 1) * limit;
    const paginated = records.slice(startIndex, startIndex + limit);

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      data: paginated,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /events/:eventId (FE-05)
 * Detailed view of an incident with its acceptors subcollection.
 */
router.get('/:eventId', authMiddleware, async (req, res, next) => {
  try {
    const { eventId } = req.params;

    let eventDoc = await db.collection('ongoingEvents').doc(eventId).get();
    let isOngoing = true;

    if (!eventDoc.exists) {
      eventDoc = await db.collection('pastEvents').doc(eventId).get();
      isOngoing = false;
    }

    if (!eventDoc.exists) {
      return res.status(404).json({ success: false, message: `Event '${eventId}' not found.` });
    }

    const eventData = eventDoc.data();
    const callerRegion = (req.user.regionId || req.user.region || 'all').toString().toLowerCase().trim();

    // Check regional isolation if caller is supervisor
    if (req.user.role === 'supervisor' && callerRegion !== 'all' && eventData.regionId !== callerRegion) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Incident belongs to region '${eventData.regionId}', not '${callerRegion}'.`,
      });
    }

    // Fetch acceptors
    const acceptorsRef = isOngoing
      ? db.collection('acceptedEvents').doc(eventId).collection('acceptors')
      : eventDoc.ref.collection('acceptors');

    const acceptorsSnapshot = await acceptorsRef.get();
    const acceptors = [];
    acceptorsSnapshot.forEach((doc) => {
      acceptors.push({ id: doc.id, ...doc.data() });
    });

    return res.json({
      success: true,
      data: {
        id: eventDoc.id,
        ...eventData,
        isOngoing,
        acceptors,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
