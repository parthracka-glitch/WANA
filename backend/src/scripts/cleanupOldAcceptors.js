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
 * One-time cleanup script to remove acceptors for events that are already in pastEvents
 * This cleans up orphaned acceptor data in acceptedEvents collection
 */

async function cleanupOldAcceptors() {
  console.log('🧹 Starting cleanup of old acceptors from acceptedEvents...');
  
  try {
    // Get all event IDs from pastEvents
    const pastEventsSnapshot = await db.collection('pastEvents').get();
    const pastEventIds = pastEventsSnapshot.docs.map(doc => doc.id);

    console.log(`📋 Found ${pastEventIds.length} events in pastEvents`);

    if (pastEventIds.length === 0) {
      console.log('✅ No past events found');
      return { deleted: 0, message: 'No acceptors to clean up' };
    }

    let deletedCount = 0;
    const batch = db.batch();

    // For each past event, check if acceptors exist in acceptedEvents
    for (const eventId of pastEventIds) {
      const acceptedEventRef = db.collection('acceptedEvents').doc(eventId);
      const acceptorsSnapshot = await acceptedEventRef.collection('acceptors').get();

      if (!acceptorsSnapshot.empty) {
        console.log(`🗑️  Deleting ${acceptorsSnapshot.size} acceptors for event ${eventId}`);
        
        // Delete all acceptors
        for (const acceptorDoc of acceptorsSnapshot.docs) {
          batch.delete(acceptorDoc.ref);
          deletedCount++;
        }

        // Delete the parent acceptedEvents document
        batch.delete(acceptedEventRef);
      }
    }

    if (deletedCount > 0) {
      await batch.commit();
      console.log(`✅ Successfully deleted ${deletedCount} old acceptors from acceptedEvents`);
    } else {
      console.log('✅ No old acceptors found to delete');
    }

    return { 
      deleted: deletedCount, 
      message: `Deleted ${deletedCount} old acceptors from acceptedEvents` 
    };

  } catch (error) {
    console.error('❌ Error cleaning up old acceptors:', error);
    throw error;
  }
}

// Run cleanup if called directly
if (require.main === module) {
  cleanupOldAcceptors()
    .then((result) => {
      console.log('✅ Cleanup completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Cleanup failed:', error);
      process.exit(1);
    });
}

module.exports = { cleanupOldAcceptors };
