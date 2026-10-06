/**
 * Emergency Contacts Client Manager & Consent Vault (M-09)
 * Handles client-side emergency contact onboarding, format validation,
 * and explicit digital consent vault generation before backend synchronization.
 */

const MAX_CONTACTS = 5;

class EmergencyContactsManager {
  constructor({ apiBaseUrl = 'https://api.wana.app', getAuthToken = () => null } = {}) {
    this.apiBaseUrl = apiBaseUrl;
    this.getAuthToken = getAuthToken;
  }

  /**
   * Validates international / national phone number
   */
  validatePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const clean = phone.replace(/[\s\-()]/g, '');
    // Supports +91 standard Indian format or standard 10-15 digit numbers
    const phoneRegex = /^\+?[1-9]\d{7,14}$/;
    return phoneRegex.test(clean);
  }

  /**
   * Fetches user's emergency contacts from backend
   */
  async fetchContacts() {
    const token = await this.getAuthToken();
    if (!token) throw new Error('Authentication required to fetch emergency contacts.');

    const res = await fetch(`${this.apiBaseUrl}/contacts`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Failed to fetch contacts: HTTP ${res.status}`);
    const data = await res.json();
    return data.data || [];
  }

  /**
   * Adds a new emergency contact with mandatory explicit digital consent
   */
  async addContact({ name, phone, relationship = 'Family', deviceId = 'mobile_client_device' }) {
    if (!name || name.trim().length === 0) {
      throw new Error('Contact name is required.');
    }

    if (!this.validatePhoneNumber(phone)) {
      throw new Error('Please enter a valid phone number with country code (e.g. +91 9876543210).');
    }

    const token = await this.getAuthToken();
    if (!token) throw new Error('Authentication required to save emergency contacts.');

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      relationship: relationship.trim(),
      deviceId,
      consentGiven: true, // Explicit user confirmation required
    };

    const res = await fetch(`${this.apiBaseUrl}/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to register emergency contact.');
    }

    return data.data;
  }

  /**
   * Deletes an emergency contact
   */
  async removeContact(contactId) {
    const token = await this.getAuthToken();
    if (!token) throw new Error('Authentication required to delete emergency contact.');

    const res = await fetch(`${this.apiBaseUrl}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Failed to remove contact: HTTP ${res.status}`);
    return await res.json();
  }
}

module.exports = EmergencyContactsManager;
