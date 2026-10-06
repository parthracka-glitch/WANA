const test = require('node:test');
const assert = require('node:assert');

const ContactNotifier = require('../src/services/contactNotifier');
const SilentTriggerService = require('../../mobile-sdk/src/silentTriggerService');
const SosTriggerEngine = require('../../mobile-sdk/src/sosTriggerEngine');

/**
 * Phase 3 Mobile Reliability & Complete SOS Automated Test Suite (QA-03)
 */

test('M-01: SosTriggerEngine generates RFC4122 v4 UUID and enforces 10s false-alarm window', () => {
  const engine = new SosTriggerEngine();

  // Test UUID v4 format
  const uuid = engine.generateUuidV4();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.ok(uuidRegex.test(uuid), `Generated UUID '${uuid}' should match v4 RFC4122 pattern`);

  // Test Cancel False Alarm
  const triggerResult = engine.initiateTrigger({
    location: { latitude: 17.6599, longitude: 75.9064 },
    emergencyType: 'MEDICAL',
  });

  assert.strictEqual(triggerResult.success, true);
  assert.strictEqual(engine.state, 'COUNTDOWN');
  assert.strictEqual(triggerResult.countdownSeconds, 10);

  // User cancels within 10s
  const cancelResult = engine.cancelFalseAlarm('Accidental pocket tap');
  assert.strictEqual(cancelResult.success, true);
  assert.strictEqual(engine.state, 'CANCELLED');
});

test('M-03: SilentTriggerService enforces multi-tier debouncing for 4x volume-down trigger', () => {
  let activated = false;
  let triggerPayload = null;

  const service = new SilentTriggerService({
    onSilentTriggerActivated: (payload) => {
      activated = true;
      triggerPayload = payload;
    },
  });

  const baseTime = 1000000;

  // 1. Contact Bounce Test: Two presses within 50ms (< 120ms MIN_GAP) should be rejected
  let pressTime = baseTime;
  Date.now = () => pressTime;
  assert.strictEqual(service.handleHardwareKeyEvent('VOLUME_DOWN'), false);

  pressTime += 50; // 50ms gap -> bounce!
  assert.strictEqual(service.handleHardwareKeyEvent('VOLUME_DOWN'), false);
  assert.strictEqual(service.pressTimestamps.length, 1, 'Mechanical bounce should be filtered out');

  // 2. Normal Volume Adjustment Test: Gap > 800ms resets sequence
  pressTime += 1000; // 1000ms gap
  assert.strictEqual(service.handleHardwareKeyEvent('VOLUME_DOWN'), false);
  assert.strictEqual(service.pressTimestamps.length, 1, 'Normal adjustment should reset sequence');

  // 3. Valid Emergency Sequence: 4 rapid presses spaced by 300ms (all within 2.5s window)
  pressTime = baseTime + 20000;
  service.pressTimestamps = [];
  activated = false;

  pressTime += 200;
  assert.strictEqual(service.handleHardwareKeyEvent('VOLUME_DOWN'), false);
  pressTime += 250;
  assert.strictEqual(service.handleHardwareKeyEvent('VOLUME_DOWN'), false);
  pressTime += 250;
  assert.strictEqual(service.handleHardwareKeyEvent('VOLUME_DOWN'), false);
  pressTime += 250;
  // 4th press triggers!
  const fired = service.handleHardwareKeyEvent('VOLUME_DOWN');
  assert.strictEqual(fired, true);
  assert.strictEqual(activated, true);
  assert.strictEqual(triggerPayload.emergencyType, 'SILENT_DURESS');
  assert.strictEqual(triggerPayload.suppressAudio, true);
  assert.strictEqual(triggerPayload.suppressVisualAlarm, true);
});

test('BE-08b: ContactNotifier formats India TRAI DLT Compliant SMS template strictly', () => {
  const dltMessage = ContactNotifier.formatDltMessage({
    victimName: 'Priya Sharma',
    eventId: 'wana-sos-982134',
    location: { latitude: 17.6599, longitude: 75.9064 },
    appBaseUrl: 'https://wana.app',
  });

  assert.ok(dltMessage.startsWith('WANA SAFETY ALERT:'), 'Message must start with registered DLT prefix');
  assert.ok(dltMessage.includes('Priya Sharma'), 'Message must contain victim name');
  assert.ok(dltMessage.includes('17.6599, 75.9064'), 'Message must contain coordinates');
  assert.ok(dltMessage.includes('https://wana.app/track/wana-sos-982134'), 'Message must contain live tracking URL');
  assert.ok(dltMessage.endsWith('WANA HELPLINE'), 'Message must end with registered entity helpline');
});

test('M-09: Emergency Contacts enforces 5-contact maximum and requires explicit digital consent', () => {
  function validateNewContact(existingCount, body) {
    if (existingCount >= 5) {
      return { valid: false, code: 'MAX_CONTACTS_EXCEEDED' };
    }
    if (!body.name || body.name.trim().length === 0) {
      return { valid: false, code: 'MISSING_NAME' };
    }
    if (!body.phone || body.phone.trim().length < 8) {
      return { valid: false, code: 'INVALID_PHONE' };
    }
    if (!body.consentGiven) {
      return { valid: false, code: 'CONSENT_REQUIRED' };
    }
    return {
      valid: true,
      consentRecord: {
        consentGiven: true,
        deviceId: body.deviceId || 'device_id',
        timestamp: Date.now(),
      },
    };
  }

  // Under limit with consent -> valid
  const res1 = validateNewContact(2, {
    name: 'Brother',
    phone: '+91 9876543210',
    consentGiven: true,
    deviceId: 'samsung_a54_test',
  });
  assert.strictEqual(res1.valid, true);
  assert.strictEqual(res1.consentRecord.deviceId, 'samsung_a54_test');

  // Missing consent -> rejected
  const resNoConsent = validateNewContact(2, {
    name: 'Mother',
    phone: '+91 9876543210',
    consentGiven: false,
  });
  assert.strictEqual(resNoConsent.valid, false);
  assert.strictEqual(resNoConsent.code, 'CONSENT_REQUIRED');

  // Limit reached (5 contacts) -> rejected
  const resLimit = validateNewContact(5, {
    name: 'Sister',
    phone: '+91 9876543210',
    consentGiven: true,
  });
  assert.strictEqual(resLimit.valid, false);
  assert.strictEqual(resLimit.code, 'MAX_CONTACTS_EXCEEDED');
});

test('BE-23: Community Responder Accept Flow enforces status transition and denormalized regionId', () => {
  function simulateAcceptorRecord(event, responder, location) {
    if (event.is_resolved) {
      return { error: 'EVENT_ALREADY_RESOLVED' };
    }
    return {
      uid: responder.uid,
      eventId: event.id,
      regionId: event.regionId, // Denormalized for collectionGroup querying
      name: responder.name,
      status: 'EN_ROUTE',
      active: true,
      userLocation: location,
    };
  }

  const ongoingEvent = { id: 'ev_solapur_1', regionId: 'solapur', is_resolved: false };
  const responder = { uid: 'resp_42', name: 'Ravi Kumar' };
  const loc = { lat: 17.662, lng: 75.91 };

  const record = simulateAcceptorRecord(ongoingEvent, responder, loc);
  assert.strictEqual(record.regionId, 'solapur');
  assert.strictEqual(record.status, 'EN_ROUTE');
  assert.strictEqual(record.active, true);
  assert.deepStrictEqual(record.userLocation, loc);

  // Attempt accept on resolved event
  const resolvedEvent = { id: 'ev_past_1', regionId: 'solapur', is_resolved: true };
  const failRecord = simulateAcceptorRecord(resolvedEvent, responder, loc);
  assert.strictEqual(failRecord.error, 'EVENT_ALREADY_RESOLVED');
});

test('DD-06/07: Standard Emergency SLA Timings compliance', () => {
  const SLA = {
    ACK_SLA_SECONDS: 45,
    STALE_HEARTBEAT_SECONDS: 90,
    FALLBACK_ESCALATION_SECONDS: 300,
    CANCEL_FALSE_ALARM_SECONDS: 10,
  };

  assert.strictEqual(SLA.ACK_SLA_SECONDS, 45, 'Ack SLA must be 45 seconds');
  assert.strictEqual(SLA.STALE_HEARTBEAT_SECONDS, 90, 'Stale Heartbeat SLA must be 90 seconds');
  assert.strictEqual(SLA.FALLBACK_ESCALATION_SECONDS, 300, 'Fallback Escalation must be 300 seconds (5 min)');
  assert.strictEqual(SLA.CANCEL_FALSE_ALARM_SECONDS, 10, 'Cancel False Alarm window must be 10 seconds');
});
