import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';
import { maskEmail } from '../../utils/masking';

/**
 * Regional Incident Historical Archive (FE-07)
 * Paginated historical log of resolved emergency incidents scoped to supervisor region.
 */
export const PastIncidentsTable = ({ supervisor, token, onSelectPastEvent }) => {
  const [pastEvents, setPastEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const fetchPastEvents = async (targetPage = 1) => {
    if (!token || !supervisor) return;
    setLoading(true);
    try {
      const regionParam = supervisor.regionId || supervisor.region || '';
      const res = await fetch(
        apiUrl(`/events/past?regionId=${encodeURIComponent(regionParam)}&page=${targetPage}&limit=25`),
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) throw new Error('Failed to fetch past events');
      const data = await res.json();

      setPastEvents(data.data || []);
      setPage(data.page || 1);
      setTotalPages(data.totalPages || 1);
      setTotalRecords(data.total || 0);
    } catch (err) {
      console.error('Error fetching past incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPastEvents(page);
  }, [supervisor, token, page]);

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#37474f' }}>
          📜 Historical Incident Archive ({totalRecords} Total Resolved)
        </h3>
        <button
          onClick={() => fetchPastEvents(page)}
          style={{
            background: '#eceff1',
            border: 'none',
            padding: '5px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#666' }}>
          Loading historical incident records...
        </div>
      ) : pastEvents.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#999', fontStyle: 'italic' }}>
          No archived incidents found for region {supervisor.region}.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #e0e0e0', color: '#555' }}>
                  <th style={{ padding: '10px' }}>ID / Type</th>
                  <th style={{ padding: '10px' }}>Resolution</th>
                  <th style={{ padding: '10px' }}>Citizen (Masked)</th>
                  <th style={{ padding: '10px' }}>Resolved At</th>
                  <th style={{ padding: '10px' }}>Resolution Notes</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pastEvents.map((event) => {
                  const resolvedDate = event.resolved_at?.seconds
                    ? new Date(event.resolved_at.seconds * 1000).toLocaleString()
                    : event.archivedAtIso
                    ? new Date(event.archivedAtIso).toLocaleString()
                    : 'N/A';

                  return (
                    <tr key={event.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>
                        <div style={{ fontWeight: '600' }}>{event.type || 'EMERGENCY'}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#888' }}>
                          {event.id.substring(0, 10)}...
                        </div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '10px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            backgroundColor: '#e8f5e9',
                            color: '#2e7d32',
                          }}
                        >
                          {event.resolutionType || 'RESOLVED'}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        {maskEmail(event.sos_clicked_by_email || event.email)}
                      </td>
                      <td style={{ padding: '10px', fontSize: '0.82rem', color: '#555' }}>
                        {resolvedDate}
                      </td>
                      <td style={{ padding: '10px', fontSize: '0.82rem', color: '#444', maxWidth: '240px' }}>
                        {event.resolved_reason || event.resolutionNotes || 'No notes entered'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>
                        <button
                          onClick={() => onSelectPastEvent && onSelectPastEvent(event)}
                          style={{
                            backgroundColor: '#eceff1',
                            color: '#37474f',
                            border: 'none',
                            padding: '5px 10px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.78rem',
                          }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <span style={{ fontSize: '0.85rem', color: '#666' }}>
              Page {page} of {totalPages} ({totalRecords} records)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{
                  padding: '5px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  background: page <= 1 ? '#f5f5f5' : '#ffffff',
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                ◀ Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={{
                  padding: '5px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  background: page >= totalPages ? '#f5f5f5' : '#ffffff',
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next ▶
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PastIncidentsTable;
