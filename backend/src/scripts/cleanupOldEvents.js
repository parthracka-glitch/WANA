const admin = require('../configuration/firebaseConfig');
const db = admin.firestore();

/**
 * Retention Archival Script (BE-22)
 * Strictly operates on 'pastEvents' older than legal retention threshold (e.g. 90 days).
 * NEVER touches or auto-resolves 'ongoingEvents'.
 */
const DEFAULT_RETENTION_DAYS = 90;

async function archiveRetentionExpiredEvents({ retentionDays = DEFAULT_RETENTION_DAYS, dryRun = false } = {}) {
  console.log(`🧹 Starting retention archive evaluation (Retention: ${retentionDays} days, DryRun: ${dryRun})...`);

  const now = admin.firestore.Timestamp.now();
  const retentionCutoff = admin.firestore.Timestamp.fromMillis(
    now.toMillis() - retentionDays * 24 * 60 * 60 * 1000
  );

  const pastEventsRef = db.collection('pastEvents');
  const snapshot = await pastEventsRef
    .where('is_resolved', '==', true)
    .where('resolved_at', '<=', retentionCutoff)
    .get();

  console.log(`📋 Found ${snapshot.size} expired pastEvents for retention archival.`);

  if (snapshot.empty || dryRun) {
    return {
      archivedCount: 0,
      candidatesFound: snapshot.size,
      dryRun,
    };
  }

  let batch = db.batch();
  let count = 0;
  let batchOps = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Cold archive to pastEventsArchive or purge
    const archiveRef = db.collection('pastEventsArchive').doc(doc.id);
    batch.set(archiveRef, {
      ...data,
      coldArchivedAt: admin.firestore.FieldValue.serverTimestamp(),
      retentionPolicyApplied: `${retentionDays}_days`,
    });
    batch.delete(doc.ref);
    count++;
    batchOps += 2;

    if (batchOps >= 450) {
      await batch.commit();
      batch = db.batch();
      batchOps = 0;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  console.log(`✅ Successfully archived ${count} pastEvents records.`);
  return {
    archivedCount: count,
    candidatesFound: snapshot.size,
    dryRun: false,
  };
}

// Support direct CLI invocation
if (require.main === module) {
  archiveRetentionExpiredEvents()
    .then((res) => {
      console.log('Result:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Retention archival failed:', err);
      process.exit(1);
    });
}

module.exports = { archiveRetentionExpiredEvents };
