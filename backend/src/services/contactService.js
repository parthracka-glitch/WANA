const admin = require('../configuration/firebaseConfig');
const db = admin.firestore();
const { AppError } = require('../middleware/errorHandler');

/**
 * Emergency Contacts Management & Consent Vault Service (M-09)
 * Manages user emergency contacts (up to 5) and secures digital consent logs.
 */
const MAX_EMERGENCY_CONTACTS = 5;

class ContactService {
  /**
   * Retrieves registered contacts for a user
   */
  static async getUserContacts(userId) {
    const snapshot = await db
      .collection('users')
      .doc(userId)
      .collection('emergencyContacts')
      .get();

    const contacts = [];
    snapshot.forEach((doc) => contacts.push({ id: doc.id, ...doc.data() }));
    return contacts;
  }

  /**
   * Registers a new emergency contact with mandatory digital consent record
   */
  static async addContact({
    userId,
    name,
    phone,
    relationship = 'Family/Friend',
    deviceId = null,
    consentGiven = true,
    req = null,
  }) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new AppError('Contact name is required.', 400, 'MISSING_NAME');
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length < 8) {
      throw new AppError('Valid phone number is required.', 400, 'INVALID_PHONE');
    }

    if (!consentGiven) {
      throw new AppError('Explicit user consent is mandatory to store emergency contacts.', 400, 'CONSENT_REQUIRED');
    }

    const contactsRef = db.collection('users').doc(userId).collection('emergencyContacts');
    const existingSnapshot = await contactsRef.get();

    if (existingSnapshot.size >= MAX_EMERGENCY_CONTACTS) {
      throw new AppError(
        `Emergency contact limit reached (Maximum: ${MAX_EMERGENCY_CONTACTS}).`,
        400,
        'MAX_CONTACTS_EXCEEDED'
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    const newContact = {
      name: name.trim(),
      phone: phone.trim(),
      relationship: relationship.trim(),
      createdAt: now,
      createdAtIso: new Date().toISOString(),
      // Consent Vault (M-09)
      consentRecord: {
        consentGiven: true,
        consentTimestamp: now,
        consentTimestampIso: new Date().toISOString(),
        deviceId: deviceId || 'unknown_device',
        clientIp: req?.ip || null,
        userAgent: req?.headers ? req.headers['user-agent'] : null,
      },
    };

    const docRef = await contactsRef.add(newContact);
    return {
      id: docRef.id,
      ...newContact,
    };
  }

  /**
   * Deletes an emergency contact
   */
  static async deleteContact(userId, contactId) {
    const docRef = db.collection('users').doc(userId).collection('emergencyContacts').doc(contactId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new AppError('Emergency contact not found.', 404, 'CONTACT_NOT_FOUND');
    }

    await docRef.delete();
    return { success: true, message: 'Contact successfully removed.', contactId };
  }
}

module.exports = ContactService;
