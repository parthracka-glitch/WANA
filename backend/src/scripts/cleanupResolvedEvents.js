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
 * One-time cleanup script to remove already resolved events from ongoingEvents
 * These are events that were marked as resolved but not deleted
 */

async function cleanupResolvedEvents() {
  console.log('🧹 Starting cleanup of already resolved events from ongoingEvents...');
  
  try {
    // Get all events in ongoingEvents that are already resolved
    const ongoingEventsRef = db.collection('ongoingEvents');
    const resolvedEventsSnapshot = await ongoingEventsRef
      .where('is_resolved', '==', true)
      .get();

    if (resolvedEventsSnapshot.empty) {
      console.log('✅ No resolved events found in ongoingEvents');
      return { deleted: 0, message: 'No resolved events to clean up' };
    }

    console.log(`📋 Found ${resolvedEventsSnapshot.size} resolved events to remove from ongoingEvents`);

    const batch = db.batch();
    let deletedCount = 0;

    for (const eventDoc of resolvedEventsSnapshot.docs) {
      const eventData = eventDoc.data();
      const eventId = eventDoc.id;

      console.log(`🗑️  Deleting resolved event from ongoingEvents: ${eventId}`);
      
      // Delete from ongoingEvents
      batch.delete(eventDoc.ref);
      deletedCount++;
    }

    // Commit all deletions
    await batch.commit();

    console.log(`✅ Successfully deleted ${deletedCount} resolved events from ongoingEvents`);
    return { 
      deleted: deletedCount, 
      message: `Deleted ${deletedCount} resolved events from ongoingEvents` 
    };

  } catch (error) {
    console.error('❌ Error cleaning up resolved events:', error);
    throw error;
  }
}

// Run cleanup if called directly
if (require.main === module) {
  cleanupResolvedEvents()
    .then((result) => {
      console.log('✅ Cleanup completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupResolvedEvents };
