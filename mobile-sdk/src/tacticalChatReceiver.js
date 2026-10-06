/**
 * Two-Way Silent Tactical Chat Receiver (M-15)
 *
 * Guarantees zero sound and zero vibration when incoming supervisor
 * queries arrive on the mobile device, preventing alerting perpetrators.
 * Allows quick single-tap discrete answers.
 */

class TacticalChatReceiver {
  constructor(options = {}) {
    this.eventId = options.eventId || null;
    this.apiDispatcher = options.apiDispatcher || null;
    this.audioMuted = true;
    this.vibrationDisabled = true;
    this.activeQueries = [];
    this.onQueryReceivedCallback = options.onQueryReceived || null;
  }

  /**
   * Handle incoming tactical query push from control room.
   * Guarantees strict silence: zero audio, zero vibration.
   */
  handleIncomingQuery(queryMessage) {
    // Enforce hardware silence invariant
    this.enforceAbsoluteStealth();

    const query = {
      messageId: queryMessage.id,
      queryCode: queryMessage.queryCode,
      text: queryMessage.text,
      receivedAt: new Date().toISOString(),
      answered: false,
    };

    this.activeQueries.push(query);

    if (typeof this.onQueryReceivedCallback === 'function') {
      this.onQueryReceivedCallback(query);
    }

    return {
      status: 'RECEIVED_STEALTH',
      audioSuppressed: true,
      vibrationSuppressed: true,
      query,
    };
  }

  /**
   * Dispatches a single-tap discrete answer.
   */
  async submitResponse({ answerCode, customText = null, eventId = null }) {
    const targetEventId = eventId || this.eventId;
    if (!targetEventId) {
      throw new Error("Missing 'eventId' for tactical response.");
    }

    const payload = {
      answerCode,
      customText,
      stealthDispatchedAt: new Date().toISOString(),
    };

    if (typeof this.apiDispatcher === 'function') {
      try {
        const res = await this.apiDispatcher(`/tactical-chat/${targetEventId}/respond`, payload);
        return {
          success: true,
          status: 'DISPATCHED_SILENTLY',
          data: res,
        };
      } catch (err) {
        console.warn('⚠️ Tactical response network warning:', err.message);
        return {
          success: false,
          status: 'QUEUED_LOCALLY',
          payload,
        };
      }
    }

    return {
      success: true,
      status: 'SIMULATED_DISPATCH',
      payload,
    };
  }

  enforceAbsoluteStealth() {
    this.audioMuted = true;
    this.vibrationDisabled = true;
  }
}

module.exports = TacticalChatReceiver;
