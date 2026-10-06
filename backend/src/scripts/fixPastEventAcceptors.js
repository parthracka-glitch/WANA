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
 * One-time fix script to copy acceptors from acceptedEvents to pastEvents
 * for events that are already in pastEvents but missing acceptor data
 */

async function fixPastEventAcceptors() {
  console.log('🔧 Starting fix for past event acceptors...');
  
  try {
    // Get all events from pastEvents
    const pastEventsSnapshot = await db.collection('pastEvents').get();
    
    console.log(`📋 Found ${pastEventsSnapshot.size} events in pastEvents`);

    let fixedCount = 0;
    let acceptorsCopied = 0;

    for (const pastEventDoc of pastEventsSnapshot.docs) {
      const eventId = pastEventDoc.id;
      
      // Check if this event already has acceptors in pastEvents
      const pastAcceptorsSnapshot = await pastEventDoc.ref.collection('acceptors').get();
      
      if (!pastAcceptorsSnapshot.empty) {
        // Already has acceptors, skip
        continue;
      }

      // Check if acceptors exist in acceptedEvents
      const acceptedEventRef = db.collection('acceptedEvents').doc(eventId);
      const acceptedAcceptorsSnapshot = await acceptedEventRef.collection('acceptors').get();

      if (!acceptedAcceptorsSnapshot.empty) {
        console.log(`📝 Copying ${acceptedAcceptorsSnapshot.size} acceptors for event ${eventId}`);
        
        const batch = db.batch();
        
        // Copy acceptors to pastEvents
        for (const acceptorDoc of acceptedAcceptorsSnapshot.docs) {
          const acceptorData = acceptorDoc.data();
          const pastAcceptorRef = pastEventDoc.ref.collection('acceptors').doc(acceptorDoc.id);
          
          batch.set(pastAcceptorRef, {
            ...acceptorData,
            archived_at: admin.firestore.Timestamp.now(),
            archived_reason: 'Copied from acceptedEvents during fix'
          });

          acceptorsCopied++;
        }

        await batch.commit();
        fixedCount++;
      }
    }

    console.log(`✅ Successfully fixed ${fixedCount} events, copied ${acceptorsCopied} acceptors`);
    return { 
      fixedEvents: fixedCount,
      acceptorsCopied: acceptorsCopied,
      message: `Fixed ${fixedCount} events with ${acceptorsCopied} acceptors` 
    };

  } catch (error) {
    console.error('❌ Error fixing past event acceptors:', error);
    throw error;
  }
}

// Run fix if called directly
if (require.main === module) {
  fixPastEventAcceptors()
    .then((result) => {
      console.log('✅ Fix completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fix failed:', error);
      process.exit(1);
    });
}

module.exports = { fixPastEventAcceptors };
