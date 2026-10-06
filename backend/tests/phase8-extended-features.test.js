const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');

// In-Memory Test Database for deterministic test runs
const inMemoryDb = {
  ongoingEvents: new Map(),
  pastEvents: new Map(),
  legalDossiers: new Map(),
  evidence: new Map(),
  auditLogs: new Map(),
  regions: new Map(),
};

function createMockDocRef(col, id) {
  return {
    id,
    collection: (subCol) => {
      const subStoreKey = `${col}/${id}/${subCol}`;
      if (!inMemoryDb[subStoreKey]) inMemoryDb[subStoreKey] = new Map();
      return {
        doc: (subId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`) => ({
          id: subId,
          set: async (data) => {
            inMemoryDb[subStoreKey].set(subId, { id: subId, ...data });
          },
          get: async () => ({
            id: subId,
            exists: inMemoryDb[subStoreKey].has(subId),
            data: () => inMemoryDb[subStoreKey].get(subId) || null,
          }),
        }),
        add: async (data) => {
          const subId = `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
          inMemoryDb[subStoreKey].set(subId, { id: subId, ...data });
          return { id: subId };
        },
        orderBy: () => ({
          get: async () => {
            const items = Array.from(inMemoryDb[subStoreKey].values());
            return {
              empty: items.length === 0,
              size: items.length,
              forEach: (cb) => items.forEach((it) => cb({ id: it.id, data: () => it })),
            };
          },
        }),
      };
    },
    set: async (data) => {
      if (!inMemoryDb[col]) inMemoryDb[col] = new Map();
      inMemoryDb[col].set(id, { id, ...data });
    },
    update: async (data) => {
      if (!inMemoryDb[col]) inMemoryDb[col] = new Map();
      const existing = inMemoryDb[col].get(id) || { id };
      inMemoryDb[col].set(id, { ...existing, ...data });
    },
    delete: async () => {
      if (inMemoryDb[col]) inMemoryDb[col].delete(id);
    },
    get: async () => {
      const store = inMemoryDb[col];
      const data = store ? store.get(id) : null;
      return {
        id,
        exists: !!data,
        ref: createMockDocRef(col, id),
        data: () => (data ? JSON.parse(JSON.stringify(data)) : null),
      };
    },
  };
}

const mockFirestore = {
  collection: (col) => ({
    doc: (id = `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`) => createMockDocRef(col, id),
    where: (field, op, val) => ({
      get: async () => {
        const store = inMemoryDb[col] || new Map();
        const matches = Array.from(store.values()).filter((item) => {
          if (op === '==') return item[field] === val;
          return true;
        });
        return {
          empty: matches.length === 0,
          size: matches.length,
          docs: matches.map((m) => ({ id: m.id, data: () => m })),
          forEach: (cb) => matches.forEach((m) => cb({ id: m.id, data: () => m })),
        };
      },
    }),
  }),
};

// SDK & Services
const DuressGuardService = require('../../mobile-sdk/src/duressGuardService');
const SmsFallbackBridge = require('../../mobile-sdk/src/smsFallbackBridge');
const BatterySurvivalService = require('../../mobile-sdk/src/batterySurvivalService');
const TacticalChatReceiver = require('../../mobile-sdk/src/tacticalChatReceiver');
const TacticalChatService = require('../src/services/tacticalChatService');
const LegalDossierService = require('../src/services/legalDossierService');
const CapAlertService = require('../src/services/capAlertService');
const EventLifecycleService = require('../src/services/eventLifecycle');
const SmsUplinkService = require('../src/services/smsUplinkService');

// Wire in-memory test database
TacticalChatService.customDb = mockFirestore;
LegalDossierService.customDb = mockFirestore;
CapAlertService.customDb = mockFirestore;
EventLifecycleService.customDb = mockFirestore;
SmsUplinkService.customDb = mockFirestore;

describe('Phase 8: Extended Production Features & Recommendation Map', () => {
  const testEventId = `ext-test-${Date.now()}`;
  const solapurLat = 17.6599;
  const solapurLng = 75.9064;

  before(async () => {
    // Seed initial event in in-memory ongoingEvents
    inMemoryDb.ongoingEvents.set(testEventId, {
      id: testEventId,
      eventId: testEventId,
      type: 'GENERAL',
      status: 'DISPATCHED',
      regionId: 'solapur',
      regionName: 'Solapur',
      victimName: 'Anjali Sharma',
      victimPhone: '+919876543210',
      sos_clicked_by_uid: 'citizen_victim_ext_1',
      location: { latitude: solapurLat, longitude: solapurLng, accuracy: 5 },
      batteryLevel: 45,
      createdAtIso: new Date().toISOString(),
    });

    // Seed mock evidence chunks
    inMemoryDb.evidence.set(`ev_chunk_1`, {
      id: 'ev_chunk_1',
      eventId: testEventId,
      chunkIndex: 0,
      type: 'AUDIO_CHUNK',
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSize: 10240,
    });
  });

  // =========================================================================
  // 1. DURESS PIN & COERCED DEACTIVATION GUARD (M-12 / BE-24)
  // =========================================================================
  test('FEAT-1: Duress Guard differentiates Safe vs Duress PIN and triggers covert SEV-0 escalation', async () => {
    const duressGuard = new DuressGuardService();
    duressGuard.setPins({ safePin: '1111', duressPin: '9999' });

    // 1a: Invalid PIN
    const invalidRes = await duressGuard.handleDeactivationAttempt({
      enteredPin: '0000',
      eventId: testEventId,
    });
    assert.strictEqual(invalidRes.status, 'INVALID_PIN');
    assert.strictEqual(invalidRes.isDuress, false);

    // 1b: Safe PIN
    const safeRes = await duressGuard.handleDeactivationAttempt({
      enteredPin: '1111',
      eventId: testEventId,
    });
    assert.strictEqual(safeRes.status, 'GENUINE_CANCEL');
    assert.strictEqual(safeRes.isDuress, false);

    // 1c: Duress PIN - Covert escalation
    let covertAlertFired = false;
    const duressRes = await duressGuard.handleDeactivationAttempt({
      enteredPin: '9999',
      eventId: testEventId,
      onCovertAlertTriggered: () => {
        covertAlertFired = true;
      },
    });

    assert.strictEqual(duressRes.status, 'DECOY_CANCELLED');
    assert.strictEqual(duressRes.isDuress, true);
    assert.strictEqual(duressRes.covertLockActive, true);
    assert.strictEqual(covertAlertFired, true);

    // Backend Duress Execution Test
    const backendDuressRes = await EventLifecycleService.handleDuressDeactivation({
      eventId: testEventId,
      callerUid: 'citizen_victim_ext_1',
      payload: { action: 'DURESS_COERCED_DEACTIVATION' },
    });

    assert.strictEqual(backendDuressRes.success, true);
    assert.strictEqual(backendDuressRes.status, 'ESCALATED_DURESS');
    assert.strictEqual(backendDuressRes.decoyApproved, true);

    // Verify database document was NOT closed, but marked with covert locks
    const eventData = inMemoryDb.ongoingEvents.get(testEventId);
    assert.strictEqual(eventData.status, 'ESCALATED_DURESS');
    assert.strictEqual(eventData.duressDetected, true);
    assert.strictEqual(eventData.covertLockActive, true);
    assert.strictEqual(eventData.evidenceRecordingLocked, true);
  });

  // =========================================================================
  // 2. ZERO-DATA SMS FALLBACK BRIDGE (M-13 / BE-25)
  // =========================================================================
  test('FEAT-2: SMS Fallback Bridge encodes compact 160-char SMS with CRC-16 and processes ingress', async () => {
    const bridge = new SmsFallbackBridge();

    // 2a: Encoding
    const encoded = bridge.encodeSmsPayload({
      eventId: 'sms-evt-4501',
      latitude: 17.65991,
      longitude: 75.90642,
      batteryLevel: 42,
      timestamp: 1775500000,
    });

    assert.strictEqual(encoded.isSingleGsmSms, true);
    assert.ok(encoded.charLength < 160, `Length should be < 160, got ${encoded.charLength}`);
    assert.ok(encoded.message.startsWith('WANA!SOS*sms-evt-4501*'));

    // 2b: Decoding with CRC verification
    const decoded = bridge.decodeSmsPayload(encoded.message);
    assert.strictEqual(decoded.valid, true);
    assert.strictEqual(decoded.eventId, 'sms-evt-4501');
    assert.strictEqual(decoded.location.latitude, 17.65991);
    assert.strictEqual(decoded.location.longitude, 75.90642);
    assert.strictEqual(decoded.batteryLevel, 42);

    // 2c: Tampered SMS detection (corrupted coordinate digit)
    const tamperedMessage = encoded.message.replace('17.65991', '18.65991');
    const tamperedDecoded = bridge.decodeSmsPayload(tamperedMessage);
    assert.strictEqual(tamperedDecoded.valid, false);
    assert.ok(tamperedDecoded.error.includes('CRC-16 mismatch'));

    // 2d: Decision Helper
    assert.strictEqual(bridge.shouldFallback({ isOnline: false }), true);
    assert.strictEqual(bridge.shouldFallback({ isOnline: true, networkFailuresCount: 3 }), true);
    assert.strictEqual(bridge.shouldFallback({ isOnline: true, networkFailuresCount: 0, timeoutElapsedMs: 12000 }), true);
    assert.strictEqual(bridge.shouldFallback({ isOnline: true, networkFailuresCount: 0, timeoutElapsedMs: 2000 }), false);

    // 2e: Backend Ingress Processing on existing event
    const smsIngressRes = await SmsUplinkService.processIncomingSms({
      from: '+919988776655',
      body: bridge.encodeSmsPayload({
        eventId: testEventId,
        latitude: 17.6601,
        longitude: 75.9070,
        batteryLevel: 38,
      }).message,
      gateway: 'TWILIO_SMS',
    });

    assert.strictEqual(smsIngressRes.success, true);
    assert.strictEqual(smsIngressRes.status, 'PROCESSED');
    assert.strictEqual(smsIngressRes.eventId, testEventId);
  });

  // =========================================================================
  // 3. CRITICAL BATTERY SURVIVAL MODE & BEACON (M-14 / BE-26)
  // =========================================================================
  test('FEAT-3: Battery Survival monitors thresholds, projects vector, and records dying beacon', async () => {
    const batteryService = new BatterySurvivalService();

    // 3a: Normal battery (> 10%)
    const normal = await batteryService.evaluateBatteryState({ batteryLevel: 50 });
    assert.strictEqual(normal.status, 'NORMAL');
    assert.strictEqual(normal.gpsIntervalMs, 15000);

    // 3b: Power Saver (< 10%)
    const saver = await batteryService.evaluateBatteryState({ batteryLevel: 8 });
    assert.strictEqual(saver.status, 'CRITICAL_POWER_SAVER');
    assert.strictEqual(saver.gpsIntervalMs, 60000);

    // 3c: Imminent Power Death (<= 2%) with Vector Projection
    const dying = await batteryService.evaluateBatteryState({
      batteryLevel: 2,
      eventId: testEventId,
      lastKnownLocation: { latitude: 17.6599, longitude: 75.9064 },
      speed: 15.0, // 15 m/s (~54 km/h moving vehicle)
      bearing: 90, // Eastbound
    });

    assert.strictEqual(dying.status, 'IMMINENT_POWER_DEATH');
    assert.strictEqual(dying.beaconDispatched, true);
    assert.ok(dying.beaconPayload.projections.plus15Minutes);
    assert.ok(dying.beaconPayload.projections.plus30Minutes);

    // Verify distance projection moved east
    const proj15 = dying.beaconPayload.projections.plus15Minutes;
    assert.strictEqual(proj15.confidence, 'VECTOR_EXTRAPOLATION');
    assert.ok(proj15.longitude > 75.9064, 'Eastward projection must increase longitude');

    // Backend Ingestion of Beacon
    const backendBeaconRes = await EventLifecycleService.recordBatteryBeacon({
      eventId: testEventId,
      batteryLevel: 2,
      lastKnownLocation: { latitude: 17.6599, longitude: 75.9064, accuracy: 5 },
      speed: 15.0,
      bearing: 90,
      projections: dying.beaconPayload.projections,
    });

    assert.strictEqual(backendBeaconRes.success, true);
    assert.strictEqual(backendBeaconRes.imminentPowerDeath, true);

    const checkEvent = inMemoryDb.ongoingEvents.get(testEventId);
    assert.strictEqual(checkEvent.imminentPowerDeath, true);
    assert.strictEqual(checkEvent.batteryLevel, 2);
  });

  // =========================================================================
  // 4. TWO-WAY SILENT TACTICAL CHAT (FE-21 / M-15 / BE-28)
  // =========================================================================
  test('FEAT-4: Tactical Chat guarantees silent reception and records two-way covert exchanges', async () => {
    // 4a: Mobile Receiver Stealth Invariant
    const receiver = new TacticalChatReceiver({ eventId: testEventId });
    const stealthReceipt = receiver.handleIncomingQuery({
      id: 'query-1',
      queryCode: 'CHECK_DANGER',
      text: 'Are you in immediate physical danger?',
    });

    assert.strictEqual(stealthReceipt.status, 'RECEIVED_STEALTH');
    assert.strictEqual(stealthReceipt.audioSuppressed, true);
    assert.strictEqual(stealthReceipt.vibrationSuppressed, true);

    // 4b: Supervisor dispatches query
    const supervisorMsg = await TacticalChatService.sendSupervisorQuery({
      eventId: testEventId,
      supervisorUid: 'sup_solapur_duty',
      supervisorName: 'Inspector Patil',
      queryCode: 'ATTACKER_PRESENT',
    });

    assert.strictEqual(supervisorMsg.success, true);
    assert.strictEqual(supervisorMsg.message.queryCode, 'ATTACKER_PRESENT');

    // 4c: Citizen responds with single-tap quick answer
    const victimMsg = await TacticalChatService.recordVictimResponse({
      eventId: testEventId,
      victimUid: 'citizen_victim_ext_1',
      answerCode: 'HIDING',
    });

    assert.strictEqual(victimMsg.success, true);
    assert.strictEqual(victimMsg.response.answerCode, 'HIDING');
    assert.strictEqual(victimMsg.response.text, 'Hiding / Cannot Move');

    // 4d: Thread History Retrieval
    const thread = await TacticalChatService.getTacticalMessages(testEventId);
    assert.strictEqual(thread.success, true);
    assert.ok(thread.count >= 2, `Expected at least 2 messages, got ${thread.count}`);
  });

  // =========================================================================
  // 5. COURT-READY LEGAL DOSSIER & BSA 65B CERTIFICATE (BE-26 / FE-22)
  // =========================================================================
  test('FEAT-5: Legal Dossier compiles SHA-256 evidence manifest and Section 65B BSA 2023 certificate', async () => {
    const dossierRes = await LegalDossierService.generateDossier({
      eventId: testEventId,
      certifyingOfficerUid: 'insp_patil_9981',
      certifyingOfficerName: 'Ramesh Patil, PPS',
      officerDesignation: 'Senior Inspector / Duty Supervisor',
      policeStationJurisdiction: 'Solapur Central Police Station',
    });

    assert.strictEqual(dossierRes.success, true);
    assert.ok(dossierRes.dossierId.startsWith('BSA-65B-WANA-'));
    assert.strictEqual(typeof dossierRes.masterSha256, 'string');
    assert.strictEqual(dossierRes.masterSha256.length, 64, 'SHA-256 digest must be 64 hex characters');

    // Verify statutory wording under Bharatiya Sakshya Adhiniyam, 2023
    const certText = dossierRes.dossier.bsa65bCertificateText;
    assert.ok(certText.includes('BHARATIYA SAKSHYA ADHINIYAM, 2023'));
    assert.ok(certText.includes('SECTION 65B'));
    assert.ok(certText.includes(testEventId));
    assert.ok(certText.includes(dossierRes.masterSha256));
    assert.ok(certText.includes('Solapur Central Police Station'));

    // Retrieve via getter
    const fetchedDossier = await LegalDossierService.getDossier(testEventId);
    assert.ok(fetchedDossier);
    assert.strictEqual(fetchedDossier.masterSha256, dossierRes.masterSha256);
  });

  // =========================================================================
  // 6. GOVERNMENT ERSS DIAL 112 CAP v1.2 INTEROPERABILITY (BE-27)
  // =========================================================================
  test('FEAT-6: ERSS Dial 112 Interop produces valid OASIS CAP v1.2 XML and simulates CAD dispatch', async () => {
    const capRes = await CapAlertService.generateCapAlertXml({
      eventId: testEventId,
      sender: 'solapur-control@mahaerss.gov.in',
    });

    assert.ok(capRes.xml);
    assert.ok(capRes.xml.includes('urn:oasis:names:tc:emergency:cap:1.2'));
    assert.ok(capRes.xml.includes('<event>WOMEN_SAFETY_EMERGENCY</event>'));
    assert.ok(capRes.xml.includes('<urgency>Immediate</urgency>'));
    assert.ok(capRes.xml.includes('<severity>Extreme</severity>'));
    assert.ok(capRes.xml.includes('<circle>'));
    assert.ok(capRes.xml.includes('17.6599'));
    assert.ok(capRes.xml.includes('75.9064'));
    assert.ok(capRes.xml.includes('<value>112_WOMEN_DISTRESS_SOS</value>'));

    // Simulated CAD Transmission
    const dispatchRes = await CapAlertService.dispatchToErssCad({
      eventId: testEventId,
      cadEndpointUrl: 'https://cad.erss112.gov.in/v1/sos-ingest',
    });

    assert.strictEqual(dispatchRes.success, true);
    assert.strictEqual(dispatchRes.status, 'DISPATCHED_TO_CAD');
    assert.strictEqual(dispatchRes.cadResult.status, 'ACK_BY_ERSS_112');
  });
});
