/**
 * Bulletproof Manual SOS Trigger Engine (M-01)
 * Handles high-priority press-and-hold activation, UUID v4 generation,
 * 10-second cancel false-alarm window, and resilient HTTP dispatch.
 */

class SosTriggerEngine {
  constructor({ apiBaseUrl = 'https://api.wana.app', onStateChange = () => {} } = {}) {
    this.apiBaseUrl = apiBaseUrl;
    this.onStateChange = onStateChange;

    this.state = 'IDLE'; // 'IDLE' | 'COUNTDOWN' | 'DISPATCHING' | 'ACTIVE' | 'CANCELLED'
    this.cancelTimer = null;
    this.countdownSeconds = 10;
    this.currentIncident = null;
  }

  /**
   * Generates a standard RFC4122 v4 UUID
   */
  generateUuidV4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Initiates the manual SOS trigger sequence
   * Locks coordinates immediately, begins 10s false-alarm cancel window
   */
  initiateTrigger({
    location,
    emergencyType = 'GENERAL',
    victimUid = null,
    victimName = 'Citizen',
    victimPhone = null,
    batteryLevel = null,
    authToken = null,
  }) {
    if (this.state === 'COUNTDOWN' || this.state === 'ACTIVE') {
      return { success: false, message: 'SOS already active or pending dispatch.' };
    }

    const eventId = this.generateUuidV4();
    this.currentIncident = {
      eventId,
      location,
      type: emergencyType,
      victimUid,
      victimName,
      victimPhone,
      batteryLevel,
      authToken,
      initiatedAt: Date.now(),
    };

    this.state = 'COUNTDOWN';
    this.countdownSeconds = 10;
    this.notifyState();

    // Start 10-second cancel window
    this.cancelTimer = setInterval(() => {
      this.countdownSeconds -= 1;
      this.notifyState();

      if (this.countdownSeconds <= 0) {
        clearInterval(this.cancelTimer);
        this.cancelTimer = null;
        this.executeDispatch();
      }
    }, 1000);

    return {
      success: true,
      eventId,
      countdownSeconds: this.countdownSeconds,
    };
  }

  /**
   * Cancels accidental trigger during the 10-second window
   */
  cancelFalseAlarm(reason = 'Accidental manual tap') {
    if (this.state !== 'COUNTDOWN') {
      return { success: false, message: 'Cannot cancel: incident not in countdown state.' };
    }

    if (this.cancelTimer) {
      clearInterval(this.cancelTimer);
      this.cancelTimer = null;
    }

    const cancelledId = this.currentIncident?.eventId;
    this.state = 'CANCELLED';
    this.notifyState({ reason });

    // Reset back to IDLE after a short pause
    setTimeout(() => {
      this.state = 'IDLE';
      this.currentIncident = null;
      this.notifyState();
    }, 1500);

    console.log(`🛑 False alarm cancelled for event ${cancelledId}: ${reason}`);
    return { success: true, message: 'False alarm cancelled successfully.' };
  }

  /**
   * Executes permanent network dispatch to backend
   */
  async executeDispatch() {
    if (!this.currentIncident) return;

    this.state = 'DISPATCHING';
    this.notifyState();

    const payload = {
      eventId: this.currentIncident.eventId,
      victimUid: this.currentIncident.victimUid,
      victimName: this.currentIncident.victimName,
      victimPhone: this.currentIncident.victimPhone,
      location: this.currentIncident.location,
      type: this.currentIncident.type,
      batteryLevel: this.currentIncident.batteryLevel,
    };

    const headers = { 'Content-Type': 'application/json' };
    if (this.currentIncident.authToken) {
      headers['Authorization'] = `Bearer ${this.currentIncident.authToken}`;
    }

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        const res = await fetch(`${this.apiBaseUrl}/events/sos`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`Dispatch failed with HTTP status ${res.status}`);
        }

        const data = await res.json();
        this.state = 'ACTIVE';
        this.notifyState({ event: data.data, idempotent: data.idempotent });
        return { success: true, event: data.data };
      } catch (err) {
        console.warn(`Dispatch attempt ${attempts} failed:`, err.message);
        if (attempts >= maxAttempts) {
          this.state = 'RETRY_PENDING';
          this.notifyState({ error: err.message });
          return { success: false, error: err.message, pendingRetry: true };
        }
        // Exponential backoff wait (500ms, 1500ms)
        await new Promise((r) => setTimeout(r, attempts * 500));
      }
    }
  }

  notifyState(extra = {}) {
    this.onStateChange({
      state: this.state,
      countdownSeconds: this.countdownSeconds,
      incident: this.currentIncident,
      ...extra,
    });
  }
}

module.exports = SosTriggerEngine;
