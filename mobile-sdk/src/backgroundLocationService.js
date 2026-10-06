/**
 * Background Location Service & Heartbeat Streamer (M-02)
 * Manages sticky location streaming (every 15-30s) during active emergencies.
 * Provides configuration constants for Android Foreground Service & iOS CoreLocation.
 */

const DEFAULT_CADENCE_MS = 20000; // 20 seconds

class BackgroundLocationService {
  constructor({
    apiBaseUrl = 'https://api.wana.app',
    heartbeatIntervalMs = DEFAULT_CADENCE_MS,
    onHeartbeatSuccess = () => {},
    onHeartbeatError = () => {},
  } = {}) {
    this.apiBaseUrl = apiBaseUrl;
    this.intervalMs = heartbeatIntervalMs;
    this.onHeartbeatSuccess = onHeartbeatSuccess;
    this.onHeartbeatError = onHeartbeatError;

    this.timer = null;
    this.activeEventId = null;
    this.isTracking = false;
  }

  /**
   * Android Foreground Service Notification Spec
   */
  static getAndroidForegroundServiceConfig() {
    return {
      notificationTitle: 'WANA Emergency Protection Active',
      notificationText: 'Live GPS location is streaming to the regional emergency control room.',
      notificationIcon: 'ic_emergency_shield',
      channelId: 'wana_emergency_channel',
      channelName: 'Emergency Live Dispatch',
      foregroundServiceType: 'location',
      stickyFlag: 'START_STICKY',
    };
  }

  /**
   * iOS CoreLocation Manager Background Configuration Spec
   */
  static getIosCoreLocationConfig() {
    return {
      allowsBackgroundLocationUpdates: true,
      pausesLocationUpdatesAutomatically: false,
      desiredAccuracy: 'kCLLocationAccuracyBestForNavigation',
      distanceFilter: 5, // 5 meters
      activityType: 'kCLActivityTypeAutomotiveNavigation',
    };
  }

  /**
   * Starts periodic background heartbeat streaming for an active event
   */
  startStreaming({ eventId, locationProvider, authToken = null }) {
    if (!eventId) throw new Error('eventId is required to start location heartbeat streaming.');
    if (typeof locationProvider !== 'function') {
      throw new Error('locationProvider function is required to sample device GPS coordinates.');
    }

    this.activeEventId = eventId;
    this.isTracking = true;

    // Send immediate first heartbeat
    this.sendSingleHeartbeat(eventId, locationProvider, authToken);

    // Schedule recurring cadence
    this.timer = setInterval(async () => {
      if (!this.isTracking) return;
      await this.sendSingleHeartbeat(eventId, locationProvider, authToken);
    }, this.intervalMs);

    console.log(`📍 Started background location heartbeat for event ${eventId} (Cadence: ${this.intervalMs / 1000}s)`);
  }

  /**
   * Sends a single location heartbeat to the backend
   */
  async sendSingleHeartbeat(eventId, locationProvider, authToken) {
    try {
      const loc = await locationProvider();
      if (!loc || typeof loc.latitude !== 'number') return;

      const payload = {
        location: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy || 10,
          speed: loc.speed || null,
          heading: loc.heading || null,
        },
        batteryLevel: loc.batteryLevel || null,
      };

      const headers = { 'Content-Type': 'application/json' };
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${this.apiBaseUrl}/events/${eventId}/heartbeat`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Heartbeat failed: HTTP ${res.status}`);
      }

      const data = await res.json();
      this.onHeartbeatSuccess(data);
      return data;
    } catch (err) {
      console.warn('Heartbeat transmission warning:', err.message);
      this.onHeartbeatError(err);
    }
  }

  /**
   * Stops background heartbeat streaming
   */
  stopStreaming() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isTracking = false;
    this.activeEventId = null;
    console.log('🛑 Stopped background location heartbeat.');
  }
}

module.exports = BackgroundLocationService;
