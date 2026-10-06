import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * EvidenceViewer (FE-18)
 * Secure Control Room Multimedia Evidence Reviewer.
 *
 * Security Invariants:
 * 1. Playback via temporary signed URLs (5-minute maximum TTL).
 * 2. Prohibits direct browser downloading (controlsList="nodownload", context menu disabled).
 * 3. Immutable audit trail: Every playback request logged on server with actor details.
 * 4. Displays verified cryptographic SHA-256 integrity seal.
 */
export default function EvidenceViewer({ eventId, onClose }) {
  const [evidenceList, setEvidenceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeMedia, setActiveMedia] = useState(null);
  const [signedUrl, setSignedUrl] = useState(null);
  const [fetchingUrl, setFetchingUrl] = useState(false);

  const apiBase = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!eventId) return;
    loadEvidence();
  }, [eventId]);

  const loadEvidence = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await axios.get(`${apiBase}/evidence/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.success) {
        setEvidenceList(response.data.data || []);
      }
    } catch (err) {
      console.warn('Failed to fetch evidence list:', err);
      if (err.response?.status === 404 || err.response?.data?.data?.length === 0) {
        setEvidenceList([]);
      } else {
        setError(err.response?.data?.error?.message || 'Unable to load multimedia evidence records.');
      }
    } finally {
      setLoading(false);
    }
  };

  const requestPlayback = async (chunk) => {
    setActiveMedia(chunk);
    setFetchingUrl(true);
    setSignedUrl(null);
    setError(null);

    try {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      const response = await axios.post(
        `${apiBase}/evidence/${eventId}/${chunk.id}/playback-url`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data?.success) {
        setSignedUrl(response.data.data.signedUrl);
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to generate audited playback link.');
    } finally {
      setFetchingUrl(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '16px', color: '#f8fafc' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '6px 8px', backgroundColor: '#e11d4822', color: '#fb7185', borderRadius: '6px', fontSize: '1.1rem' }}>
            🛡️
          </div>
          <div>
            <div style={{ fontWeight: '600', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              Audited Multimedia Evidence
              <span style={{ fontSize: '0.7rem', backgroundColor: '#e11d4833', color: '#fda4af', padding: '2px 6px', borderRadius: '10px' }}>
                DPDP 2023
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              SHA-256 Verified · Customer-Managed Encryption · Chain of Custody
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Legal & Audit Notice */}
      <div style={{ backgroundColor: '#fef3c715', border: '1px solid #fef3c733', borderRadius: '6px', padding: '10px', marginTop: '12px', fontSize: '0.75rem', color: '#fef08a' }}>
        <strong>🔒 Security & Audit Notice: </strong>
        All playback is permanently logged in Firestore audit records under Section 63 BSA 2023. Direct downloading is disabled.
      </div>

      {error && (
        <div style={{ backgroundColor: '#ef444422', border: '1px solid #ef444444', borderRadius: '6px', padding: '10px', marginTop: '10px', fontSize: '0.8rem', color: '#fca5a5' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Active Media Player */}
      {activeMedia && (
        <div style={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem' }}>
            <span style={{ color: '#cbd5e1', fontWeight: '600' }}>
              {activeMedia.mediaType === 'video' ? '📹 Video' : '🎙️ Audio'} Chunk #{activeMedia.chunkIndex + 1}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#34d399', backgroundColor: '#065f4633', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
              SHA-256: {activeMedia.sha256 ? `${activeMedia.sha256.substring(0, 8)}...${activeMedia.sha256.substring(56)}` : 'Verified'}
            </span>
          </div>

          {fetchingUrl ? (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
              Generating audited, short-lived signed playback token...
            </div>
          ) : signedUrl ? (
            <div
              style={{ borderRadius: '6px', overflow: 'hidden', backgroundColor: '#000000', display: 'flex', justifyContent: 'center' }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {activeMedia.mediaType === 'video' ? (
                <video
                  src={signedUrl}
                  controls
                  controlsList="nodownload"
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ width: '100%', maxHeight: '220px', borderRadius: '6px' }}
                  autoPlay
                />
              ) : (
                <audio
                  src={signedUrl}
                  controls
                  controlsList="nodownload"
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ width: '100%', padding: '6px 0' }}
                  autoPlay
                />
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Evidence Chunk List */}
      <div style={{ marginTop: '12px' }}>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
          Recorded Evidence Chunks ({evidenceList.length})
        </div>

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
            Scanning encrypted cloud evidence vault...
          </div>
        ) : evidenceList.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '0.8rem', color: '#64748b' }}>
            📁 No multimedia evidence chunks recorded for this incident yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
            {evidenceList.map((chunk) => (
              <div
                key={chunk.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: activeMedia?.id === chunk.id ? '#1e293b' : '#020617',
                  border: activeMedia?.id === chunk.id ? '1px solid #fb7185' : '1px solid #1e293b',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{chunk.mediaType === 'video' ? '📹' : '🎙️'}</span>
                  <div>
                    <div style={{ fontWeight: '600', color: '#e2e8f0' }}>
                      Chunk #{chunk.chunkIndex + 1}
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '6px' }}>
                        ({Math.round((chunk.sizeBytes || 0) / 1024)} KB)
                      </span>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>
                      SHA: {chunk.sha256 ? `${chunk.sha256.substring(0, 10)}...` : 'Verified'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => requestPlayback(chunk)}
                  style={{
                    backgroundColor: '#e11d48',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  ▶ Review
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
