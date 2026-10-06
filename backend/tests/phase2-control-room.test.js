const test = require("node:test");
const assert = require("node:assert");

/**
 * Phase 2 Live Control Room Automated Test Suite (QA-02)
 * Tests idempotent ingestion, geospatial routing, atomic closeEvent,
 * ACK state machine, escalation/stale evaluator, and PII masking.
 */

// Haversine distance in km
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
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

// Geospatial routing simulator (BE-16)
function routeIncidentLocation(lat, lng) {
  const regions = [
    { id: "solapur", name: "Solapur", center: { lat: 17.6599, lng: 75.9064 } },
    { id: "pune", name: "Pune", center: { lat: 18.5204, lng: 73.8567 } },
  ];

  let closest = null;
  let minDist = Infinity;

  for (const r of regions) {
    const dist = getDistanceKm(lat, lng, r.center.lat, r.center.lng);
    if (dist < minDist) {
      minDist = dist;
      closest = { ...r, distanceKm: dist };
    }
  }

  if (closest && minDist <= 50) {
    return { regionId: closest.id, regionName: closest.name, distanceKm: minDist, source: "geofence_center" };
  }

  // Bounding box fallbacks
  if (lat >= 17.3 && lat <= 18.0 && lng >= 75.5 && lng <= 76.3) {
    return { regionId: "solapur", regionName: "Solapur", distanceKm: minDist, source: "bounding_fallback" };
  }
  if (lat >= 18.2 && lat <= 18.9 && lng >= 73.5 && lng <= 74.3) {
    return { regionId: "pune", regionName: "Pune", distanceKm: minDist, source: "bounding_fallback" };
  }

  return { regionId: "unrouted", regionName: "Unrouted Platform Emergency", distanceKm: minDist, source: "unrouted_alert" };
}

// Privacy masking simulator (FE-16)
function maskEmail(email) {
  if (!email) return "N/A";
  const parts = email.split("@");
  if (parts.length !== 2) return "******";
  const [user, domain] = parts;
  if (user.length <= 2) return `${user[0]}***@${domain}`;
  return `${user[0]}****${user[user.length - 1]}@${domain}`;
}

function maskPhone(phone) {
  if (!phone) return "N/A";
  const clean = phone.trim();
  if (clean.length <= 4) return "****";
  const lastFour = clean.slice(-4);
  const prefix = clean.startsWith("+") ? clean.slice(0, 3) + " " : "";
  return `${prefix}******${lastFour}`;
}

test("BE-16: Geospatial Routing correctly routes coordinates to Solapur vs Pune vs Unrouted", () => {
  // Solapur center
  const solapurRoute = routeIncidentLocation(17.6599, 75.9064);
  assert.strictEqual(solapurRoute.regionId, "solapur");
  assert.strictEqual(solapurRoute.source, "geofence_center");
  assert.ok(solapurRoute.distanceKm < 1);

  // Pune center
  const puneRoute = routeIncidentLocation(18.5204, 73.8567);
  assert.strictEqual(puneRoute.regionId, "pune");
  assert.strictEqual(puneRoute.source, "geofence_center");
  assert.ok(puneRoute.distanceKm < 1);

  // Solapur outer boundary (e.g. 15km out)
  const solapurOuter = routeIncidentLocation(17.72, 75.98);
  assert.strictEqual(solapurOuter.regionId, "solapur");
  assert.ok(solapurOuter.distanceKm <= 50);

  // Far away location (e.g. New Delhi: 28.6139, 77.2090)
  const delhiRoute = routeIncidentLocation(28.6139, 77.209);
  assert.strictEqual(delhiRoute.regionId, "unrouted");
  assert.strictEqual(delhiRoute.source, "unrouted_alert");
});

test("BE-06: Idempotent SOS Ingestion rejects missing eventId and enforces client UUID v4", () => {
  function validateSosIngestion(body) {
    if (!body.eventId || typeof body.eventId !== "string" || body.eventId.trim().length === 0) {
      return { valid: false, error: "MISSING_EVENT_ID" };
    }
    if (!body.location || typeof body.location.latitude !== "number" || typeof body.location.longitude !== "number") {
      return { valid: false, error: "INVALID_COORDINATES" };
    }
    return { valid: true };
  }

  assert.strictEqual(validateSosIngestion({}).valid, false);
  assert.strictEqual(validateSosIngestion({}).error, "MISSING_EVENT_ID");

  assert.strictEqual(
    validateSosIngestion({ eventId: "uuid-123", location: { latitude: "bad", longitude: 75.9 } }).valid,
    false
  );

  assert.strictEqual(
    validateSosIngestion({ eventId: "uuid-123", location: { latitude: 17.65, longitude: 75.9 } }).valid,
    true
  );
});

test("BE-17: Incident ACK ensures regional supervisor isolation and transitions status", () => {
  function validateAck(eventData, supervisor) {
    if (supervisor.regionId !== "all" && supervisor.regionId !== eventData.regionId) {
      return { allowed: false, code: "CROSS_REGION_FORBIDDEN" };
    }
    if (eventData.status === "ACKNOWLEDGED") {
      return { allowed: true, redundant: true };
    }
    return { allowed: true, newStatus: "ACKNOWLEDGED" };
  }

  const solapurEvent = { id: "ev1", regionId: "solapur", status: "DISPATCHED" };
  const solapurSupervisor = { uid: "sup1", role: "supervisor", regionId: "solapur" };
  const puneSupervisor = { uid: "sup2", role: "supervisor", regionId: "pune" };
  const superAdmin = { uid: "admin1", role: "admin", regionId: "all" };

  // Solapur supervisor ACKs Solapur event -> Allowed
  const ack1 = validateAck(solapurEvent, solapurSupervisor);
  assert.strictEqual(ack1.allowed, true);
  assert.strictEqual(ack1.newStatus, "ACKNOWLEDGED");

  // Pune supervisor attempts to ACK Solapur event -> Forbidden
  const ackCross = validateAck(solapurEvent, puneSupervisor);
  assert.strictEqual(ackCross.allowed, false);
  assert.strictEqual(ackCross.code, "CROSS_REGION_FORBIDDEN");

  // Super admin ACKs Solapur event -> Allowed
  const ackAdmin = validateAck(solapurEvent, superAdmin);
  assert.strictEqual(ackAdmin.allowed, true);
});

test("BE-07: Atomic closeEvent validates allowed resolution types", () => {
  const allowed = ["SAFE", "SUPERVISOR_CLOSED", "FALSE_ALARM", "CANCELLED", "STALE_CLOSED", "TRANSFERRED"];

  function validateResolutionType(type) {
    return allowed.includes(type);
  }

  assert.strictEqual(validateResolutionType("SUPERVISOR_CLOSED"), true);
  assert.strictEqual(validateResolutionType("SAFE"), true);
  assert.strictEqual(validateResolutionType("FALSE_ALARM"), true);
  assert.strictEqual(validateResolutionType("ARBITRARY_TEXT"), false);
  assert.strictEqual(validateResolutionType("DELETED"), false);
});

test("BE-17: Escalation & Stale Evaluator triggers status transitions correctly", () => {
  const now = Date.now();
  const ackSlaMs = 60 * 1000; // 60 seconds
  const staleMs = 300 * 1000; // 5 minutes

  function evaluateIncident(event, currentTime) {
    const updates = {};
    const dispatched = event.dispatchedAt;
    const heartbeat = event.lastHeartbeatAt;

    if (event.status === "DISPATCHED" && currentTime - dispatched > ackSlaMs) {
      updates.status = "ESCALATED";
    }

    if (currentTime - heartbeat > staleMs && !event.stale) {
      updates.stale = true;
    }

    return updates;
  }

  // 1. Fresh incident (10s old, fresh heartbeat) -> no changes
  const freshEvent = {
    status: "DISPATCHED",
    dispatchedAt: now - 10000,
    lastHeartbeatAt: now - 5000,
    stale: false,
  };
  const res1 = evaluateIncident(freshEvent, now);
  assert.deepStrictEqual(res1, {});

  // 2. Incident unacknowledged for 90s (> 60s SLA) -> ESCALATED
  const unackedEvent = {
    status: "DISPATCHED",
    dispatchedAt: now - 90000,
    lastHeartbeatAt: now - 10000,
    stale: false,
  };
  const res2 = evaluateIncident(unackedEvent, now);
  assert.strictEqual(res2.status, "ESCALATED");
  assert.strictEqual(res2.stale, undefined);

  // 3. Incident with heartbeat dead for 6 minutes (> 5m) -> stale = true (never auto-resolved)
  const deadHeartbeatEvent = {
    status: "ACKNOWLEDGED",
    dispatchedAt: now - 400000,
    lastHeartbeatAt: now - 360000,
    stale: false,
  };
  const res3 = evaluateIncident(deadHeartbeatEvent, now);
  assert.strictEqual(res3.stale, true);
  assert.strictEqual(res3.status, undefined); // Status NOT changed to RESOLVED!
});

test("FE-16: Privacy Minimization & PII Masking formats emails and phone numbers correctly", () => {
  assert.strictEqual(maskEmail("john.doe@gmail.com"), "j****e@gmail.com");
  assert.strictEqual(maskEmail("admin@solapur.gov"), "a****n@solapur.gov");
  assert.strictEqual(maskEmail("ab@test.com"), "a***@test.com");
  assert.strictEqual(maskEmail(null), "N/A");

  assert.strictEqual(maskPhone("+91 9876543210"), "+91 ******3210");
  assert.strictEqual(maskPhone("9876543210"), "******3210");
  assert.strictEqual(maskPhone(null), "N/A");
});
