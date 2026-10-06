/**
 * WANA Pilot Region Configuration (Phase 7 / Milestone M7)
 *
 * Defines operational boundaries, municipal responder configurations, and
 * safety SLAs for initial single-region field rollout (Solapur & Pune).
 */

const PILOT_REGIONS = {
  solapur_central: {
    regionId: 'solapur_central',
    name: 'Solapur Municipal Corporation Pilot Zone',
    state: 'Maharashtra',
    country: 'India',
    status: 'ACTIVE_PILOT',
    center: {
      latitude: 17.6599,
      longitude: 75.9064,
    },
    boundaries: {
      minLat: 17.55,
      maxLat: 17.78,
      minLng: 75.8,
      maxLng: 76.02,
    },
    emergencyHelplines: {
      police: '112',
      womenHelpline: '1091',
      ambulance: '108',
      controlRoomLandline: '+91-217-2744600',
    },
    slas: {
      ackTargetSeconds: 60,
      p95DispatchLatencyBudgetMs: 3500,
      falseAlarmCancelWindowSeconds: 10,
      staleHeartbeatSeconds: 300,
    },
    pilotParams: {
      maxSupervisorsOnDuty: 12,
      minSupervisorsOnDuty: 2,
      shadowModeAiActive: true,
      cmekStorageBucket: 'gs://wana-pilot-solapur-evidence',
    },
  },
  pune_municipal: {
    regionId: 'pune_municipal',
    name: 'Pune Municipal Corporation Pilot Zone',
    state: 'Maharashtra',
    country: 'India',
    status: 'STANDBY_PILOT',
    center: {
      latitude: 18.5204,
      longitude: 73.8567,
    },
    boundaries: {
      minLat: 18.4,
      maxLat: 18.65,
      minLng: 73.75,
      maxLng: 73.98,
    },
    emergencyHelplines: {
      police: '112',
      womenHelpline: '1091',
      ambulance: '108',
      controlRoomLandline: '+91-20-26123344',
    },
    slas: {
      ackTargetSeconds: 60,
      p95DispatchLatencyBudgetMs: 3500,
      falseAlarmCancelWindowSeconds: 10,
      staleHeartbeatSeconds: 300,
    },
    pilotParams: {
      maxSupervisorsOnDuty: 24,
      minSupervisorsOnDuty: 4,
      shadowModeAiActive: true,
      cmekStorageBucket: 'gs://wana-pilot-pune-evidence',
    },
  },
};

/**
 * Validate whether a coordinate falls strictly within the active pilot boundary.
 */
function isCoordinateInPilotRegion(latitude, longitude, regionId = 'solapur_central') {
  const region = PILOT_REGIONS[regionId];
  if (!region) return false;

  const { minLat, maxLat, minLng, maxLng } = region.boundaries;
  return (
    latitude >= minLat &&
    latitude <= maxLat &&
    longitude >= minLng &&
    longitude <= maxLng
  );
}

module.exports = {
  PILOT_REGIONS,
  isCoordinateInPilotRegion,
};
