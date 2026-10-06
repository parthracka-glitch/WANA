import React, { useState } from 'react';
import { apiUrl } from '../../config/api';

export const LegalDossierButton = ({ eventId, token }) => {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dossier, setDossier] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchOrGenerate = async () => {
    setShowModal(true);
    setLoading(true);
    try {
      // First try to fetch existing
      const getRes = await fetch(apiUrl(`/events/dossier/${eventId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (getRes.ok) {
        const json = await getRes.json();
        setDossier(json.data);
        setLoading(false);
        return;
      }

      // If not exists, generate now
      const genRes = await fetch(apiUrl(`/events/dossier/${eventId}/generate`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          officerDesignation: 'Duty Inspector / Control Room Supervisor',
          policeStationJurisdiction: 'Solapur Central Police Station',
        }),
      });

      if (genRes.ok) {
        const json = await genRes.json();
        setDossier(json.dossier);
      } else {
        const err = await genRes.json();
        alert(`Dossier error: ${err.message || 'Generation failed'}`);
      }
    } catch (err) {
      alert(`Error fetching legal dossier: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCertificate = () => {
    if (!dossier?.bsa65bCertificateText) return;
    navigator.clipboard.writeText(dossier.bsa65bCertificateText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <>
      <button
        onClick={fetchOrGenerate}
        style={{
          width: '100%',
          padding: '10px 14px',
          backgroundColor: '#3b0764',
          color: '#f5d0fe',
          border: '1px solid #7e22ce',
          borderRadius: '6px',
          fontSize: '0.85rem',
          fontWeight: '700',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.2s',
          marginTop: '8px',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          ⚖️ Court Dossier (BSA §65B)
        </span>
        <span
          style={{
            fontSize: '0.7rem',
            backgroundColor: '#581c87',
            padding: '2px 8px',
            borderRadius: '10px',
            color: '#fdf4ff',
          }}
        >
          Legal Certificate
        </span>
      </button>

      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.65)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
              border: '1px solid #cbd5e1',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: '#1e1b4b',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700' }}>
                  ⚖️ Court Evidentiary Dossier & BSA 65B Certificate
                </h4>
                <div style={{ fontSize: '0.75rem', color: '#c7d2fe' }}>
                  Bharatiya Sakshya Adhiniyam, 2023 (Admissibility of Electronic Records)
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', flex: 1 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#475569' }}>
                  ⏳ Cryptographically verifying audio/video chunks and compiling dossier...
                </div>
              ) : dossier ? (
                <div>
                  {/* Master Integrity Seal */}
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #86efac',
                      borderRadius: '6px',
                      marginBottom: '16px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ fontWeight: '700', color: '#166534', marginBottom: '4px' }}>
                      🔒 Cryptographic Master Seal (SHA-256):
                    </div>
                    <code style={{ fontSize: '0.75rem', wordBreak: 'break-all', color: '#14532d' }}>
                      {dossier.masterSha256}
                    </code>
                    <div
                      style={{
                        display: 'flex',
                        gap: '12px',
                        marginTop: '8px',
                        fontSize: '0.75rem',
                        color: '#166534',
                      }}
                    >
                      <span>📁 Evidence Chunks: {dossier.evidenceManifest?.length || 0}</span>
                      <span>📍 GPS Breadcrumbs: {dossier.breadcrumbsCount || 0}</span>
                      <span>📜 Audit Entries: {dossier.auditLogsCount || 0}</span>
                    </div>
                  </div>

                  {/* Section 65B Certificate Preview */}
                  <div style={{ marginBottom: '16px' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <strong style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                        Section 65B Statutory Certificate:
                      </strong>
                      <button
                        onClick={handleCopyCertificate}
                        style={{
                          backgroundColor: copied ? '#15803d' : '#4338ca',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        {copied ? '✓ Copied to Clipboard' : '📋 Copy Certificate'}
                      </button>
                    </div>
                    <pre
                      style={{
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        padding: '12px',
                        fontSize: '0.72rem',
                        lineHeight: '1.4',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        color: '#334155',
                        maxHeight: '260px',
                        overflowY: 'auto',
                      }}
                    >
                      {dossier.bsa65bCertificateText}
                    </pre>
                  </div>
                </div>
              ) : (
                <div style={{ color: '#ef4444' }}>Unable to load dossier record.</div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                backgroundColor: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#475569',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LegalDossierButton;
