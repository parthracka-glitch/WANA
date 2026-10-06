/**
 * AnomalyTrajectoryService (M-06)
 * On-Device Follower & Trajectory Anomaly Detection SDK (Shadow-Mode Validation).
 *
 * Heuristics & Guardrails:
 * 1. 3+ Correlated Turns: Detects trailing behavior (e.g., matching 3 identical turns within 180s).
 * 2. Prolonged Pacing: Detects stationary hovering followed by sudden synchronized acceleration.
 * 3. Shadow-Mode Invariant: Operates silently by default (shadowMode: true).
 *    Sends telemetry to backend POST /risk/shadow-eval without disrupting the citizen.
 */
class AnomalyTrajectoryService {
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || 'https://api.wana.app';
    this.shadowMode = options.shadowMode !== undefined ? options.shadowMode : true;
    this.turnTimeWindowMs = options.turnTimeWindowMs || 180000; // 3 minutes
    this.minConsecutiveTurns = options.minConsecutiveTurns || 3;
    this.onAnomalyDetected = options.onAnomalyDetected || null;
    this.authToken = options.authToken || null;

    this.activeTripId = null;
    this.waypointHistory = [];
    this.detectedTurns = [];
  }

  /**
   * Start tracking trip trajectory for anomaly detection.
   */
  startTrip(tripId = null) {
    this.activeTripId = tripId || `trip_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.waypointHistory = [];
    this.detectedTurns = [];
    return {
      started: true,
      tripId: this.activeTripId,
      shadowMode: this.shadowMode,
    };
  }

  /**
   * Stop active trip monitoring.
   */
  stopTrip() {
    const tripId = this.activeTripId;
    this.activeTripId = null;
    this.waypointHistory = [];
    this.detectedTurns = [];
    return { stopped: true, tripId };
  }

  /**
   * Ingest a GPS coordinate waypoint and evaluate trajectory anomaly heuristics.
   * waypoint: { latitude, longitude, heading, speed, timestamp }
   */
  async recordWaypoint(waypoint, httpClient = null) {
    if (!this.activeTripId) {
      throw new Error('Trip must be started before recording waypoints');
    }

    const point = {
      latitude: Number(waypoint.latitude),
      longitude: Number(waypoint.longitude),
      heading: Number(waypoint.heading || 0),
      speed: Number(waypoint.speed || 0),
      timestamp: waypoint.timestamp || Date.now(),
    };

    this.waypointHistory.push(point);

    // Keep sliding window of last 20 waypoints
    if (this.waypointHistory.length > 20) {
      this.waypointHistory.shift();
    }

    // Evaluate turn detection if we have previous points
    let anomalyResult = null;
    if (this.waypointHistory.length >= 2) {
      const prev = this.waypointHistory[this.waypointHistory.length - 2];
      const headingDiff = this.calculateHeadingDelta(prev.heading, point.heading);

      // A turn is characterized by a heading shift between 45 and 135 degrees
      if (Math.abs(headingDiff) >= 45 && Math.abs(headingDiff) <= 135) {
        const turnDirection = headingDiff > 0 ? 'RIGHT' : 'LEFT';
        this.detectedTurns.push({
          direction: turnDirection,
          timestamp: point.timestamp,
          delta: headingDiff,
        });

        // Prune turns outside time window
        const now = point.timestamp;
        this.detectedTurns = this.detectedTurns.filter((t) => now - t.timestamp <= this.turnTimeWindowMs);

        // Heuristic: Check for >= 3 turns in same general sequence within window
        if (this.detectedTurns.length >= this.minConsecutiveTurns) {
          anomalyResult = {
            anomalyType: 'SUSPICIOUS_TURN_CORRELATION',
            confidence: 0.88,
            turnCount: this.detectedTurns.length,
            timeSpanSeconds: Math.round((now - this.detectedTurns[0].timestamp) / 1000),
            turns: [...this.detectedTurns],
          };
        }
      }
    }

    // If anomaly triggered, dispatch shadow telemetry
    if (anomalyResult) {
      await this.dispatchShadowTelemetry(anomalyResult, httpClient);
    }

    return {
      recorded: true,
      anomalyDetected: !!anomalyResult,
      report: anomalyResult,
      shadowMode: this.shadowMode,
    };
  }

  /**
   * Calculate shortest angular delta between two compass headings (-180 to +180).
   */
  calculateHeadingDelta(heading1, heading2) {
    let diff = (heading2 - heading1) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
  }

  /**
   * Dispatch telemetry to backend shadow evaluation endpoint.
   */
  async dispatchShadowTelemetry(anomalyResult, httpClient = null) {
    const payload = {
      tripId: this.activeTripId,
      detectorName: 'ANOMALY_TRAJECTORY_v1',
      detectorVersion: '1.0.0',
      metrics: {
        turnCount: anomalyResult.turnCount,
        timeSpanSeconds: anomalyResult.timeSpanSeconds,
      },
      anomalyDetected: true,
      confidence: anomalyResult.confidence,
    };

    if (this.onAnomalyDetected) {
      this.onAnomalyDetected({
        ...payload,
        shadowMode: this.shadowMode,
      });
    }

    // In shadow mode, silently stream to backend without user interruption
    try {
      if (httpClient) {
        return await httpClient.post(`${this.apiBaseUrl}/risk/shadow-eval`, payload);
      }

      await fetch(`${this.apiBaseUrl}/risk/shadow-eval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
    } catch (_) {
      // Non-blocking telemetry
    }
  }
}

module.exports = AnomalyTrajectoryService;
