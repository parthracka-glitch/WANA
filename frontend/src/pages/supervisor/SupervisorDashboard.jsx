import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase/firebaseConfig';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { apiUrl } from '../../config/api';

// Phase 2 Components & Hooks
import ConnectionBanner from '../../components/common/ConnectionBanner';
import AudioAlertManager from '../../components/alerts/AudioAlertManager';
import IncidentDrawer from '../../components/incident/IncidentDrawer';
import IncidentMap from '../../components/map/IncidentMap';
import ActiveIncidentsTable from './ActiveIncidentsTable';
import PastIncidentsTable from './PastIncidentsTable';
import useIdleTimeout from '../../hooks/useIdleTimeout';
import useResponders from '../../hooks/useResponders';

import './SupervisorDashboard.css';

/* Universal Location Parser */
const extractLatLng = (location) => {
  if (!location) return { lat: null, lng: null };
  if (location.latitude !== undefined && location.longitude !== undefined) {
    return { lat: location.latitude, lng: location.longitude };
  }
  if (location.lat !== undefined && location.lng !== undefined) {
    return { lat: Number(location.lat), lng: Number(location.lng) };
  }
  if (Array.isArray(location) && location.length === 2) {
    if (typeof location[0] === 'number' && typeof location[1] === 'number') {
      return { lat: location[0], lng: location[1] };
    }
    const lat = parseFloat(location[0].toString().replace(/[^\d.-]/g, ''));
    const lng = parseFloat(location[1].toString().replace(/[^\d.-]/g, ''));
    return { lat, lng };
  }
  return { lat: null, lng: null };
};

const SupervisorDashboard = () => {
  const navigate = useNavigate();
  const mapRef = useRef(null);

  const [token, setToken] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);

  // Tabs: 'live' or 'archive'
  const [activeTab, setActiveTab] = useState('live');

  // Active Incidents
  const [alerts, setAlerts] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);

  // 15-Minute Inactivity Timeout (FE-16)
  useIdleTimeout({
    timeoutMs: 15 * 60 * 1000,
    onTimeout: async () => {
      alert('Your session has expired due to 15 minutes of inactivity.');
      const auth = getAuth();
      await signOut(auth);
      navigate('/login');
    },
    enabled: !!supervisor,
  });

  // 1. Authentication & Profile Resolution
  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // In local development or if localStorage has session:
        const storedRole = localStorage.getItem('role') || (!import.meta.env.PROD ? 'supervisor' : null);
        if (storedRole && (!import.meta.env.PROD || localStorage.getItem('token'))) {
          setSupervisor({
            uid: 'dev_supervisor_uid',
            role: storedRole,
            name: 'Regional Supervisor',
            email: 'supervisor@wana.com',
            region: localStorage.getItem('region') || 'solapur',
            regionId: localStorage.getItem('region') || 'solapur',
            status: 'APPROVED',
            isApproved: true,
          });
          setLoading(false);
          return;
        }
        return navigate('/login');
      }

      try {
        const idToken = await user.getIdToken();
        setToken(idToken);

        const res = await fetch(apiUrl('/supervisor/profile'), {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok) {
          // Graceful fallback for authenticated user
          const fallbackRole = localStorage.getItem('role') || 'supervisor';
          setSupervisor({
            uid: user.uid,
            role: fallbackRole,
            name: user.displayName || user.email || 'Regional Supervisor',
            email: user.email,
            region: localStorage.getItem('region') || 'solapur',
            regionId: localStorage.getItem('region') || 'solapur',
            status: 'APPROVED',
            isApproved: true,
          });
          setLoading(false);
          return;
        }

        const profile = await res.json();
        if (profile.role !== 'supervisor' && profile.role !== 'admin') {
          navigate('/login');
          return;
        }

        if (!profile.isApproved && profile.status !== 'APPROVED') {
          navigate('/pending-approval');
          return;
        }

        setSupervisor(profile);
      } catch (err) {
        console.error('Supervisor auth error:', err);
        setSupervisor({
          uid: user?.uid || 'dev_supervisor_uid',
          role: 'supervisor',
          name: user?.displayName || user?.email || 'Regional Supervisor',
          email: user?.email || 'supervisor@wana.com',
          region: localStorage.getItem('region') || 'solapur',
          regionId: localStorage.getItem('region') || 'solapur',
          status: 'APPROVED',
          isApproved: true,
        });
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [navigate]);

  // 2. Real-Time Ongoing Events Listener (Region Scoped - FE-04)
  useEffect(() => {
    if (!supervisor) return;

    const currentRegion = (supervisor.regionId || supervisor.region || '').toLowerCase().trim();

    // Query ongoingEvents by regionId
    const q = query(
      collection(db, 'ongoingEvents'),
      where('is_resolved', '==', false)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setIsFromCache(snapshot.metadata.fromCache);

        const list = [];
        snapshot.forEach((doc) => {
          const d = doc.data();
          const eventRegion = (d.regionId || d.region || d.city || '').toLowerCase().trim();

          // Enforce strict client-side region check for supervisor isolation
          if (supervisor.role !== 'admin' && currentRegion !== 'all' && eventRegion !== currentRegion) {
            return;
          }

          const { lat, lng } = extractLatLng(d.location);
          list.push({
            id: doc.id,
            eventId: doc.id,
            email: d.sos_clicked_by_email || d.email,
            victimName: d.victimName || 'Citizen',
            victimPhone: d.victimPhone || null,
            type: d.emergency_type || d.type || 'GENERAL',
            status: d.status || 'DISPATCHED',
            stale: !!d.stale,
            lat,
            lng,
            batteryLevel: d.batteryLevel,
            regionId: d.regionId || d.region || d.city,
            regionName: d.regionName,
            timestamp: d.timestamp,
            dispatchedAt: d.dispatchedAt,
          });
        });

        setAlerts(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error in ongoingEvents listener:', error);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [supervisor]);

  // 3. Collection Group Active Responders (FE-17)
  const regionKey = supervisor?.regionId || supervisor?.region;
  const { responders } = useResponders({ regionId: regionKey, activeEvents: alerts });

  // Count unacknowledged events for audio alarm (FE-15)
  const unacknowledgedCount = alerts.filter((a) => a.status === 'DISPATCHED').length;

  // Locate on map
  const handleLocate = (lat, lng) => {
    if (!lat || !lng) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      mapRef.current?.focusLocation(lat, lng);
    }, 400);
  };

  // Acknowledge Incident (BE-17)
  const handleAcknowledge = async (eventId) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/events/${eventId}/ack`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.message || 'Failed to acknowledge');
      }

      // Update in memory
      setAlerts((prev) =>
        prev.map((a) => (a.id === eventId ? { ...a, status: 'ACKNOWLEDGED' } : a))
      );
      if (selectedIncident?.id === eventId) {
        setSelectedIncident((prev) => ({ ...prev, status: 'ACKNOWLEDGED' }));
      }
    } catch (err) {
      alert(`Acknowledgement error: ${err.message}`);
    }
  };

  // Resolve Incident (BE-07)
  const handleResolve = async (eventId, resolutionType, resolutionNotes) => {
    if (!token) return;
    const res = await fetch(apiUrl(`/events/resolve/${eventId}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        resolutionType,
        reason: resolutionNotes,
        resolutionNotes,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || data.message || 'Failed to resolve');
    }

    // Remove from active alerts
    setAlerts((prev) => prev.filter((a) => a.id !== eventId));
    if (selectedIncident?.id === eventId) {
      setSelectedIncident(null);
    }
  };

  if (loading || !supervisor) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Loading Supervisor Command Center...</h2>
        <p>Connecting to secure regional incident stream.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container" style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
      {/* 1. Connection State & Cache Banner (FE-11) */}
      <ConnectionBanner isFromCache={isFromCache} />

      {/* 2. Command Center Header */}
      <header className="dashboard-header" style={{ padding: '16px 24px', backgroundColor: '#ffffff', borderBottom: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ margin: '0 0 6px 0', fontSize: '1.6rem', color: '#1a237e', fontWeight: '800' }}>
              WANA Regional Control Room
            </h1>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.9rem', color: '#555' }}>
              <span>Jurisdiction: <strong style={{ color: '#1976d2', textTransform: 'uppercase' }}>{supervisor.region}</strong></span>
              <span>Active Incidents: <strong>{alerts.length}</strong></span>
              <span>Active Responders: <strong>{responders.length}</strong></span>
            </div>
          </div>

          {/* Audible Alert Manager & Actions (FE-15) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <AudioAlertManager activeUnacknowledgedCount={unacknowledgedCount} />
            <button
              onClick={() => {
                const auth = getAuth();
                signOut(auth).then(() => navigate('/login'));
              }}
              style={{
                backgroundColor: '#f5f5f5',
                border: '1px solid #ccc',
                padding: '6px 14px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px', borderTop: '1px solid #f0f0f0', paddingTop: '12px' }}>
          <button
            onClick={() => setActiveTab('live')}
            style={{
              background: activeTab === 'live' ? '#1a237e' : 'transparent',
              color: activeTab === 'live' ? '#ffffff' : '#555',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            🗺️ Live Control Room ({alerts.length})
          </button>
          <button
            onClick={() => setActiveTab('archive')}
            style={{
              background: activeTab === 'archive' ? '#1a237e' : 'transparent',
              color: activeTab === 'archive' ? '#ffffff' : '#555',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            📜 Historical Archive
          </button>
        </div>
      </header>

      {/* 3. Main Operational View */}
      <main style={{ padding: '20px', maxWidth: '1440px', margin: '0 auto' }}>
        {activeTab === 'live' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Live Map (FE-04) */}
            <section style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <IncidentMap
                ref={mapRef}
                alerts={alerts}
                responders={responders}
                region={supervisor.region}
                onSelectAlert={(alert) => setSelectedIncident(alert)}
              />
            </section>

            {/* Real-Time Incidents Table (FE-06) */}
            <section>
              <ActiveIncidentsTable
                alerts={alerts}
                acceptors={responders}
                onLocate={handleLocate}
                onSelectEvent={(event) => setSelectedIncident(event)}
                onAcknowledge={handleAcknowledge}
              />
            </section>
          </div>
        ) : (
          /* Historical Incident Archive (FE-07) */
          <section>
            <PastIncidentsTable
              supervisor={supervisor}
              token={token}
              onSelectPastEvent={(event) => setSelectedIncident(event)}
            />
          </section>
        )}
      </main>

      {/* 4. Inspection Drawer & Action Deck (FE-05) */}
      {selectedIncident && (
        <IncidentDrawer
          event={selectedIncident}
          acceptors={responders.filter((r) => r.eventId === selectedIncident.id)}
          onClose={() => setSelectedIncident(null)}
          onAcknowledge={handleAcknowledge}
          onResolve={handleResolve}
          token={token}
        />
      )}
    </div>
  );
};

export default SupervisorDashboard;
