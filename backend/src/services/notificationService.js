const admin = require('../configuration/firebaseConfig');
const db = admin.firestore();

/**
 * Regional Supervisor Notification Service (BE-08a)
 * Sends Web Push notifications to active approved supervisors in a region
 * upon emergency SOS incident creation or escalation.
 */
class NotificationService {
  /**
   * Notify regional supervisors of an emergency event
   */
  static async notifyRegionalSupervisors({
    regionId,
    eventId,
    title = 'EMERGENCY SOS DISPATCHED',
    body = 'New emergency incident reported in your jurisdiction.',
    priority = 'high',
    data = {},
  }) {
    try {
      // 1. Fetch approved supervisors assigned to this region or 'all'
      const staffQuery = await db
        .collection('staff')
        .where('status', '==', 'APPROVED')
        .where('role', 'in', ['supervisor', 'admin'])
        .get();

      const targetStaff = [];
      const tokens = [];

      staffQuery.forEach((doc) => {
        const staff = doc.data();
        const staffRegion = (staff.regionId || staff.region || '').toString().toLowerCase().trim();
        const targetReg = (regionId || '').toString().toLowerCase().trim();

        if (staffRegion === 'all' || staffRegion === targetReg) {
          targetStaff.push({ uid: doc.id, email: staff.email, regionId: staffRegion });
          if (Array.isArray(staff.fcmTokens)) {
            tokens.push(...staff.fcmTokens);
          } else if (staff.fcmToken) {
            tokens.push(staff.fcmToken);
          }
        }
      });

      console.log(`📢 Found ${targetStaff.length} supervisors (${tokens.length} FCM tokens) for region '${regionId}'`);

      const notificationRecord = {
        eventId,
        regionId,
        title,
        body,
        priority,
        targetStaffUids: targetStaff.map((s) => s.uid),
        tokensCount: tokens.length,
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        dispatchedAtIso: new Date().toISOString(),
        status: 'SENT',
        fcmResponse: null,
      };

      // 2. Dispatch via Firebase Cloud Messaging if tokens are registered
      if (tokens.length > 0) {
        try {
          const messagingPayload = {
            tokens,
            notification: {
              title,
              body,
            },
            data: {
              eventId: String(eventId),
              regionId: String(regionId),
              click_action: `/supervisor/dashboard?event=${eventId}`,
              ...data,
            },
            webpush: {
              headers: {
                Urgency: priority === 'high' ? 'high' : 'normal',
              },
              notification: {
                requireInteraction: true,
                icon: '/icons/emergency-icon.png',
                badge: '/icons/badge.png',
              },
            },
          };

          const fcmResponse = await admin.messaging().sendEachForMulticast(messagingPayload);
          notificationRecord.fcmResponse = {
            successCount: fcmResponse.successCount,
            failureCount: fcmResponse.failureCount,
          };
          console.log(`✅ FCM multicast sent: ${fcmResponse.successCount} succeeded, ${fcmResponse.failureCount} failed.`);
        } catch (fcmError) {
          console.warn('⚠️ FCM dispatch warning (tokens may be offline/invalid):', fcmError.message);
          notificationRecord.status = 'PARTIAL_OR_FAILED';
          notificationRecord.error = fcmError.message;
        }
      } else {
        notificationRecord.status = 'NO_ACTIVE_TOKENS';
      }

      // 3. Record in Firestore 'notifications' collection
      const docRef = await db.collection('notifications').add(notificationRecord);

      return {
        notificationId: docRef.id,
        ...notificationRecord,
      };
    } catch (error) {
      console.error('❌ Failed to dispatch regional supervisor notifications:', error);
      return {
        status: 'FAILED',
        error: error.message,
      };
    }
  }
}

module.exports = NotificationService;
