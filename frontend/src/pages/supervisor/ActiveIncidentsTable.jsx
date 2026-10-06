import React, { useState } from 'react';
import { maskEmail } from '../../utils/masking';

/**
 * Real-Time Incident Table View (FE-06)
 * Filterable tabular overview of ongoing regional emergency incidents.
 */
export const ActiveIncidentsTable = ({
  alerts = [],
  acceptors = [],
  onLocate,
  onSelectEvent,
  onAcknowledge,
}) => {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Filtering
  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'STALE' && !a.stale) return false;
      if (statusFilter !== 'STALE' && a.status !== statusFilter) return false;
    }
    if (typeFilter !== 'ALL' && a.type?.toUpperCase() !== typeFilter.toUpperCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = a.id?.toLowerCase().includes(q);
      const matchEmail = a.email?.toLowerCase().includes(q);
      const matchType = a.type?.toLowerCase().includes(q);
      if (!matchId && !matchEmail && !matchType) return false;
    }
    return true;
  });

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1a237e' }}>
          🚨 Active Incidents ({filteredAlerts.length} of {alerts.length})
        </h3>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="DISPATCHED">Dispatched (Unacknowledged)</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="ESCALATED">Escalated (Past SLA)</option>
            <option value="STALE">Stale (Heartbeat Lost)</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem' }}
          >
            <option value="ALL">All Emergency Types</option>
            <option value="GENERAL">General SOS</option>
            <option value="MEDICAL">Medical Emergency</option>
            <option value="SECURITY">Police / Security</option>
            <option value="FIRE">Fire Emergency</option>
          </select>

          {/* Search Bar */}
          <input
            type="text"
            placeholder="Search ID, type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.85rem', width: '180px' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #e0e0e0', color: '#555' }}>
              <th style={{ padding: '10px' }}>ID / Type</th>
              <th style={{ padding: '10px' }}>Status</th>
              <th style={{ padding: '10px' }}>Citizen (Masked)</th>
              <th style={{ padding: '10px' }}>Coordinates</th>
              <th style={{ padding: '10px' }}>Responders</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: '#999' }}>
                  No active incidents match the current filters.
                </td>
              </tr>
            ) : (
              filteredAlerts.map((a) => {
                const eventAcceptors = acceptors.filter((acc) => acc.eventId === a.id);
                const isDispatched = a.status === 'DISPATCHED';
                const isEscalated = a.status === 'ESCALATED';

                return (
                  <tr
                    key={a.id}
                    style={{
                      borderBottom: '1px solid #eee',
                      backgroundColor: isEscalated ? '#fff9f9' : '#ffffff',
                    }}
                  >
                    <td style={{ padding: '10px' }}>
                      <div style={{ fontWeight: '700', color: isEscalated ? '#c62828' : '#222' }}>
                        {a.type || 'EMERGENCY'}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#777' }}>
                        {a.id.substring(0, 10)}...
                      </div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '10px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          backgroundColor: isEscalated ? '#ffebee' : isDispatched ? '#fff3e0' : '#e8f5e9',
                          color: isEscalated ? '#c62828' : isDispatched ? '#e65100' : '#2e7d32',
                        }}
                      >
                        {a.status || 'ACTIVE'}
                      </span>
                      {a.stale && (
                        <div style={{ fontSize: '0.75rem', color: '#f57f17', fontWeight: 'bold', marginTop: '2px' }}>
                          ⚠️ Stale Heartbeat
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>{maskEmail(a.email)}</td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {a.lat && a.lng ? `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}` : 'N/A'}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {eventAcceptors.length > 0 ? (
                        <span style={{ color: '#2e7d32', fontWeight: '600' }}>
                          ✓ {eventAcceptors.length} Responder{eventAcceptors.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#999', fontStyle: 'italic' }}>Pending units</span>
                      )}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        {isDispatched && (
                          <button
                            onClick={() => onAcknowledge(a.id)}
                            style={{
                              backgroundColor: '#2e7d32',
                              color: '#fff',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: '600',
                            }}
                          >
                            ACK
                          </button>
                        )}
                        <button
                          onClick={() => onLocate(a.lat, a.lng)}
                          style={{
                            backgroundColor: '#1976d2',
                            color: '#fff',
                            border: 'none',
                            padding: '5px 10px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                          }}
                        >
                          Locate
                        </button>
                        <button
                          onClick={() => onSelectEvent(a)}
                          style={{
                            backgroundColor: '#424242',
                            color: '#fff',
                            border: 'none',
                            padding: '5px 10px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                          }}
                        >
                          Inspect ➔
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ActiveIncidentsTable;
