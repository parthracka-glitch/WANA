const admin = require("../configuration/firebaseConfig");
const { AppError } = require("../middleware/errorHandler");
const { writeAuditLog } = require("./auditService");
const NotificationService = require("./notificationService");
const ContactNotifier = require("./contactNotifier");

const db = admin.firestore();

// Haversine distance in kilometers
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Event Lifecycle Service (BE-06, BE-07, BE-16, BE-17)
 * Implements idempotent SOS ingestion, geospatial routing, atomic closure, and escalation.
 */
class EventLifecycleService {
  /**
   * Server-Side Geospatial Region Routing (BE-16)
   * Resolves region based on geofence proximity (< 50km).
   */
  static async resolveRegionForLocation(lat, lng) {
    const regionsSnapshot = await db.collection("regions").where("status", "==", "active").get();

    let closestRegion = null;
    let minDistance = Infinity;

    regionsSnapshot.forEach((doc) => {
      const region = doc.data();
      if (region.center && typeof region.center.lat === "number" && typeof region.center.lng === "number") {
        const dist = getDistanceKm(lat, lng, region.center.lat, region.center.lng);
        if (dist < minDistance) {
          minDistance = dist;
          closestRegion = { id: doc.id, ...region, distanceKm: dist };
        }
      }
    });

    // If within 50km radius of an active staffed center, route to that region
    if (closestRegion && minDistance <= 50) {
      return {
        regionId: closestRegion.id,
        regionName: closestRegion.name,
        distanceKm: minDistance,
        regionSource: "geofence_center",
      };
    }

    // Solapur / Pune default bounding coordinates fallback
    if (lat >= 17.3 && lat <= 18.0 && lng >= 75.5 && lng <= 76.3) {
      return { regionId: "solapur", regionName: "Solapur", distanceKm: minDistance, regionSource: "bounding_fallback" };
    }
    if (lat >= 18.2 && lat <= 18.9 && lng >= 73.5 && lng <= 74.3) {
      return { regionId: "pune", regionName: "Pune", distanceKm: minDistance, regionSource: "bounding_fallback" };
    }

    // Outside all defined jurisdictions
    return {
      regionId: "unrouted",
      regionName: "Unrouted Platform Emergency",
      distanceKm: minDistance,
      regionSource: "unrouted_alert",
    };
  }

  /**
   * Idempotent SOS Ingestion Pipeline (BE-06)
   */
  static async ingestSosEvent({
    eventId,
    victimUid,
    victimName = "Citizen",
    victimPhone = null,
    location,
    type = "GENERAL",
    batteryLevel = null,
    req = null,
  }) {
    if (!eventId || typeof eventId !== "string" || eventId.trim().length === 0) {
      throw new AppError("Client-generated UUID 'eventId' is mandatory for idempotent SOS.", 400, "MISSING_EVENT_ID");
    }

    if (!location || typeof location.latitude !== "number" || typeof location.longitude !== "number") {
      throw new AppError("Valid latitude and longitude coordinates are required.", 400, "INVALID_COORDINATES");
    }

    const cleanEventId = eventId.trim();

    // 1. Idempotency Check: Past Events
    const pastDoc = await db.collection("pastEvents").doc(cleanEventId).get();
    if (pastDoc.exists) {
      return {
        status: "ALREADY_RESOLVED",
        event: pastDoc.data(),
        idempotent: true,
      };
    }

    // 2. Idempotency Check: Ongoing Events
    const ongoingRef = db.collection("ongoingEvents").doc(cleanEventId);
    const ongoingDoc = await ongoingRef.get();
    if (ongoingDoc.exists) {
      return {
        status: "ALREADY_EXISTS",
        event: ongoingDoc.data(),
        idempotent: true,
      };
    }

    // 3. Geospatial Region Routing (BE-16)
    const routing = await this.resolveRegionForLocation(location.latitude, location.longitude);

    const newEvent = {
      id: cleanEventId,
      eventId: cleanEventId,
      type: type.toUpperCase(),
      status: "DISPATCHED",
      regionId: routing.regionId,
      region: routing.regionId,
      regionName: routing.regionName,
      regionSource: routing.regionSource,
      sos_clicked_by_uid: victimUid,
      userId: victimUid,
      victimName,
      victimPhone,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy || 10,
        address: location.address || null,
      },
      batteryLevel: batteryLevel !== undefined ? batteryLevel : null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
      stale: false,
      is_resolved: false,
      createdAtIso: new Date().toISOString(),
    };

    await ongoingRef.set(newEvent);

    // Asynchronous Regional Notification (BE-08a)
    NotificationService.notifyRegionalSupervisors({
      regionId: routing.regionId,
      eventId: cleanEventId,
      title: `EMERGENCY SOS: ${routing.regionName.toUpperCase()}`,
      body: `Priority ${type} emergency reported at ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
      priority: 'high',
      data: { type, eventId: cleanEventId, regionId: routing.regionId },
    }).catch((err) => console.warn('Non-fatal notification dispatch error:', err.message));

    // Asynchronous Emergency Contacts Alert with India TRAI DLT Template (BE-08b)
    ContactNotifier.notifyEmergencyContacts({
      victimUid,
      victimName,
      eventId: cleanEventId,
      location,
      regionId: routing.regionId,
    }).catch((err) => console.warn('Non-fatal emergency contact alert error:', err.message));

    // Audit Log Entry
    await writeAuditLog({
      actorUid: victimUid,
      actorRole: "victim",
      action: "SOS_INGESTED",
      targetId: cleanEventId,
      regionId: routing.regionId,
      details: { type, location, routing },
      req,
      customDocId: `audit_${cleanEventId}_ingest`,
    });

    return {
      status: "CREATED",
      event: newEvent,
      idempotent: false,
    };
  }

  /**
   * Incident Acknowledgement (BE-17)
   */
  static async acknowledgeEvent({ eventId, supervisorUid, supervisorRole, supervisorRegionId, req = null }) {
    const ongoingRef = db.collection("ongoingEvents").doc(eventId);

    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ongoingRef);
      if (!doc.exists) {
        throw new AppError(`Active incident '${eventId}' not found.`, 404, "EVENT_NOT_FOUND");
      }

      const eventData = doc.data();

      // Regional isolation check
      if (supervisorRegionId !== "all" && supervisorRegionId !== eventData.regionId) {
        throw new AppError(
          `Unauthorized: Incident belongs to region '${eventData.regionId}', not '${supervisorRegionId}'.`,
          403,
          "CROSS_REGION_FORBIDDEN"
        );
      }

      if (eventData.status === "ACKNOWLEDGED") {
        return { message: "Incident already acknowledged.", event: eventData, redundant: true };
      }

      const updatePayload = {
        status: "ACKNOWLEDGED",
        ackBy: supervisorUid,
        ackAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      transaction.update(ongoingRef, updatePayload);

      await writeAuditLog({
        actorUid: supervisorUid,
        actorRole: supervisorRole,
        action: "EVENT_ACKNOWLEDGED",
        targetId: eventId,
        regionId: eventData.regionId,
        details: { previousStatus: eventData.status },
        req,
      });

      return { message: "Incident successfully acknowledged.", event: { ...eventData, ...updatePayload } };
    });
  }

  /**
   * Reference Atomic closeEvent Transaction (BE-07)
   */
  static async closeEvent({
    eventId,
    actorUid,
    actorRole,
    actorRegionId,
    resolutionType = "SUPERVISOR_CLOSED",
    resolutionNotes = "",
    req = null,
  }) {
    const validResolutions = ["SAFE", "SUPERVISOR_CLOSED", "FALSE_ALARM", "CANCELLED", "STALE_CLOSED", "TRANSFERRED"];
    if (!validResolutions.includes(resolutionType)) {
      throw new AppError(`Invalid resolution type '${resolutionType}'.`, 400, "INVALID_RESOLUTION_TYPE");
    }

    const pastRef = db.collection("pastEvents").doc(eventId);
    const ongoingRef = db.collection("ongoingEvents").doc(eventId);
    const acceptedRef = db.collection("acceptedEvents").doc(eventId);

    // 1. Check if already resolved (retry-safe idempotency)
    const pastDoc = await pastRef.get();
    if (pastDoc.exists) {
      return { result: "ALREADY_RESOLVED", event: pastDoc.data() };
    }

    const ongoingDoc = await ongoingRef.get();
    if (!ongoingDoc.exists) {
      throw new AppError(`Active incident '${eventId}' not found in ongoingEvents.`, 404, "EVENT_NOT_FOUND");
    }

    const eventData = ongoingDoc.data();

    // 2. Authorization check: Owner OR Matching regional staff
    const isOwner = actorUid === (eventData.sos_clicked_by_uid || eventData.userId);
    const isAuthorizedStaff =
      ["supervisor", "admin"].includes(actorRole) &&
      (actorRegionId === "all" || actorRegionId === eventData.regionId);

    if (!isOwner && !isAuthorizedStaff) {
      throw new AppError("Forbidden: Unauthorized to resolve this emergency incident.", 403, "FORBIDDEN");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // 3. Query acceptors
    const acceptorsSnapshot = await acceptedRef.collection("acceptors").get();

    // 4. Atomic batch write
    const batch = db.batch();

    const pastEventRecord = {
      ...eventData,
      is_resolved: true,
      status: "RESOLVED",
      resolutionType,
      resolved_at: now,
      resolved_by: actorUid,
      resolved_by_role: actorRole,
      resolved_reason: resolutionNotes || `Resolved as ${resolutionType}`,
      resolutionNotes: resolutionNotes || "",
      archivedAtIso: new Date().toISOString(),
    };

    batch.set(pastRef, pastEventRecord);

    // Copy acceptors
    if (!acceptorsSnapshot.empty) {
      for (const acc of acceptorsSnapshot.docs) {
        const pastAccRef = pastRef.collection("acceptors").doc(acc.id);
        batch.set(pastAccRef, {
          ...acc.data(),
          archived_at: now,
          archived_reason: `Event resolved as ${resolutionType}`,
        });
        batch.delete(acc.ref);
      }
      batch.delete(acceptedRef);
    }

    // Delete from ongoingEvents
    batch.delete(ongoingRef);

    // Append deterministic audit log
    const auditDocId = `audit_${eventId}_close`;
    const auditRef = db.collection("auditLogs").doc(auditDocId);
    batch.set(auditRef, {
      id: auditDocId,
      action: "EVENT_RESOLVED",
      targetId: eventId,
      actorUid,
      actorRole,
      regionId: eventData.regionId,
      details: { resolutionType, resolutionNotes },
      requestId: req?.id || req?.requestId || null,
      ip: req?.ip || null,
      userAgent: req?.headers ? req.headers["user-agent"] : null,
      ts: now,
      createdAtIso: new Date().toISOString(),
    });

    await batch.commit();

    return {
      result: "RESOLVED_SUCCESSFULLY",
      eventId,
      resolvedBy: actorUid,
      resolutionType,
      acceptorsArchived: acceptorsSnapshot.size,
    };
  }

  /**
   * Stale & Escalation Evaluator (BE-17)
   */
  static async evaluateEscalationsAndStale(options = {}) {
    const ackSlaMs = (options.ackSlaSeconds || 60) * 1000;
    const staleMs = (options.staleSeconds || 300) * 1000;
    const now = Date.now();

    const snapshot = await db.collection("ongoingEvents").where("is_resolved", "==", false).get();

    let escalatedCount = 0;
    let staleCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const dispatchedTime = data.dispatchedAt?.toDate?.() ? data.dispatchedAt.toDate().getTime() : now;
      const heartbeatTime = data.lastHeartbeatAt?.toDate?.() ? data.lastHeartbeatAt.toDate().getTime() : dispatchedTime;

      const updates = {};

      // Check Escalation: Unacknowledged past SLA
      if (data.status === "DISPATCHED" && now - dispatchedTime > ackSlaMs) {
        updates.status = "ESCALATED";
        updates.escalatedAt = admin.firestore.FieldValue.serverTimestamp();
        escalatedCount++;

        NotificationService.notifyRegionalSupervisors({
          regionId: data.regionId,
          eventId: doc.id,
          title: `⚠️ ESCALATION ALERT: UNACKNOWLEDGED SOS`,
          body: `Emergency incident '${doc.id}' exceeded SLA threshold without supervisor acknowledgement.`,
          priority: 'high',
          data: { eventId: doc.id, regionId: data.regionId, escalation: 'true' },
        }).catch((err) => console.warn('Non-fatal notification dispatch error:', err.message));
      }

      // Check Stale: Heartbeat expired
      if (now - heartbeatTime > staleMs && !data.stale) {
        updates.stale = true;
        updates.staleMarkedAt = admin.firestore.FieldValue.serverTimestamp();
        staleCount++;
      }

      if (Object.keys(updates).length > 0) {
        await doc.ref.update(updates);
      }
    }

    return {
      evaluatedCount: snapshot.size,
      escalatedCount,
      staleCount,
    };
  }

  /**
   * Continuous Location Heartbeat Streamer (M-02)
   * Receives periodic GPS breadcrumbs from mobile foreground service.
   * Updates current incident coordinates, resets stale flag, and appends breadcrumbs.
   */
  static async recordLocationHeartbeat({
    eventId,
    location,
    batteryLevel = null,
    callerUid = null,
  }) {
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError("Invalid or missing 'eventId'.", 400, 'INVALID_EVENT_ID');
    }

    if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      throw new AppError('Valid latitude and longitude coordinates are required.', 400, 'INVALID_COORDINATES');
    }

    const eventRef = db.collection('ongoingEvents').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new AppError(`Ongoing event '${eventId}' not found.`, 404, 'EVENT_NOT_FOUND');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    const updatePayload = {
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy || 10,
        speed: location.speed !== undefined ? location.speed : null,
        heading: location.heading !== undefined ? location.heading : null,
      },
      lastHeartbeatAt: now,
      stale: false,
    };

    if (batteryLevel !== null && batteryLevel !== undefined) {
      updatePayload.batteryLevel = batteryLevel;
    }

    await eventRef.update(updatePayload);

    // Append to breadcrumbs subcollection for historical route tracing
    await eventRef.collection('breadcrumbs').add({
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy || 10,
      speed: location.speed !== undefined ? location.speed : null,
      heading: location.heading !== undefined ? location.heading : null,
      timestamp: now,
      recordedAtIso: new Date().toISOString(),
    }).catch((err) => console.warn('Breadcrumb append warning:', err.message));

    return {
      success: true,
      eventId,
      location: updatePayload.location,
      stale: false,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = EventLifecycleService;
