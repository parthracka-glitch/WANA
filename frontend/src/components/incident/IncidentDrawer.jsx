import React, { useState, useEffect } from 'react';
import { maskEmail, maskPhone, maskName } from '../../utils/masking';
import { apiUrl } from '../../config/api';
import EvidenceViewer from './EvidenceViewer';
import RiskAssessmentBadge from './RiskAssessmentBadge';

/**
 * Incident Inspection Drawer & Action Deck (FE-05)
 * Shows real-time incident telemetry, responder roster, PII unmasking with audit logging,
 * single-click ACK, and structured resolution modal.
 */
export const IncidentDrawer = ({
  event,
  acceptors = [],
  onClose,
  onAcknowledge,
  onResolve,
  token,
}) => {
  const [revealedPii, setRevealedPii] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionType, setResolutionType] = useState('SUPERVISOR_CLOSED');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('');
  const [showEvidence, setShowEvidence] = useState(false);

  // Calculate elapsed time from event timestamp
  useEffect(() => {
    if (!event) return;

    const updateElapsed = () => {
      let createdMs = Date.now();
      if (event.timestamp?.toMillis) {
        createdMs = event.timestamp.toMillis();
      } else if (event.timestamp?.seconds) {
        createdMs = event.timestamp.seconds * 1000;
      } else if (event.dispatchedAt?.toMillis) {
        createdMs = event.dispatchedAt.toMillis();
      }

      const diffSec = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
      const mins = Math.floor(diffSec / 60);
      const secs = diffSec % 60;
      setElapsedTime(`${mins}m ${secs < 10 ? '0' : ''}${secs}s ago`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [event]);

  if (!event) return null;

  // Handle Reveal Details (Audited action)
  const handleRevealDetails = async () => {
    setRevealedPii(true);
    try {
      if (token) {
        await fetch(apiUrl('/logs/evidence-view'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            eventId: event.id,
            action: 'PII_REVEALED',
            details: { target: event.id, regionId: event.regionId },
          }),
        }).catch(() => {});
      }
    } catch {
      // Non-blocking audit record
    }
  };

  const handleExecuteResolve = async () => {
    if (!resolutionNotes.trim()) {
      alert('Mandatory operator notes are required before resolving.');
      return;
    }
    setSubmitting(true);
    try {
      await onResolve(event.id, resolutionType, resolutionNotes);
      setShowResolveModal(false);
      onClose();
    } catch (err) {
      alert(`Resolution failed: ${err.message}`);
    } finally {
      setSubmitting(false);
      setConfirmStep(false);
    }
  };

  const isDispatched = event.status === 'DISPATCHED';
  const isEscalated = event.status === 'ESCALATED';
  const isStale = event.stale === true;

  return (
    <>
      <div
        className="incident-drawer-overlay"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '420px',
          maxWidth: '90vw',
          backgroundColor: '#ffffff',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
          zIndex: 9998,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          animation: 'slideInRight 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: isEscalated ? '#b71c1c' : '#1a237e',
            color: '#ffffff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700' }}>
              🚨 {event.type || 'EMERGENCY SOS'}
            </h3>
            <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
              ID: {event.id?.substring(0, 12)}...
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '1.4rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Status Indicators */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 20px',
            backgroundColor: '#f5f5f5',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: '700',
              backgroundColor: isEscalated ? '#ffebee' : isDispatched ? '#fff3e0' : '#e8f5e9',
              color: isEscalated ? '#c62828' : isDispatched ? '#e65100' : '#2e7d32',
              border: `1px solid ${isEscalated ? '#ef5350' : isDispatched ? '#ffb74d' : '#81c784'}`,
            }}
          >
            {event.status || 'ACTIVE'}
          </span>

          {isStale && (
            <span
              style={{
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: '700',
                backgroundColor: '#fffde7',
                color: '#f57f17',
                border: '1px solid #fbc02d',
              }}
            >
              ⚠️ STALE HEARTBEAT
            </span>
          )}

          <span style={{ fontSize: '0.8rem', color: '#666', marginLeft: 'auto', alignSelf: 'center' }}>
            ⏱️ {elapsedTime}
          </span>
        </div>

        {/* Telemetry Body */}
        <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Coordinates & Location */}
          <div style={{ padding: '12px', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #eee' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#777', textTransform: 'uppercase' }}>
              Geospatial Telemetry
            </h4>
            <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>
              📍 {event.lat ? `${event.lat.toFixed(5)}, ${event.lng.toFixed(5)}` : 'Location unavailable'}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
              Jurisdiction: <strong>{event.regionName || event.regionId || 'N/A'}</strong>
              {event.batteryLevel !== undefined && event.batteryLevel !== null && (
                <span style={{ marginLeft: '12px' }}>🔋 Battery: {event.batteryLevel}%</span>
              )}
            </div>

            {/* Explainable Geospatial Risk Badge (M-05 & BE-15) */}
            {event.lat && event.lng && (
              <RiskAssessmentBadge
                location={{ latitude: event.lat, longitude: event.lng }}
                timestamp={event.timestamp}
              />
            )}
          </div>

          {/* Citizen / Victim Info (Masked PII) */}
          <div style={{ padding: '12px', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#777', textTransform: 'uppercase' }}>
                Citizen Identity
              </h4>
              {!revealedPii && (
                <button
                  onClick={handleRevealDetails}
                  style={{
                    background: '#e3f2fd',
                    color: '#1565c0',
                    border: '1px solid #90caf9',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                  }}
                >
                  👁️ Reveal (Audited)
                </button>
              )}
            </div>

            <div style={{ fontSize: '0.9rem', marginBottom: '4px' }}>
              <strong>Name:</strong> {revealedPii ? event.victimName || 'Citizen' : maskName(event.victimName)}
            </div>
            <div style={{ fontSize: '0.9rem', marginBottom: '4px' }}>
              <strong>Email:</strong> {revealedPii ? event.email || 'N/A' : maskEmail(event.email)}
            </div>
            <div style={{ fontSize: '0.9rem' }}>
              <strong>Phone:</strong> {revealedPii ? event.victimPhone || 'N/A' : maskPhone(event.victimPhone)}
            </div>
          </div>

          {/* Responders / Acceptors Roster */}
          <div style={{ padding: '12px', backgroundColor: '#fafafa', borderRadius: '6px', border: '1px solid #eee' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#777', textTransform: 'uppercase' }}>
              Active Responders ({acceptors.length})
            </h4>
            {acceptors.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#999', fontStyle: 'italic' }}>
                No community volunteers or field units have accepted yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {acceptors.map((acc) => (
                  <div
                    key={acc.id}
                    style={{
                      padding: '8px',
                      backgroundColor: '#e8f5e9',
                      borderRadius: '4px',
                      border: '1px solid #c8e6c9',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ fontWeight: '600', color: '#2e7d32' }}>
                      👤 {revealedPii ? acc.name || 'Responder' : maskName(acc.name)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#555' }}>
                      {revealedPii ? acc.email : maskEmail(acc.email)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audited Evidence Review Section (FE-18 & LEGAL-01) */}
          <div style={{ marginTop: '12px' }}>
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              style={{
                width: '100%',
                padding: '10px 14px',
                backgroundColor: showEvidence ? '#0f172a' : '#f8fafc',
                color: showEvidence ? '#f8fafc' : '#1e293b',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                🎙️ Audited Multimedia Evidence
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: showEvidence ? '#334155' : '#e2e8f0',
                  color: showEvidence ? '#f8fafc' : '#334155',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                {showEvidence ? 'Hide' : 'Review Chunks'}
              </span>
            </button>

            {showEvidence && (
              <div style={{ marginTop: '10px' }}>
                <EvidenceViewer eventId={event.id} onClose={() => setShowEvidence(false)} />
              </div>
            )}
          </div>
        </div>

        {/* Action Deck Buttons */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {(isDispatched || isEscalated) && (
            <button
              onClick={() => onAcknowledge(event.id)}
              style={{
                backgroundColor: '#2e7d32',
                color: '#ffffff',
                border: 'none',
                padding: '12px',
                borderRadius: '6px',
                fontWeight: '700',
                fontSize: '1rem',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              ✅ Acknowledge Incident
            </button>
          )}

          <button
            onClick={() => {
              setConfirmStep(false);
              setShowResolveModal(true);
            }}
            style={{
              backgroundColor: '#d32f2f',
              color: '#ffffff',
              border: 'none',
              padding: '12px',
              borderRadius: '6px',
              fontWeight: '700',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            🔒 Resolve & Close Incident
          </button>
        </div>
      </div>

      {/* Structured Resolution Modal */}
      {showResolveModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '24px',
              width: '460px',
              maxWidth: '90vw',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>
              Resolve Incident: {event.id?.substring(0, 10)}...
            </h3>

            {!confirmStep ? (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>
                    Select Resolution Type:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { value: 'SUPERVISOR_CLOSED', label: 'Handled & Resolved by Control Room' },
                      { value: 'SAFE', label: 'Victim Confirmed Safe & Out of Danger' },
                      { value: 'FALSE_ALARM', label: 'Accidental Trigger / False Alarm' },
                      { value: 'CANCELLED', label: 'Cancelled by User Request' },
                    ].map((opt) => (
                      <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="resolutionType"
                          value={opt.value}
                          checked={resolutionType === opt.value}
                          onChange={(e) => setResolutionType(e.target.value)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.9rem' }}>
                    Mandatory Operator Notes:
                  </label>
                  <textarea
                    rows={4}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Enter dispatch notes, police/ambulance units notified, victim outcome..."
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '4px',
                      border: '1px solid #ccc',
                      fontSize: '0.9rem',
                      fontFamily: 'inherit',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    onClick={() => setShowResolveModal(false)}
                    style={{
                      background: '#e0e0e0',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (!resolutionNotes.trim()) {
                        alert('Please provide resolution notes before continuing.');
                        return;
                      }
                      setConfirmStep(true);
                    }}
                    style={{
                      background: '#d32f2f',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '4px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Next ➔ Confirm
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div
                  style={{
                    backgroundColor: '#fff3e0',
                    border: '1px solid #ffe082',
                    padding: '14px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    fontSize: '0.9rem',
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontWeight: '700', color: '#e65100' }}>
                    ⚠️ Confirm Incident Closure
                  </p>
                  <p style={{ margin: '0 0 6px 0' }}>
                    This action will atomically move this incident to the historical archive (<code>pastEvents</code>),
                    archive all {acceptors.length} responders, and write an immutable audit log entry.
                  </p>
                  <p style={{ margin: 0, fontStyle: 'italic', color: '#555' }}>
                    Type: <strong>{resolutionType}</strong>
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    disabled={submitting}
                    onClick={() => setConfirmStep(false)}
                    style={{
                      background: '#e0e0e0',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Back
                  </button>
                  <button
                    disabled={submitting}
                    onClick={handleExecuteResolve}
                    style={{
                      background: '#c62828',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '4px',
                      fontWeight: '700',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {submitting ? 'Resolving...' : 'Confirm & Finalize Closure'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default IncidentDrawer;
