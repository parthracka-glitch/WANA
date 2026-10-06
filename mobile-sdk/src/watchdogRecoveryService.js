/**
 * WatchdogRecoveryService (M-11)
 * Process Watchdog & OS Crash / Reboot Recovery Engine for Mobile.
 *
 * Responsibilities:
 * 1. Persist active SOS emergency state into encrypted persistent storage (SharedPreferences / Keychain / File).
 * 2. Simulate / interface with Android BOOT_COMPLETED broadcast receiver and iOS app lifecycle revival.
 * 3. Detect ungraceful process terminations, low-memory kills (OOM), or device reboots during active SOS.
 * 4. Automatically resurrect emergency state, restart Foreground Service, and resume heartbeat streaming.
 * 5. Atomically clear emergency state when resolution is completed.
 */
class WatchdogRecoveryService {
  constructor(options = {}) {
    this.persistenceAdapter = options.persistenceAdapter || new InMemoryWatchdogStore();
    this.onEmergencyRestored = options.onEmergencyRestored || null;
    this.onRecoveryCheckPassed = options.onRecoveryCheckPassed || null;
    this.onStateSaved = options.onStateSaved || null;
    this.onStateCleared = options.onStateCleared || null;
  }

  /**
   * Persist active emergency state to withstand process kill or reboot.
   */
  async persistActiveSosState(sosState) {
    if (!sosState || !sosState.eventId) {
      throw new Error('Valid SOS state with eventId is required to persist');
    }

    const stateRecord = {
      eventId: sosState.eventId,
      emergencyType: sosState.emergencyType || 'EMERGENCY',
      timestamp: Date.now(),
      isActive: true,
      victimUid: sosState.victimUid || null,
      lastKnownLocation: sosState.location || null,
      metadata: sosState.metadata || {},
    };

    await this.persistenceAdapter.save('ACTIVE_SOS_RECOVERY_KEY', stateRecord);

    if (this.onStateSaved) {
      this.onStateSaved(stateRecord);
    }

    return { success: true, eventId: sosState.eventId };
  }

  /**
   * Called during application bootstrap / BOOT_COMPLETED broadcast receiver.
   * Checks if an emergency was in progress when process terminated.
   */
  async checkAndRecoverOnBoot(bootReason = 'BOOT_COMPLETED') {
    const savedState = await this.persistenceAdapter.get('ACTIVE_SOS_RECOVERY_KEY');

    if (!savedState || !savedState.isActive) {
      if (this.onRecoveryCheckPassed) {
        this.onRecoveryCheckPassed({ hasPendingSos: false, bootReason });
      }
      return { hasPendingSos: false, restored: false, bootReason };
    }

    // Emergency was active! Initiate revival sequence
    const recoveryReport = {
      hasPendingSos: true,
      restored: true,
      bootReason,
      eventId: savedState.eventId,
      emergencyType: savedState.emergencyType,
      lastKnownLocation: savedState.lastKnownLocation,
      downtimeMs: Date.now() - savedState.timestamp,
    };

    if (this.onEmergencyRestored) {
      this.onEmergencyRestored(recoveryReport);
    }

    return recoveryReport;
  }

  /**
   * Clear active emergency state upon verified resolution or cancel.
   */
  async clearSosState(eventId) {
    const saved = await this.persistenceAdapter.get('ACTIVE_SOS_RECOVERY_KEY');
    if (saved && (!eventId || saved.eventId === eventId)) {
      await this.persistenceAdapter.remove('ACTIVE_SOS_RECOVERY_KEY');
      if (this.onStateCleared) {
        this.onStateCleared({ eventId: saved.eventId });
      }
    }
    return { success: true, cleared: true };
  }

  /**
   * Query current active watchdog state.
   */
  async getActiveState() {
    return await this.persistenceAdapter.get('ACTIVE_SOS_RECOVERY_KEY');
  }
}

/**
 * InMemoryWatchdogStore: Default persistence adapter (emulates Android EncryptedSharedPreferences)
 */
class InMemoryWatchdogStore {
  constructor() {
    this.store = new Map();
  }

  async save(key, data) {
    this.store.set(key, JSON.parse(JSON.stringify(data)));
  }

  async get(key) {
    const val = this.store.get(key);
    return val ? JSON.parse(JSON.stringify(val)) : null;
  }

  async remove(key) {
    this.store.delete(key);
  }

  async clear() {
    this.store.clear();
  }
}

module.exports = { WatchdogRecoveryService, InMemoryWatchdogStore };
