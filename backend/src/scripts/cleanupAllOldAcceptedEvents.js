const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

/**
 * One-time cleanup script to remove ALL acceptedEvents that are older than 24 hours
 * This cleans up orphaned acceptor data
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

async function cleanupAllOldAcceptedEvents() {
  console.log('🧹 Starting cleanup of old acceptedEvents...');

  try {
    const now = admin.firestore.Timestamp.now();
    const twentyFourHoursAgo = admin.firestore.Timestamp.fromMillis(
      now.toMillis() - TWENTY_FOUR_HOURS_MS
    );

    // Get all acceptedEvents
    const acceptedEventsSnapshot = await db.collection('acceptedEvents').get();

    console.log(`📋 Found ${acceptedEventsSnapshot.size} documents in acceptedEvents`);

    if (acceptedEventsSnapshot.empty) {
      console.log('✅ No acceptedEvents found');
      return { deleted: 0, message: 'No acceptedEvents to clean up' };
    }

    let deletedEventCount = 0;
    let deletedAcceptorCount = 0;
    const batch = db.batch();

    for (const eventDoc of acceptedEventsSnapshot.docs) {
      const eventId = eventDoc.id;

      // Get acceptors for this event
      const acceptorsSnapshot = await eventDoc.ref.collection('acceptors').get();

      if (acceptorsSnapshot.empty) {
        console.log(`⚠️  Event ${eventId} has no acceptors, skipping`);
        continue;
      }

      // Check if any acceptor is older than 24 hours
      let hasOldAcceptors = false;
      for (const acceptorDoc of acceptorsSnapshot.docs) {
        const acceptorData = acceptorDoc.data();
        if (acceptorData.acceptedAt && acceptorData.acceptedAt.toMillis() <= twentyFourHoursAgo.toMillis()) {
          hasOldAcceptors = true;
          break;
        }
      }

      if (hasOldAcceptors) {
        console.log(`🗑️  Deleting event ${eventId} with ${acceptorsSnapshot.size} acceptors (older than 24 hours)`);

        // Delete all acceptors
        for (const acceptorDoc of acceptorsSnapshot.docs) {
          batch.delete(acceptorDoc.ref);
          deletedAcceptorCount++;
        }

        // Delete the parent acceptedEvents document
        batch.delete(eventDoc.ref);
        deletedEventCount++;
      }
    }

    if (deletedEventCount > 0) {
      await batch.commit();
      console.log(`✅ Successfully deleted ${deletedEventCount} events and ${deletedAcceptorCount} acceptors from acceptedEvents`);
    } else {
      console.log('✅ No old acceptedEvents found to delete');
    }

    return {
      deletedEvents: deletedEventCount,
      deletedAcceptors: deletedAcceptorCount,
      message: `Deleted ${deletedEventCount} events and ${deletedAcceptorCount} acceptors from acceptedEvents`
    };

  } catch (error) {
    console.error('❌ Error cleaning up old acceptedEvents:', error);
    throw error;
  }
}

// Run cleanup if called directly
if (require.main === module) {
  cleanupAllOldAcceptedEvents()
    .then((result) => {
      console.log('✅ Cleanup completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupAllOldAcceptedEvents };
