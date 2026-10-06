const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// In-Memory Firestore mock for deterministic offline unit testing
const admin = require('../src/configuration/firebaseConfig');
const inMemoryDb = {
  ongoingEvents: new Map(),
  pastEvents: new Map(),
  evidence: new Map(),
  auditLogs: [],
};

const mockFirestore = {
  collection: (colName) => {
    return {
      doc: (docId) => {
        return {
          id: docId,
          get: async () => {
            const store = inMemoryDb[colName] || new Map();
            const data = store.get(docId);
            return {
              id: docId,
              exists: !!data,
              data: () => data || null,
            };
          },
          set: async (data) => {
            if (!inMemoryDb[colName]) inMemoryDb[colName] = new Map();
            inMemoryDb[colName].set(docId, JSON.parse(JSON.stringify(data)));
          },
          update: async (data) => {
            const store = inMemoryDb[colName] || new Map();
            const existing = store.get(docId) || {};
            store.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          },
          delete: async () => {
            if (inMemoryDb[colName]) inMemoryDb[colName].delete(docId);
          },
        };
      },
      add: async (data) => {
        const docId = `auto_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        if (Array.isArray(inMemoryDb[colName])) {
          inMemoryDb[colName].push({ id: docId, ...data });
        } else {
          if (!inMemoryDb[colName]) inMemoryDb[colName] = new Map();
          inMemoryDb[colName].set(docId, data);
        }
        return { id: docId };
      },
      where: function (field, op, val) {
        return {
          where: (f2, o2, v2) => {
            return {
              get: async () => {
                const results = [];
                const store = inMemoryDb[colName] || new Map();
                for (const [id, item] of store.entries()) {
                  let match1 = false;
                  if (op === '==') match1 = item[field] === val;
                  if (op === '<=') match1 = item[field] <= val;

                  let match2 = false;
                  if (o2 === '==') match2 = item[f2] === v2;
                  if (o2 === '<=') match2 = item[f2] <= v2;

                  if (match1 && match2) {
                    results.push({ id, ref: { id }, data: () => item });
                  }
                }
                return {
                  empty: results.length === 0,
                  docs: results,
                  forEach: (cb) => results.forEach(cb),
                };
              },
            };
          },
          orderBy: (orderField, dir) => {
            return {
              get: async () => {
                const results = [];
                const store = inMemoryDb[colName] || new Map();
                for (const [id, item] of store.entries()) {
                  if (op === '==' && item[field] === val) {
                    results.push({ id, ref: { id }, data: () => item });
                  }
                }
                return {
                  empty: results.length === 0,
                  docs: results,
                  forEach: (cb) => results.forEach(cb),
                };
              },
            };
          },
          get: async () => {
            let items = [];
            if (Array.isArray(inMemoryDb[colName])) {
              items = inMemoryDb[colName].filter((item) => {
                if (op === '==') return item[field] === val;
                return true;
              });
            } else {
              const store = inMemoryDb[colName] || new Map();
              for (const [id, item] of store.entries()) {
                if (op === '==' && item[field] === val) {
                  items.push({ id, ref: { id }, data: () => item });
                }
              }
            }
            return {
              empty: items.length === 0,
              docs: items.map((i) => ({ id: i.id, ref: { id: i.id }, data: () => i })),
              forEach: (cb) => items.forEach((i) => cb({ id: i.id, ref: { id: i.id }, data: () => i })),
            };
          },
        };
      },
    };
  },
  batch: () => {
    const deletes = [];
    return {
      delete: (docRef) => {
        deletes.push(docRef.id);
      },
      commit: async () => {
        for (const id of deletes) {
          inMemoryDb.evidence.delete(id);
        }
      },
    };
  },
};

// Wire mockFirestore onto admin
admin.firestore = () => mockFirestore;
if (!admin.firestore.FieldValue) {
  admin.firestore.FieldValue = {
    increment: (n) => n,
    serverTimestamp: () => Date.now(),
  };
}

const EvidenceService = require('../src/services/evidenceService');
EvidenceService.customDb = mockFirestore;
const EvidenceCaptureService = require('../../mobile-sdk/src/evidenceCaptureService');
const { OfflineQueueService, InMemoryQueueStore } = require('../../mobile-sdk/src/offlineQueueService');
const { WatchdogRecoveryService, InMemoryWatchdogStore } = require('../../mobile-sdk/src/watchdogRecoveryService');

/**
 * Phase 4 Evidence & Resilience Automated Test Suite (QA-05)
 */

test('BE-09 & M-04: Evidence ingestion verifies SHA-256 and rejects tampered chunks', async () => {
  const eventId = `test_ev_${Date.now()}`;

  // Seed test ongoing event in Solapur region
  inMemoryDb.ongoingEvents.set(eventId, {
    id: eventId,
    regionId: 'solapur',
    user_id: 'citizen_123',
    status: 'DISPATCHED',
    timestamp: Date.now(),
  });

  const rawChunkData = Buffer.from('Emergency audio capture segment: "Need immediate assistance near Solapur bus stand"');
  const validSha256 = crypto.createHash('sha256').update(rawChunkData).digest('hex');

  // 1. Ingestion with valid SHA-256 -> Success
  const ingestResult = await EvidenceService.ingestChunk({
    eventId,
    chunkIndex: 0,
    totalChunks: 1,
    mediaType: 'audio',
    mimeType: 'audio/webm',
    clientSha256: validSha256,
    payloadBuffer: rawChunkData,
    uploaderUid: 'citizen_123',
  });

  assert.strictEqual(ingestResult.success, true);
  assert.strictEqual(ingestResult.sha256, validSha256);
  assert.ok(ingestResult.chunkId);

  // 2. Tampered Chunk Test: Altered client SHA-256 -> Rejected
  const tamperedSha256 = '0000000000000000000000000000000000000000000000000000000000000000';
  await assert.rejects(
    async () => {
      await EvidenceService.ingestChunk({
        eventId,
        chunkIndex: 1,
        totalChunks: 1,
        mediaType: 'audio',
        mimeType: 'audio/webm',
        clientSha256: tamperedSha256,
        payloadBuffer: rawChunkData,
        uploaderUid: 'citizen_123',
      });
    },
    (err) => {
      assert.strictEqual(err.code, 'CHECKSUM_MISMATCH');
      return true;
    }
  );
});

test('BE-09 & FE-18: Short-lived signed URLs enforce <= 300s TTL and log supervisor playback', async () => {
  const eventId = `test_ev_signed_${Date.now()}`;
  const chunkId = `ev_chunk_${eventId}_0_test`;

  // Seed event and evidence chunk
  inMemoryDb.ongoingEvents.set(eventId, {
    id: eventId,
    regionId: 'solapur',
    user_id: 'victim_456',
    status: 'ACKNOWLEDGED',
  });

  inMemoryDb.evidence.set(chunkId, {
    id: chunkId,
    eventId,
    regionId: 'solapur',
    chunkIndex: 0,
    mediaType: 'audio',
    mimeType: 'audio/webm',
    sha256: 'abc123456789',
    dataBase64: Buffer.from('mock audio').toString('base64'),
    retentionExpiresAt: Date.now() + 86400000,
  });

  // 1. Solapur supervisor accesses Solapur event evidence -> Allowed
  const playbackResult = await EvidenceService.getSignedPlaybackUrl({
    eventId,
    evidenceId: chunkId,
    actorUid: 'sup_solapur_1',
    actorRole: 'supervisor',
    actorRegionId: 'solapur',
  });

  assert.strictEqual(playbackResult.success, true);
  assert.strictEqual(playbackResult.ttlSeconds, 300, 'Signed URL TTL must be <= 300s (5 minutes)');
  assert.ok(playbackResult.signedUrl.includes('token='), 'Signed URL must contain cryptographic signature token');

  // Verify Audit Log entry created
  const auditEntry = inMemoryDb.auditLogs.find(
    (log) => log.eventId === eventId && log.action === 'EVIDENCE_VIEWED'
  );
  assert.ok(auditEntry, 'Playback must create permanent audit record in auditLogs collection');
  assert.strictEqual(auditEntry.actorUid, 'sup_solapur_1');
  assert.strictEqual(auditEntry.mediaId, chunkId);

  // 2. Cross-region isolation: Pune supervisor accesses Solapur evidence -> Blocked 403
  await assert.rejects(
    async () => {
      await EvidenceService.getSignedPlaybackUrl({
        eventId,
        evidenceId: chunkId,
        actorUid: 'sup_pune_99',
        actorRole: 'supervisor',
        actorRegionId: 'pune',
      });
    },
    (err) => {
      assert.strictEqual(err.code, 'FORBIDDEN_REGION');
      return true;
    }
  );
});

test('M-04: EvidenceCaptureService manages 15s chunks, SHA-256 calculation, and backoff queue', async () => {
  const service = new EvidenceCaptureService({
    chunkDurationMs: 15000,
    mediaType: 'audio',
  });

  const eventId = 'vana-test-capture-123';
  service.startCapture(eventId);

  assert.strictEqual(service.isRecording, true);
  assert.strictEqual(service.activeEventId, eventId);

  // Capture chunk 1
  const rawData1 = Buffer.from('Audio segment 1 of 15 seconds');
  const chunk1 = service.createChunk(rawData1);

  assert.strictEqual(chunk1.chunkIndex, 0);
  assert.strictEqual(chunk1.eventId, eventId);
  assert.ok(chunk1.sha256.length === 64, 'SHA-256 digest must be 64 characters hex');
  assert.strictEqual(service.uploadQueue.length, 1);

  // Mock upload dispatcher
  let uploadedChunks = [];
  const mockHttp = {
    post: async (url, data) => {
      uploadedChunks.push(data);
      return { success: true, chunkId: `server_${data.chunkIndex}` };
    },
  };

  const flushRes = await service.processUploadQueue(mockHttp);
  assert.strictEqual(flushRes.processed, 1);
  assert.strictEqual(flushRes.remaining, 0);
  assert.strictEqual(uploadedChunks[0].clientSha256, chunk1.sha256);

  service.stopCapture();
  assert.strictEqual(service.isRecording, false);
});

test('M-10: OfflineQueueService enqueues when offline and replays with identical UUID upon network restore', async () => {
  const store = new InMemoryQueueStore();
  const offlineService = new OfflineQueueService({
    storageAdapter: store,
    isOnline: false, // Initially disconnected
  });

  const clientEventId = 'e2b34a98-1123-4e89-b541-112233445566';
  const initialSosPayload = {
    eventId: clientEventId,
    victimName: 'Ananya Deshmukh',
    location: { latitude: 17.6599, longitude: 75.9064 },
    type: 'EMERGENCY',
  };

  // 1. User triggers SOS while offline
  const enqueueRes = await offlineService.enqueueSosTrigger(initialSosPayload);
  assert.strictEqual(enqueueRes.enqueued, true);

  // 2. Add GPS breadcrumbs while offline
  await offlineService.enqueueHeartbeat(clientEventId, {
    location: { latitude: 17.6601, longitude: 75.9066 },
    batteryLevel: 88,
  });

  assert.strictEqual(await offlineService.getPendingCount(), 2);

  // 3. Network Restored: Flush queue with mock dispatcher
  let replayedRequests = [];
  const mockHttp = {
    request: async (req) => {
      replayedRequests.push(req);
      return { success: true };
    },
  };

  const flushResult = await offlineService.setOnline(true, mockHttp);
  assert.strictEqual(flushResult.flushed, 2);
  assert.strictEqual(flushResult.remaining, 0);

  // Verify initial UUID v4 was strictly preserved across replayed SOS
  const replayedSos = replayedRequests.find((r) => r.url.includes('/events/sos'));
  assert.ok(replayedSos, 'SOS must be replayed upon reconnection');
  assert.strictEqual(replayedSos.data.eventId, clientEventId, 'Idempotent UUID v4 must be preserved across offline replay');
});

test('M-11: WatchdogRecoveryService detects ungraceful process kill/reboot and restores emergency dispatch', async () => {
  const watchdogStore = new InMemoryWatchdogStore();
  const watchdog = new WatchdogRecoveryService({
    persistenceAdapter: watchdogStore,
  });

  const activeEventId = '77f88a99-4433-2211-aa99-001122334455';

  // 1. Normal state: No active SOS
  const preCheck = await watchdog.checkAndRecoverOnBoot();
  assert.strictEqual(preCheck.hasPendingSos, false);
  assert.strictEqual(preCheck.restored, false);

  // 2. Active SOS triggered: Watchdog saves emergency state
  await watchdog.persistActiveSosState({
    eventId: activeEventId,
    emergencyType: 'SILENT_DURESS',
    location: { latitude: 17.6599, longitude: 75.9064 },
    victimUid: 'vic_001',
  });

  // 3. Simulate phone reboot / OS memory kill (new process boots up)
  const rebootCheck = await watchdog.checkAndRecoverOnBoot('BOOT_COMPLETED');
  assert.strictEqual(rebootCheck.hasPendingSos, true);
  assert.strictEqual(rebootCheck.restored, true);
  assert.strictEqual(rebootCheck.eventId, activeEventId);
  assert.strictEqual(rebootCheck.emergencyType, 'SILENT_DURESS');

  // 4. Incident resolved -> State cleared
  await watchdog.clearSosState(activeEventId);
  const postResolveCheck = await watchdog.checkAndRecoverOnBoot();
  assert.strictEqual(postResolveCheck.hasPendingSos, false);
});

test('LEGAL-01 & BE-09: Automated retention expiration purges aged evidence outside legal hold', async () => {
  const expiredChunkId = `ev_expired_${Date.now()}`;
  const legalHoldChunkId = `ev_legal_hold_${Date.now()}`;

  // Seed expired chunk (past retention date)
  inMemoryDb.evidence.set(expiredChunkId, {
    id: expiredChunkId,
    eventId: 'test_expired_ev',
    legalHold: false,
    retentionExpiresAt: Date.now() - 10000, // Expired 10s ago
  });

  // Seed chunk with active legal hold (even if past retention date)
  inMemoryDb.evidence.set(legalHoldChunkId, {
    id: legalHoldChunkId,
    eventId: 'test_legal_hold_ev',
    legalHold: true,
    retentionExpiresAt: Date.now() - 10000,
  });

  const cleanupRes = await EvidenceService.cleanupExpiredEvidence();
  assert.ok(cleanupRes.success);
  assert.ok(cleanupRes.purgedCount >= 1);

  // Verify expired chunk deleted
  assert.strictEqual(inMemoryDb.evidence.has(expiredChunkId), false, 'Expired evidence chunk without legal hold must be purged');

  // Verify legal hold chunk preserved
  assert.strictEqual(inMemoryDb.evidence.has(legalHoldChunkId), true, 'Evidence under legal hold must NEVER be purged');
});
