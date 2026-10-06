/**
 * Hardware Silent Triggers & Volume Button Debouncing (M-03)
 * Detects 4 rapid presses of Volume Down within a 2.5-second window.
 * Eliminates pocket-dial false positives via multi-tier debouncing.
 * Executes silent background emergency dispatch without screen flash or audio.
 */

const TARGET_PRESS_COUNT = 4;
const WINDOW_DURATION_MS = 2500; // 2.5 seconds total window
const MIN_GAP_MS = 120; // Rejects mechanical contact bounce (< 120ms)
const MAX_GAP_MS = 800; // Rejects normal volume step adjustments (> 800ms)

class SilentTriggerService {
  constructor({ onSilentTriggerActivated = () => {}, isEnabled = true } = {}) {
    this.onSilentTriggerActivated = onSilentTriggerActivated;
    this.isEnabled = isEnabled;

    this.pressTimestamps = [];
    this.lastTriggerTime = 0;
    this.cooldownMs = 15000; // 15-second cooldown after firing to prevent duplicate bursts
  }

  /**
   * Registers a hardware key down event from native OS layer
   * keyCode: 'VOLUME_DOWN' or standard Android KeyEvent.KEYCODE_VOLUME_DOWN (25)
   */
  handleHardwareKeyEvent(keyCode) {
    if (!this.isEnabled) return false;

    // Check if key is Volume Down
    const isVolumeDown =
      keyCode === 'VOLUME_DOWN' ||
      keyCode === 25 ||
      keyCode === 'VolumeDown' ||
      keyCode === 'volume_down';

    if (!isVolumeDown) return false;

    const now = Date.now();

    // Check cooldown
    if (now - this.lastTriggerTime < this.cooldownMs) {
      console.log('⏳ Silent trigger ignored: currently in trigger cooldown.');
      return false;
    }

    // 1. Debounce contact bounce (reject if press is too fast, e.g. < 120ms from last)
    if (this.pressTimestamps.length > 0) {
      const lastPress = this.pressTimestamps[this.pressTimestamps.length - 1];
      const gap = now - lastPress;

      if (gap < MIN_GAP_MS) {
        console.log(`⚠️ Ignored mechanical contact bounce (gap: ${gap}ms)`);
        return false;
      }

      // If gap is too large (> 800ms), user was adjusting volume normally -> reset sequence
      if (gap > MAX_GAP_MS) {
        console.log(`ℹ️ Sequence reset: normal volume adjustment detected (gap: ${gap}ms)`);
        this.pressTimestamps = [now];
        return false;
      }
    }

    // 2. Append valid press
    this.pressTimestamps.push(now);

    // 3. Purge timestamps outside the 2.5s window
    this.pressTimestamps = this.pressTimestamps.filter((t) => now - t <= WINDOW_DURATION_MS);

    console.log(`🔘 Volume Down sequence: ${this.pressTimestamps.length} of ${TARGET_PRESS_COUNT} in window`);

    // 4. Check if sequence criteria satisfied
    if (this.pressTimestamps.length >= TARGET_PRESS_COUNT) {
      this.lastTriggerTime = now;
      this.pressTimestamps = []; // Reset after trigger

      console.log('🚨 SILENT EMERGENCY TRIGGER DETECTED! Executing stealth dispatch...');
      this.executeSilentDispatch();
      return true;
    }

    return false;
  }

  /**
   * Executes silent dispatch without screen illumination or audio
   */
  executeSilentDispatch() {
    this.onSilentTriggerActivated({
      triggerSource: 'HARDWARE_KEY_VOLUME_DOWN_4X',
      emergencyType: 'SILENT_DURESS',
      timestamp: Date.now(),
      suppressAudio: true,
      suppressVisualAlarm: true,
    });
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }
}

module.exports = SilentTriggerService;
