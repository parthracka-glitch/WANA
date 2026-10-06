const path = require('path');
const admin = require('../configuration/firebaseConfig');
const { writeAuditLog } = require('./auditService');
const EventLifecycleService = require('./eventLifecycle');

let SmsFallbackBridge;
try {
  SmsFallbackBridge = require(path.resolve(__dirname, '../../../mobile-sdk/src/smsFallbackBridge'));
} catch {
  SmsFallbackBridge = require(path.resolve(__dirname, '../../../../mobile-sdk/src/smsFallbackBridge'));
}

const db = admin.firestore();
const smsBridge = new SmsFallbackBridge();

/**
 * Zero-Data SMS Fallback Uplink Service (BE-25)
 * Ingests incoming SMS webhook callbacks from Telecom/SMS gateways (e.g. Twilio, Exotel, ERSS Dial 112 SMS bridge).
 */
class SmsUplinkService {
  static getDb() {
    return this.customDb || admin.firestore();
  }

  /**
   * Process raw incoming SMS message from gateway webhook.
   */
  static async processIncomingSms({ from, body, gateway = 'GENERIC', req = null }) {
    if (!body || typeof body !== 'string') {
      return {
        success: false,
        status: 'REJECTED',
        error: 'Empty SMS body received.',
      };
    }

    const decoded = smsBridge.decodeSmsPayload(body);
    if (!decoded.valid) {
      return {
        success: false,
        status: 'CORRUPT_PAYLOAD',
        error: decoded.error,
      };
    }

    const { eventId, location, batteryLevel, timestamp } = decoded;
    const cleanFrom = from ? String(from).trim() : 'UNKNOWN_TELECOM';
    const db = SmsUplinkService.getDb();

    // Check if event is currently active in ongoingEvents
    const ongoingRef = db.collection('ongoingEvents').doc(eventId);
    const ongoingDoc = await ongoingRef.get();

    let result;
    if (ongoingDoc.exists) {
      // Existing incident: record location heartbeat from SMS channel
      const heartbeat = await EventLifecycleService.recordLocationHeartbeat({
        eventId,
        location,
        batteryLevel,
        callerUid: `sms_${cleanFrom}`,
      });

      await ongoingRef.update({
        lastIngressChannel: 'SMS_FALLBACK',
        smsUplinkReceivedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      result = {
        action: 'LOCATION_UPDATED_VIA_SMS',
        eventId,
        heartbeat,
      };
    } else {
      // Check if already in past events
      const pastDoc = await db.collection('pastEvents').doc(eventId).get();
      if (pastDoc.exists) {
        return {
          success: true,
          status: 'EVENT_ALREADY_RESOLVED',
          eventId,
        };
      }

      // New incident created via Zero-Data SMS uplink
      const ingestResult = await EventLifecycleService.ingestSosEvent({
        eventId,
        victimUid: `sms_${cleanFrom.replace(/\D/g, '') || 'citizen'}`,
        victimName: `Citizen (SMS Uplink - ${cleanFrom})`,
        victimPhone: cleanFrom,
        location,
        type: 'SMS_SOS',
        batteryLevel,
        req,
      });

      await ongoingRef.update({
        ingressChannel: 'SMS_FALLBACK',
        gatewayProvider: gateway,
        smsOrigin: cleanFrom,
      });

      result = {
        action: 'INCIDENT_CREATED_VIA_SMS',
        eventId,
        ingestResult,
      };
    }

    // Write audit log
    await writeAuditLog({
      actorUid: `gateway_${gateway}`,
      actorRole: 'telecom_gateway',
      action: 'SMS_UPLINK_INGESTED',
      targetId: eventId,
      regionId: ongoingDoc.exists ? ongoingDoc.data().regionId : 'unrouted',
      details: {
        from: cleanFrom,
        location,
        batteryLevel,
        crc: decoded.crc,
        gateway,
      },
      req,
      customDocId: `audit_${eventId}_sms_${Date.now()}`,
    });

    return {
      success: true,
      status: 'PROCESSED',
      eventId,
      decoded,
      data: result,
    };
  }
}

module.exports = SmsUplinkService;
