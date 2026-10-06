/**
 * Zero-Data SMS Fallback Bridge (M-13 / BE-25)
 *
 * Provides a resilient cellular SMS transport bridge when mobile data
 * (4G/5G/WiFi) is completely unavailable or congested during an SOS.
 * Encodes emergency coordinates into a compact 160-char SMS with CRC-16 validation.
 */

// CRC-16-CCITT calculation (Polynomial: 0x1021, Init: 0xFFFF)
function calculateCrc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

class SmsFallbackBridge {
  constructor(options = {}) {
    this.prefix = options.prefix || 'WANA!SOS';
    this.defaultSmsGateways = options.gateways || ['+918000112112', '112'];
  }

  /**
   * Encodes emergency event coordinates and telemetry into compact SMS text.
   * Format: WANA!SOS*<eventId>*<lat>*<lng>*<battery>*<timestamp>*<CRC16>
   */
  encodeSmsPayload({ eventId, latitude, longitude, batteryLevel = 100, timestamp = null }) {
    if (!eventId || typeof eventId !== 'string') {
      throw new Error("Missing mandatory 'eventId' for SMS encoding.");
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new Error("Valid numeric coordinates required for SMS encoding.");
    }

    const ts = timestamp || Math.floor(Date.now() / 1000);
    const latStr = latitude.toFixed(5);
    const lngStr = longitude.toFixed(5);
    const batStr = Math.max(0, Math.min(100, Math.round(batteryLevel)));

    const rawPayload = `${this.prefix}*${eventId}*${latStr}*${lngStr}*${batStr}*${ts}`;
    const crc = calculateCrc16(rawPayload);

    const fullSmsMessage = `${rawPayload}*${crc}`;
    return {
      message: fullSmsMessage,
      charLength: fullSmsMessage.length,
      isSingleGsmSms: fullSmsMessage.length <= 160,
      crc,
    };
  }

  /**
   * Decodes and validates an incoming SMS fallback message.
   */
  decodeSmsPayload(smsText) {
    if (!smsText || typeof smsText !== 'string') {
      return { valid: false, error: 'Empty or invalid SMS string' };
    }

    const trimmed = smsText.trim();
    if (!trimmed.startsWith(this.prefix + '*')) {
      return { valid: false, error: `Invalid header prefix. Expected '${this.prefix}*'` };
    }

    const parts = trimmed.split('*');
    if (parts.length !== 7) {
      return { valid: false, error: `Invalid segment count. Expected 7 segments, received ${parts.length}` };
    }

    const [prefix, eventId, latStr, lngStr, batStr, tsStr, receivedCrc] = parts;
    const reconstructedPayload = `${prefix}*${eventId}*${latStr}*${lngStr}*${batStr}*${tsStr}`;
    const expectedCrc = calculateCrc16(reconstructedPayload);

    if (receivedCrc.toUpperCase() !== expectedCrc) {
      return {
        valid: false,
        error: `CRC-16 mismatch. Expected ${expectedCrc}, received ${receivedCrc}`,
      };
    }

    const latitude = parseFloat(latStr);
    const longitude = parseFloat(lngStr);
    const batteryLevel = parseInt(batStr, 10);
    const timestampSec = parseInt(tsStr, 10);

    if (isNaN(latitude) || isNaN(longitude)) {
      return { valid: false, error: 'Corrupt coordinate values in SMS body.' };
    }

    return {
      valid: true,
      eventId,
      location: {
        latitude,
        longitude,
      },
      batteryLevel: isNaN(batteryLevel) ? null : batteryLevel,
      timestamp: new Date(timestampSec * 1000).toISOString(),
      timestampSec,
      crc: receivedCrc,
    };
  }

  /**
   * Checks whether the mobile client should trigger SMS fallback.
   */
  shouldFallback({ isOnline, networkFailuresCount = 0, timeoutElapsedMs = 0 }) {
    if (!isOnline) return true;
    if (networkFailuresCount >= 2) return true;
    if (timeoutElapsedMs >= 10000) return true;
    return false;
  }

  /**
   * Constructs standard mobile platform URI for launching native SMS app / background SMS.
   */
  buildSmsIntentUri(recipientNumber, encodedMessage) {
    const target = recipientNumber || this.defaultSmsGateways[0];
    return `sms:${target}?body=${encodeURIComponent(encodedMessage)}`;
  }
}

module.exports = SmsFallbackBridge;
