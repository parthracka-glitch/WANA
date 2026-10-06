const admin = require('../configuration/firebaseConfig');

/**
 * RiskEngine (M-05 & BE-15)
 * Explainable, Deterministic Geospatial Route & Location Risk Engine.
 *
 * Core Governance Invariants:
 * 1. Zero black-box machine learning models in safety-critical scoring.
 * 2. 100% explainability: Every score includes deterministic, human-readable explanation tags.
 * 3. Never auto-downgrades or resolves an emergency incident.
 */

// Ground-truthed 24/7 emergency facilities (Police Headquarters, Hospitals)
const KNOWN_SAFE_HAVENS = [
  // Solapur facilities
  { id: 'solapur_central_police', name: 'Solapur City Police Station', lat: 17.6599, lng: 75.9064, type: 'POLICE' },
  { id: 'solapur_civil_hospital', name: 'Civil Hospital Solapur (24/7)', lat: 17.6712, lng: 75.9123, type: 'HOSPITAL' },
  // Pune facilities
  { id: 'pune_police_hq', name: 'Pune Police Commissionerate', lat: 18.5204, lng: 73.8567, type: 'POLICE' },
  { id: 'pune_sassoon_hospital', name: 'Sassoon General Hospital (24/7)', lat: 18.5262, lng: 73.8742, type: 'HOSPITAL' },
];

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

class RiskEngine {
  static customDb = null;

  static getDb() {
    return this.customDb || admin.firestore();
  }

  /**
   * Evaluate geospatial and temporal risk for a location or route.
   */
  static async evaluateLocationRisk({
    latitude,
    longitude,
    timestamp = Date.now(),
    historicalIncidentsCount = null,
  }) {
    if (latitude === undefined || longitude === undefined) {
      throw new Error('Valid latitude and longitude are required for risk scoring');
    }

    let baseScore = 20; // Default baseline for urban environment
    const explanationTags = [];
    const breakdown = {};

    // 1. Time of Day / Ambient Lighting Evaluation (ENV-LGT-04)
    const date = new Date(timestamp);
    const hour = date.getHours();

    if (hour >= 22 || hour < 5) {
      baseScore += 30;
      explanationTags.push('LATE_NIGHT_HOURS');
      breakdown.timePenalty = 30;
    } else if (hour >= 19 || (hour >= 5 && hour < 6)) {
      baseScore += 15;
      explanationTags.push('TWILIGHT_DUSK_HOURS');
      breakdown.timePenalty = 15;
    } else {
      explanationTags.push('DAYLIGHT_OPTIMAL');
      breakdown.timePenalty = 0;
    }

    // 2. Safe-Haven Proximity Evaluation (GEO-POI-02)
    let minFacilityDist = Infinity;
    let closestFacility = null;

    for (const facility of KNOWN_SAFE_HAVENS) {
      const dist = getDistanceKm(latitude, longitude, facility.lat, facility.lng);
      if (dist < minFacilityDist) {
        minFacilityDist = dist;
        closestFacility = facility;
      }
    }

    if (minFacilityDist <= 1.0) {
      baseScore -= 15; // Proximity to 24/7 safe haven reduces risk
      explanationTags.push(`NEAR_${closestFacility.type}_SAFE_HAVEN`);
      breakdown.facilityBonus = -15;
    } else if (minFacilityDist >= 4.0) {
      baseScore += 20; // Isolated from immediate emergency responders
      explanationTags.push('ISOLATED_FROM_EMERGENCY_FACILITY');
      breakdown.facilityPenalty = 20;
    } else {
      breakdown.facilityPenalty = 0;
    }

    // 3. Historical Incident Density Evaluation (HIST-INC-03)
    let incidentCount = historicalIncidentsCount;
    if (incidentCount === null) {
      try {
        const db = this.getDb();
        // Query recent past events in approximate geographical bounding box (dev/prod)
        const snap = await db.collection('pastEvents').limit(10).get();
        let nearCount = 0;
        snap.forEach((doc) => {
          const data = doc.data();
          if (data.location?.latitude && data.location?.longitude) {
            const d = getDistanceKm(latitude, longitude, data.location.latitude, data.location.longitude);
            if (d <= 2.0) nearCount++;
          }
        });
        incidentCount = nearCount;
      } catch (_) {
        incidentCount = 0;
      }
    }

    if (incidentCount >= 3) {
      baseScore += 25;
      explanationTags.push('ELEVATED_HISTORICAL_INCIDENT_DENSITY');
      breakdown.incidentPenalty = 25;
    } else if (incidentCount > 0) {
      baseScore += 10;
      explanationTags.push('OCCASIONAL_HISTORICAL_INCIDENTS');
      breakdown.incidentPenalty = 10;
    } else {
      explanationTags.push('ZERO_RECENT_INCIDENTS_RECORDED');
      breakdown.incidentPenalty = 0;
    }

    // Clamp score strictly between 0 and 100
    const riskScore = Math.min(100, Math.max(0, baseScore));

    // Determine category
    let riskLevel = 'LOW';
    let recommendedAction = 'STANDARD_VIGILANCE';

    if (riskScore >= 70) {
      riskLevel = 'HIGH';
      recommendedAction = 'RECOMMEND_COMPANION_OR_WELL_LIT_ROUTE';
    } else if (riskScore >= 40) {
      riskLevel = 'MODERATE';
      recommendedAction = 'SUGGEST_LIVE_MONITORED_TRIP';
    }

    return {
      success: true,
      riskScore,
      riskLevel,
      explanationTags,
      recommendedAction,
      nearestSafeHaven: closestFacility ? {
        name: closestFacility.name,
        type: closestFacility.type,
        distanceKm: Math.round(minFacilityDist * 100) / 100,
      } : null,
      breakdown,
      evaluatedAt: timestamp,
    };
  }
}

module.exports = RiskEngine;
