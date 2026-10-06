/**
 * Critical Battery Survival Mode & Beacon (M-14 / BE-26)
 *
 * Manages power degradation during active emergencies.
 * 1. Under 10% battery: Throttles GPS polling from 15s to 60s to conserve dying battery.
 * 2. At <= 2% battery: Emits a final 'IMMINENT_POWER_DEATH' beacon with last known
 *    velocity, bearing, and projected trajectory vector before the device shuts down.
 */

const CRITICAL_THRESHOLD = 10;
const IMMINENT_DEATH_THRESHOLD = 2;
const NORMAL_INTERVAL_MS = 15000;
const THROTTLED_INTERVAL_MS = 60000;

class BatterySurvivalService {
  constructor(options = {}) {
    this.criticalThreshold = options.criticalThreshold || CRITICAL_THRESHOLD;
    this.imminentThreshold = options.imminentThreshold || IMMINENT_DEATH_THRESHOLD;
    this.isPowerSaverActive = false;
    this.imminentBeaconDispatched = false;
  }

  /**
   * Calculates dead-reckoning projected coordinates based on velocity and heading.
   * @param {number} lat - Current latitude
   * @param {number} lng - Current longitude
   * @param {number} speedMps - Speed in meters/second
   * @param {number} bearingDeg - Heading in degrees (0-360)
   * @param {number} durationSec - Projection duration in seconds
   */
  projectLocation(lat, lng, speedMps, bearingDeg, durationSec) {
    if (!speedMps || speedMps <= 0.5 || bearingDeg === null || bearingDeg === undefined) {
      // Device is stationary or no heading available
      return {
        latitude: lat,
        longitude: lng,
        confidence: 'STATIONARY_NO_MOVEMENT',
        projectedDistanceMeters: 0,
      };
    }

    const distanceMeters = speedMps * durationSec;
    const dR = distanceMeters / 6371000; // Earth radius in meters
    const bearingRad = (bearingDeg * Math.PI) / 180;
    const latRad = (lat * Math.PI) / 180;
    const lngRad = (lng * Math.PI) / 180;

    const projLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(dR) +
      Math.cos(latRad) * Math.sin(dR) * Math.cos(bearingRad)
    );

    const projLngRad = lngRad + Math.atan2(
      Math.sin(bearingRad) * Math.sin(dR) * Math.cos(latRad),
      Math.cos(dR) - Math.sin(latRad) * Math.sin(projLatRad)
    );

    return {
      latitude: Number(((projLatRad * 180) / Math.PI).toFixed(6)),
      longitude: Number(((projLngRad * 180) / Math.PI).toFixed(6)),
      projectedDistanceMeters: Math.round(distanceMeters),
      confidence: 'VECTOR_EXTRAPOLATION',
    };
  }

  /**
   * Evaluates battery telemetry and triggers survival throttling or imminent death beacon.
   */
  async evaluateBatteryState({
    batteryLevel,
    isCharging = false,
    eventId,
    lastKnownLocation = null,
    speed = 0,
    bearing = null,
    apiDispatcher = null,
  }) {
    const level = Math.max(0, Math.min(100, Math.round(batteryLevel)));

    // Case 1: Phone is charging - restore normal operational mode
    if (isCharging) {
      this.isPowerSaverActive = false;
      return {
        status: 'CHARGING',
        gpsIntervalMs: NORMAL_INTERVAL_MS,
        powerSaverActive: false,
      };
    }

    // Case 2: Imminent hardware power shutdown (<= 2%)
    if (level <= this.imminentThreshold && !this.imminentBeaconDispatched) {
      this.imminentBeaconDispatched = true;
      this.isPowerSaverActive = true;

      const projections = {};
      if (lastKnownLocation && typeof lastKnownLocation.latitude === 'number') {
        projections['plus15Minutes'] = this.projectLocation(
          lastKnownLocation.latitude,
          lastKnownLocation.longitude,
          speed,
          bearing,
          900 // 15 mins
        );
        projections['plus30Minutes'] = this.projectLocation(
          lastKnownLocation.latitude,
          lastKnownLocation.longitude,
          speed,
          bearing,
          1800 // 30 mins
        );
      }

      const beaconPayload = {
        eventId,
        batteryLevel: level,
        beaconType: 'IMMINENT_POWER_DEATH',
        lastKnownLocation,
        speed: speed || 0,
        bearing: bearing || 0,
        projections,
        dispatchedAt: new Date().toISOString(),
      };

      if (typeof apiDispatcher === 'function') {
        try {
          await apiDispatcher(`/events/${eventId}/battery-beacon`, beaconPayload);
        } catch (err) {
          console.warn('⚠️ Battery beacon dispatch warning:', err.message);
        }
      }

      return {
        status: 'IMMINENT_POWER_DEATH',
        gpsIntervalMs: THROTTLED_INTERVAL_MS,
        powerSaverActive: true,
        beaconDispatched: true,
        beaconPayload,
      };
    }

    // Case 3: Critical battery power saving (< 10%)
    if (level <= this.criticalThreshold) {
      this.isPowerSaverActive = true;
      return {
        status: 'CRITICAL_POWER_SAVER',
        gpsIntervalMs: THROTTLED_INTERVAL_MS,
        powerSaverActive: true,
      };
    }

    // Case 4: Normal battery operation
    this.isPowerSaverActive = false;
    return {
      status: 'NORMAL',
      gpsIntervalMs: NORMAL_INTERVAL_MS,
      powerSaverActive: false,
    };
  }

  resetBeacon() {
    this.imminentBeaconDispatched = false;
    this.isPowerSaverActive = false;
  }
}

module.exports = BatterySurvivalService;
