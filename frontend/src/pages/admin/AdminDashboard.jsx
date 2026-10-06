import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { apiUrl } from '../../config/api';

/**
 * Regional Administrative Metrics Dashboard (FE-08)
 * Displays regional incident health, escalation tracking, and supervisor workforce statistics.
 */
export const AdminDashboard = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState('');

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return navigate('/login');

      try {
        const idToken = await user.getIdToken();
        setToken(idToken);

        const res = await fetch(apiUrl('/admin/supervisors/approved'), {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok && res.status === 403) {
          navigate('/login');
          return;
        }

        // Fetch summary
        fetchSummary(idToken, '');
      } catch (err) {
        console.error('Admin auth check error:', err);
        navigate('/login');
      }
    });

    return () => unsub();
  }, [navigate]);

  const fetchSummary = async (authToken, region) => {
    setLoading(true);
    try {
      const url = region
        ? apiUrl(`/admin/dashboard/summary?regionId=${encodeURIComponent(region)}`)
        : apiUrl('/admin/dashboard/summary');

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken || token}` },
      });

      if (!res.ok) throw new Error('Failed to load metrics summary');
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      console.error('Error fetching admin summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegionChange = (newRegion) => {
    setSelectedRegion(newRegion);
    fetchSummary(token, newRegion);
  };

  const events = summary?.metrics?.events || {};
  const supervisors = summary?.metrics?.supervisors || {};

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f2f5', padding: '24px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ margin: '0 0 6px 0', fontSize: '1.8rem', color: '#1a237e', fontWeight: '800' }}>
              WANA Regional Administrative Console
            </h1>
            <p style={{ margin: 0, color: '#666', fontSize: '0.95rem' }}>
              Operational incident readiness & workforce governance
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <select
              value={selectedRegion}
              onChange={(e) => handleRegionChange(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem' }}
            >
              <option value="">All Regions</option>
              <option value="solapur">Solapur Jurisdiction</option>
              <option value="pune">Pune Jurisdiction</option>
            </select>

            <button
              onClick={() => navigate('/admin/approval')}
              style={{
                backgroundColor: '#1976d2',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Supervisor Governance
            </button>
            <button
              onClick={() => navigate('/admin/logs')}
              style={{
                backgroundColor: '#37474f',
                color: '#fff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '600',
              }}
            >
              Audit Trail
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#666' }}>
            Loading administrative metrics...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Metric Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', borderLeft: '4px solid #1976d2' }}>
                <span style={{ fontSize: '0.85rem', color: '#777', textTransform: 'uppercase', fontWeight: '600' }}>Active Incidents</span>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#1976d2', marginTop: '4px' }}>
                  {events.totalActive || 0}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', borderLeft: '4px solid #ef6c00' }}>
                <span style={{ fontSize: '0.85rem', color: '#777', textTransform: 'uppercase', fontWeight: '600' }}>Awaiting ACK (Dispatched)</span>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#ef6c00', marginTop: '4px' }}>
                  {events.dispatched || 0}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', borderLeft: '4px solid #c62828' }}>
                <span style={{ fontSize: '0.85rem', color: '#777', textTransform: 'uppercase', fontWeight: '600' }}>Escalated (Past SLA)</span>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#c62828', marginTop: '4px' }}>
                  {events.escalated || 0}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', borderLeft: '4px solid #f9a825' }}>
                <span style={{ fontSize: '0.85rem', color: '#777', textTransform: 'uppercase', fontWeight: '600' }}>Stale Heartbeats</span>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#f9a825', marginTop: '4px' }}>
                  {events.stale || 0}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', borderLeft: '4px solid #2e7d32' }}>
                <span style={{ fontSize: '0.85rem', color: '#777', textTransform: 'uppercase', fontWeight: '600' }}>Historical Resolved</span>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#2e7d32', marginTop: '4px' }}>
                  {events.totalResolved || 0}
                </div>
              </div>
            </div>

            {/* Workforce Summary */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '24px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
              <h2 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#1a237e' }}>
                👥 Regional Supervisor Workforce Status
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ padding: '16px', backgroundColor: '#e8f5e9', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#2e7d32', fontWeight: '600' }}>Approved & On Duty</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#1b5e20' }}>{supervisors.approved || 0}</div>
                </div>

                <div style={{ padding: '16px', backgroundColor: '#fff3e0', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#e65100', fontWeight: '600' }}>Pending Approval</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#bf360c' }}>{supervisors.pending || 0}</div>
                </div>

                <div style={{ padding: '16px', backgroundColor: '#ffebee', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#c62828', fontWeight: '600' }}>Suspended Accounts</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#b71c1c' }}>{supervisors.suspended || 0}</div>
                </div>

                <div style={{ padding: '16px', backgroundColor: '#eceff1', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.85rem', color: '#37474f', fontWeight: '600' }}>Total Registered</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: '800', color: '#263238' }}>{supervisors.total || 0}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
