import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '../../firebase/firebaseConfig';
import { doc, onSnapshot, collection, getDocs } from 'firebase/firestore';

/**
 * Citizen Live Emergency Tracking Portal (BE-08b / Phase 3)
 * Destination view for emergency contacts who received an SMS alert.
 * Shows real-time incident tracking, location, responders, and resolution status.
 */
export const LiveTracking = () => {
  const { eventId } = useParams();
  const [eventData, setEventData] = useState(null);
  const [acceptors, setAcceptors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setError('Invalid incident tracking URL: missing eventId.');
      setLoading(false);
      return;
    }

    // 1. Listen to ongoingEvents
    const ongoingRef = doc(db, 'ongoingEvents', eventId);
    const unsubOngoing = onSnapshot(
      ongoingRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          setEventData({ id: snapshot.id, ...snapshot.data() });
          setIsResolved(false);
          setLoading(false);

          // Fetch acceptors
          try {
            const accSnap = await getDocs(collection(db, 'acceptedEvents', eventId, 'acceptors'));
            const list = [];
            accSnap.forEach((d) => list.push({ id: d.id, ...d.data() }));
            setAcceptors(list);
          } catch {}
        } else {
          // If not in ongoingEvents, check pastEvents (incident resolved)
          const pastRef = doc(db, 'pastEvents', eventId);
          const unsubPast = onSnapshot(pastRef, (pastSnap) => {
            if (pastSnap.exists()) {
              setEventData({ id: pastSnap.id, ...pastSnap.data() });
              setIsResolved(true);
              setLoading(false);
            } else {
              setError(`Incident '${eventId}' not found.`);
              setLoading(false);
            }
          });
          return () => unsubPast();
        }
      },
      (err) => {
        console.error('Tracking listener error:', err);
        setError('Unable to load live incident telemetry.');
        setLoading(false);
      }
    );

    return () => unsubOngoing();
  }, [eventId]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <h2>Connecting to WANA Live Emergency Tracking...</h2>
        <p>Receiving secure telemetry stream.</p>
      </div>
    );
  }

  if (error || !eventData) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <h2 style={{ color: '#d32f2f' }}>⚠️ Tracking Error</h2>
        <p>{error || 'Incident telemetry not available.'}</p>
      </div>
    );
  }

  const loc = eventData.location || {};
  const lat = loc.latitude !== undefined ? loc.latitude : loc.lat;
  const lng = loc.longitude !== undefined ? loc.longitude : loc.lng;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5', padding: '16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {/* Banner */}
        <div
          style={{
            padding: '20px',
            backgroundColor: isResolved ? '#2e7d32' : eventData.status === 'ESCALATED' ? '#b71c1c' : '#c62828',
            color: '#ffffff',
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: '800' }}>
            {isResolved ? '✅ INCIDENT RESOLVED' : '🚨 WANA LIVE EMERGENCY TRACKING'}
          </h1>
          <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>
            {isResolved
              ? 'The individual has been confirmed safe and the emergency call is closed.'
              : 'Official live response tracking channel for registered emergency contacts.'}
          </p>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Status Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px solid #eee' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: '#777', textTransform: 'uppercase', fontWeight: '600' }}>Citizen Name</span>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#222' }}>
                {eventData.victimName || 'Citizen in Danger'}
              </div>
            </div>

            <div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '6px 14px',
                  borderRadius: '16px',
                  fontWeight: '700',
                  fontSize: '0.85rem',
                  backgroundColor: isResolved ? '#e8f5e9' : '#ffebee',
                  color: isResolved ? '#2e7d32' : '#c62828',
                }}
              >
                {isResolved ? eventData.resolutionType || 'SAFE' : eventData.status || 'ACTIVE'}
              </span>
            </div>
          </div>

          {/* Location & GPS Info */}
          <div style={{ padding: '16px', backgroundColor: '#f9fbe7', borderRadius: '8px', border: '1px solid #e6ee9c' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#33691e' }}>
              📍 Live GPS Location Coordinates
            </h3>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1b5e20', fontFamily: 'monospace' }}>
              {lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Coordinates processing...'}
            </div>
            {lat && lng && (
              <div style={{ marginTop: '12px' }}>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    backgroundColor: '#1976d2',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontWeight: '600',
                    fontSize: '0.85rem',
                  }}
                >
                  🗺️ Open in Google Maps
                </a>
              </div>
            )}
          </div>

          {/* Telemetry Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div style={{ padding: '12px', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #eee' }}>
              <span style={{ fontSize: '0.75rem', color: '#777', textTransform: 'uppercase' }}>Jurisdiction</span>
              <div style={{ fontWeight: '700', color: '#333' }}>{eventData.regionName || eventData.regionId || 'En Route'}</div>
            </div>

            <div style={{ padding: '12px', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #eee' }}>
              <span style={{ fontSize: '0.75rem', color: '#777', textTransform: 'uppercase' }}>Battery Level</span>
              <div style={{ fontWeight: '700', color: '#333' }}>
                {eventData.batteryLevel !== undefined && eventData.batteryLevel !== null ? `${eventData.batteryLevel}%` : 'N/A'}
              </div>
            </div>

            <div style={{ padding: '12px', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #eee' }}>
              <span style={{ fontSize: '0.75rem', color: '#777', textTransform: 'uppercase' }}>Emergency Type</span>
              <div style={{ fontWeight: '700', color: '#c62828' }}>{eventData.type || 'GENERAL'}</div>
            </div>
          </div>

          {/* Active Responders Status */}
          <div style={{ padding: '16px', backgroundColor: '#e3f2fd', borderRadius: '8px', border: '1px solid #bbdefb' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', color: '#0d47a1' }}>
              👥 Responding Units ({acceptors.length})
            </h3>
            {acceptors.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#555', fontStyle: 'italic' }}>
                Control room has alerted regional supervisors and nearest community safety volunteers.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                {acceptors.map((acc) => (
                  <div key={acc.id} style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1565c0' }}>
                    ✓ Volunteer / Unit responding ({acc.status || 'En Route'})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Emergency Assistance Callouts */}
          <div style={{ textAlign: 'center', paddingTop: '10px', borderTop: '1px solid #eee' }}>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 8px 0' }}>
              If you have urgent information for the control room regarding this incident:
            </p>
            <a
              href="tel:112"
              style={{
                display: 'inline-block',
                backgroundColor: '#d32f2f',
                color: '#ffffff',
                padding: '10px 20px',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: '700',
              }}
            >
              📞 Call National Emergency (112)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveTracking;
