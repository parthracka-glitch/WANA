/**
 * Duress PIN & Coerced Deactivation Guard (M-12 / BE-24)
 *
 * Protects victims forced by perpetrators to deactivate an active SOS.
 * Differentiates between a genuine cancellation PIN and a covert Duress PIN.
 * If Duress PIN is entered:
 * 1. Simulates realistic cancellation UI to appease the hostile perpetrator.
 * 2. Secretly dispatches a high-priority covert alert (SEV-0) to the control room.
 * 3. Locks covert audio/video recording permanently ON.
 */

class DuressGuardService {
  constructor(options = {}) {
    this.safePin = options.safePin || '1234';
    this.duressPin = options.duressPin || '9999';
    this.isCovertLockActive = false;
  }

  /**
   * Set user emergency PIN credentials.
   */
  setPins({ safePin, duressPin }) {
    if (!safePin || !duressPin || safePin === duressPin) {
      throw new Error('Safe PIN and Duress PIN must be distinct 4-digit codes.');
    }
    this.safePin = String(safePin);
    this.duressPin = String(duressPin);
  }

  /**
   * Evaluate a PIN submitted during active emergency deactivation attempt.
   */
  async handleDeactivationAttempt({ enteredPin, eventId, apiDispatcher, onCovertAlertTriggered }) {
    const pinStr = String(enteredPin);

    // Case 1: Genuine Cancellation
    if (pinStr === this.safePin) {
      return {
        status: 'GENUINE_CANCEL',
        isDuress: false,
        covertLockActive: false,
        uiMessage: 'Emergency cancelled by user.',
      };
    }

    // Case 2: Coerced Deactivation under Duress
    if (pinStr === this.duressPin) {
      this.isCovertLockActive = true;

      const payload = {
        eventId,
        action: 'DURESS_COERCED_DEACTIVATION',
        lockEvidenceRecording: true,
        covertTimestamp: new Date().toISOString(),
        hostilePerpetratorPresent: true,
      };

      // Secretly notify backend if dispatcher provided
      if (typeof apiDispatcher === 'function') {
        try {
          await apiDispatcher('/events/' + eventId + '/duress-cancel', payload);
        } catch (err) {
          console.warn('⚠️ Covert duress packet dispatch warning:', err.message);
        }
      }

      if (typeof onCovertAlertTriggered === 'function') {
        onCovertAlertTriggered(payload);
      }

      // Return decoy UI to appease perpetrator
      return {
        status: 'DECOY_CANCELLED',
        isDuress: true,
        covertLockActive: true,
        uiMessage: 'Emergency cancelled successfully.',
        decoyScreenAction: 'DISMISS_ALARM_VIEW',
      };
    }

    // Case 3: Invalid PIN
    return {
      status: 'INVALID_PIN',
      isDuress: false,
      covertLockActive: this.isCovertLockActive,
      uiMessage: 'Incorrect PIN. Please re-enter.',
    };
  }
}

module.exports = DuressGuardService;
