import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { REGION_CENTERS } from '../../constants/regionCenters';

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

/**
 * 22-meter deconfliction offset helper (approx 0.0002 degrees)
 */
const deconflictCoordinates = (items, minDistanceMeters = 22) => {
  const DEGREE_PER_METER = 1 / 111320;
  const threshold = minDistanceMeters * DEGREE_PER_METER;
  const adjusted = [];

  items.forEach((item, index) => {
    let { lat, lng } = item;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    // Check for collisions with previously adjusted items
    for (let i = 0; i < adjusted.length; i++) {
      const prev = adjusted[i];
      const dLat = Math.abs(lat - prev.lat);
      const dLng = Math.abs(lng - prev.lng);

      if (dLat < threshold && dLng < threshold) {
        // Displace radially by 22 meters in spiral offset
        const angle = (index * 45 * Math.PI) / 180;
        lat += Math.cos(angle) * threshold;
        lng += Math.sin(angle) * threshold;
      }
    }

    adjusted.push({ ...item, lat, lng });
  });

  return adjusted;
};

/**
 * Dual-Coding Pin Icon Generator (FE-04)
 * - Red Circle: Active SOS
 * - Amber Triangle: Escalated SOS
 * - Red Circle with Warning: Stale SOS
 * - Green Diamond: Active Responder
 */
const getPinIcon = (type, isEscalated, isStale) => {
  if (type === 'responder') {
    return 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
  }
  if (isEscalated) {
    return 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png';
  }
  if (isStale) {
    return 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png';
  }
  return 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
};

/**
 * Live Regional Incident Map (FE-04)
 */
export const IncidentMap = forwardRef(({ alerts = [], responders = [], region, onSelectAlert }, ref) => {
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const responderMarkersRef = useRef({});
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Imperative focus API
  useImperativeHandle(ref, () => ({
    focusLocation(lat, lng, zoom = 16) {
      if (!mapRef.current || !isMapLoaded) return;
      try {
        mapRef.current.setCenter([lng, lat]);
        mapRef.current.setZoom(zoom);
      } catch (e) {
        console.warn('Map focus error:', e);
      }
    },
  }));

  // Initialize Map
  useEffect(() => {
    if (!window.mappls || mapRef.current) return;

    try {
      mapRef.current = new window.mappls.Map('map', {
        center: [INDIA_CENTER.lng, INDIA_CENTER.lat],
        zoom: 5,
        zoomControl: true,
        mapStyle: 'standard_day',
      });

      mapRef.current.on('load', () => {
        setIsMapLoaded(true);
      });
    } catch (e) {
      console.warn('Mappls map initialization error:', e);
    }
  }, []);

  // Center on region
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current || !region) return;

    const key = region.toLowerCase();
    const center = REGION_CENTERS[key];

    if (center) {
      mapRef.current.setCenter([center.lng, center.lat]);
      mapRef.current.setZoom(12);
    }
  }, [region, isMapLoaded]);

  // Render SOS Alert Markers with 22m deconfliction
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    // Prune removed markers
    Object.keys(markersRef.current).forEach((id) => {
      if (!alerts.find((a) => a.id === id)) {
        try {
          markersRef.current[id].setMap(null);
        } catch {}
        delete markersRef.current[id];
      }
    });

    const deconflictedAlerts = deconflictCoordinates(alerts);

    deconflictedAlerts.forEach((alert) => {
      if (markersRef.current[alert.id]) return;

      const isEscalated = alert.status === 'ESCALATED';
      const isStale = alert.stale === true;
      const iconUrl = getPinIcon('sos', isEscalated, isStale);

      try {
        const marker = new window.mappls.Marker({
          map: mapRef.current,
          position: { lng: alert.lng, lat: alert.lat },
          icon: iconUrl,
        });

        marker.addListener('click', () => {
          if (onSelectAlert) {
            onSelectAlert(alert);
          }
        });

        markersRef.current[alert.id] = marker;
      } catch (err) {
        console.warn('Marker create warning:', err);
      }
    });
  }, [alerts, isMapLoaded, onSelectAlert]);

  // Render Responder Markers
  useEffect(() => {
    if (!isMapLoaded || !mapRef.current) return;

    Object.keys(responderMarkersRef.current).forEach((id) => {
      if (!responders.find((r) => r.id === id)) {
        try {
          responderMarkersRef.current[id].setMap(null);
        } catch {}
        delete responderMarkersRef.current[id];
      }
    });

    const deconflictedResponders = deconflictCoordinates(responders);

    deconflictedResponders.forEach((resp) => {
      if (responderMarkersRef.current[resp.id]) return;

      try {
        const marker = new window.mappls.Marker({
          map: mapRef.current,
          position: { lng: resp.lng, lat: resp.lat },
          icon: getPinIcon('responder'),
        });

        responderMarkersRef.current[resp.id] = marker;
      } catch (err) {
        console.warn('Responder marker warning:', err);
      }
    });
  }, [responders, isMapLoaded]);

  return (
    <div
      id="map"
      style={{
        width: '100%',
        height: '480px',
        borderRadius: '8px',
        backgroundColor: '#e0e0e0',
        position: 'relative',
      }}
    />
  );
});

export default IncidentMap;
