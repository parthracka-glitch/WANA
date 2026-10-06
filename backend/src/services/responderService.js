const admin = require('../configuration/firebaseConfig');
const db = admin.firestore();
const { AppError } = require('../middleware/errorHandler');
const { writeAuditLog } = require('./auditService');

/**
 * Community Responder / Volunteer Accept Flow Service (BE-23)
 * Manages field responder assignments to active emergency incidents.
 */
class ResponderService {
  /**
   * Accepts an emergency incident
   */
  static async acceptEvent({
    eventId,
    responderUid,
    responderName,
    responderPhone,
    responderEmail,
    location,
    req = null,
  }) {
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError("Invalid or missing 'eventId'.", 400, 'INVALID_EVENT_ID');
    }

    if (!responderUid) {
      throw new AppError('Authentication required to respond to emergencies.', 401, 'UNAUTHORIZED');
    }

    // 1. Verify ongoing event exists and is not resolved
    const ongoingRef = db.collection('ongoingEvents').doc(eventId);
    const ongoingDoc = await ongoingRef.get();

    if (!ongoingDoc.exists) {
      throw new AppError(`Ongoing emergency event '${eventId}' not found.`, 404, 'EVENT_NOT_FOUND');
    }

    const eventData = ongoingDoc.data();
    if (eventData.is_resolved) {
      throw new AppError(`Event '${eventId}' is already resolved.`, 400, 'EVENT_ALREADY_RESOLVED');
    }

    const acceptedParentRef = db.collection('acceptedEvents').doc(eventId);
    const acceptorRef = acceptedParentRef.collection('acceptors').doc(responderUid);

    const now = admin.firestore.FieldValue.serverTimestamp();

    // 2. Atomic write
    const batch = db.batch();

    // Ensure parent acceptedEvents document exists
    batch.set(
      acceptedParentRef,
      {
        eventId,
        regionId: eventData.regionId,
        updatedAt: now,
      },
      { merge: true }
    );

    // Set acceptor record with denormalized regionId for collection group querying (FE-17)
    const acceptorRecord = {
      uid: responderUid,
      eventId,
      name: responderName || 'Community Volunteer',
      phone: responderPhone || null,
      email: responderEmail || null,
      regionId: eventData.regionId,
      status: 'EN_ROUTE',
      active: true,
      userLocation: location
        ? {
            lat: location.latitude !== undefined ? location.latitude : location.lat,
            lng: location.longitude !== undefined ? location.longitude : location.lng,
          }
        : null,
      acceptedAt: now,
      acceptedAtIso: new Date().toISOString(),
    };

    batch.set(acceptorRef, acceptorRecord);

    await batch.commit();

    // 3. Write audit log
    await writeAuditLog({
      actorUid: responderUid,
      actorRole: 'volunteer',
      action: 'VOLUNTEER_ACCEPTED',
      targetId: eventId,
      regionId: eventData.regionId,
      details: { responderName, location },
      req,
    }).catch(() => {});

    console.log(`✅ Volunteer ${responderUid} (${responderName}) accepted event ${eventId} in region ${eventData.regionId}`);

    return {
      success: true,
      eventId,
      responder: acceptorRecord,
    };
  }

  /**
   * Withdraws from responding to an emergency incident
   */
  static async declineOrWithdraw({ eventId, responderUid, reason = 'Unavailable', req = null }) {
    const acceptorRef = db.collection('acceptedEvents').doc(eventId).collection('acceptors').doc(responderUid);
    const doc = await acceptorRef.get();

    if (!doc.exists) {
      return { success: true, message: 'Not an active responder for this event.' };
    }

    await acceptorRef.update({
      active: false,
      status: 'WITHDRAWN',
      withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
      withdrawnReason: reason,
    });

    await writeAuditLog({
      actorUid: responderUid,
      actorRole: 'volunteer',
      action: 'VOLUNTEER_WITHDRAWN',
      targetId: eventId,
      details: { reason },
      req,
    }).catch(() => {});

    return { success: true, eventId, responderUid, status: 'WITHDRAWN' };
  }

  /**
   * Lists all active responders for an incident
   */
  static async getRespondersForEvent(eventId) {
    const snapshot = await db
      .collection('acceptedEvents')
      .doc(eventId)
      .collection('acceptors')
      .where('active', '==', true)
      .get();

    const responders = [];
    snapshot.forEach((doc) => responders.push({ id: doc.id, ...doc.data() }));

    return responders;
  }
}

module.exports = ResponderService;
