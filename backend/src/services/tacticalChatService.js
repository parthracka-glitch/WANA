const admin = require('../configuration/firebaseConfig');
const { AppError } = require('../middleware/errorHandler');
const { writeAuditLog } = require('./auditService');

const db = admin.firestore();

const PRESET_QUERIES = {
  CHECK_DANGER: 'Are you in immediate physical danger?',
  ATTACKER_PRESENT: 'Are attackers / perpetrators in the same room or visible?',
  CAN_YOU_SPEAK: 'Can you speak or make any sound safely?',
  MEDICAL_NEED: 'Is anyone physically injured or requiring urgent medical aid?',
  ARMED_THREAT: 'Are the perpetrators armed with weapons?',
};

const PRESET_ANSWERS = {
  YES: 'Yes',
  NO: 'No',
  HIDING: 'Hiding / Cannot Move',
  CANT_SPEAK: 'Cannot Speak / Silence Required',
  ARMED: 'Attackers Are Armed',
  NEED_MEDIC: 'Urgent Medical Attention Needed',
  SAFE_NOW: 'Currently in Safe Spot',
};

/**
 * Two-Way Silent Tactical Chat Service (BE-28 / M-15)
 * Enables covert, zero-audio/zero-vibration communication between
 * the police supervisor control room and a hiding citizen.
 */
class TacticalChatService {
  static getDb() {
    return this.customDb || admin.firestore();
  }

  static getPresetQueries() {
    return PRESET_QUERIES;
  }

  static getPresetAnswers() {
    return PRESET_ANSWERS;
  }

  /**
   * Supervisor dispatches a tactical query to citizen.
   */
  static async sendSupervisorQuery({
    eventId,
    supervisorUid,
    supervisorName = 'Control Room Supervisor',
    queryCode,
    customText = null,
    req = null,
  }) {
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError("Valid 'eventId' is required.", 400, 'INVALID_EVENT_ID');
    }

    const db = TacticalChatService.getDb();
    const eventRef = db.collection('ongoingEvents').doc(eventId);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      throw new AppError(`Ongoing incident '${eventId}' not found.`, 404, 'EVENT_NOT_FOUND');
    }

    const text = customText || PRESET_QUERIES[queryCode];
    if (!text) {
      throw new AppError(`Invalid queryCode '${queryCode}' or empty query text.`, 400, 'INVALID_QUERY');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const chatRef = eventRef.collection('tacticalChat').doc();

    const messageData = {
      id: chatRef.id,
      senderType: 'SUPERVISOR',
      senderUid: supervisorUid || 'supervisor_system',
      senderName: supervisorName,
      queryCode: queryCode || 'CUSTOM_QUERY',
      text,
      status: 'SENT',
      silentEnforced: true,
      timestamp: now,
      createdAtIso: new Date().toISOString(),
    };

    await chatRef.set(messageData);

    // Audit log
    await writeAuditLog({
      actorUid: supervisorUid || 'supervisor_system',
      actorRole: 'supervisor',
      action: 'TACTICAL_QUERY_DISPATCHED',
      targetId: eventId,
      regionId: eventDoc.data().regionId,
      details: { queryCode, text },
      req,
    });

    return {
      success: true,
      messageId: chatRef.id,
      message: messageData,
    };
  }

  /**
   * Citizen taps a covert pre-canned response (zero audio/vibration).
   */
  static async recordVictimResponse({
    eventId,
    victimUid = null,
    answerCode,
    customText = null,
    req = null,
  }) {
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError("Valid 'eventId' is required.", 400, 'INVALID_EVENT_ID');
    }

    const db = TacticalChatService.getDb();
    const eventRef = db.collection('ongoingEvents').doc(eventId);
    const eventDoc = await eventRef.get();
    if (!eventDoc.exists) {
      throw new AppError(`Ongoing incident '${eventId}' not found.`, 404, 'EVENT_NOT_FOUND');
    }

    const text = customText || PRESET_ANSWERS[answerCode];
    if (!text) {
      throw new AppError(`Invalid answerCode '${answerCode}' or empty answer text.`, 400, 'INVALID_ANSWER');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const chatRef = eventRef.collection('tacticalChat').doc();

    const responseData = {
      id: chatRef.id,
      senderType: 'VICTIM',
      senderUid: victimUid || eventDoc.data().sos_clicked_by_uid || 'victim',
      answerCode: answerCode || 'CUSTOM_ANSWER',
      text,
      status: 'RECEIVED',
      timestamp: now,
      createdAtIso: new Date().toISOString(),
    };

    await chatRef.set(responseData);

    // Update last tactical response on main event document
    await eventRef.update({
      lastTacticalResponse: {
        answerCode,
        text,
        receivedAt: now,
      },
    });

    // Audit log
    await writeAuditLog({
      actorUid: victimUid || eventDoc.data().sos_clicked_by_uid || 'victim',
      actorRole: 'victim',
      action: 'TACTICAL_RESPONSE_RECEIVED',
      targetId: eventId,
      regionId: eventDoc.data().regionId,
      details: { answerCode, text },
      req,
    });

    return {
      success: true,
      messageId: chatRef.id,
      response: responseData,
    };
  }

  /**
   * Fetch full tactical chat chronology for an incident.
   */
  static async getTacticalMessages(eventId) {
    if (!eventId || typeof eventId !== 'string') {
      throw new AppError("Valid 'eventId' is required.", 400, 'INVALID_EVENT_ID');
    }

    const db = TacticalChatService.getDb();
    let chatSnapshot = await db
      .collection('ongoingEvents')
      .doc(eventId)
      .collection('tacticalChat')
      .orderBy('timestamp', 'asc')
      .get();

    if (chatSnapshot.empty) {
      // Check past events if resolved
      chatSnapshot = await db
        .collection('pastEvents')
        .doc(eventId)
        .collection('tacticalChat')
        .orderBy('timestamp', 'asc')
        .get();
    }

    const messages = [];
    chatSnapshot.forEach((doc) => messages.push({ id: doc.id, ...doc.data() }));

    return {
      success: true,
      eventId,
      count: messages.length,
      messages,
      presetQueries: PRESET_QUERIES,
      presetAnswers: PRESET_ANSWERS,
    };
  }
}

module.exports = TacticalChatService;
