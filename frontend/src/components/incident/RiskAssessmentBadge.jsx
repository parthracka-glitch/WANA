import React, { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * RiskAssessmentBadge (M-05 & BE-15)
 * Displays explainable, deterministic geospatial and temporal risk assessment.
 * Features human-readable explanation tags and safe-haven proximity.
 */
export default function RiskAssessmentBadge({ location, timestamp }) {
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(false);

  const apiBase = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!location?.latitude || !location?.longitude) return;

    let isMounted = true;
    const fetchRisk = async () => {
      setLoading(true);
      try {
        const res = await axios.post(`${apiBase}/risk/evaluate`, {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: timestamp || Date.now(),
        });
        if (isMounted && res.data?.success) {
          setAssessment(res.data);
        }
      } catch (err) {
        console.warn('Risk evaluation unavailable:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRisk();
    return () => {
      isMounted = false;
    };
  }, [location?.latitude, location?.longitude, timestamp]);

  if (loading) {
    return (
      <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic', padding: '4px 0' }}>
        ⚡ Calculating geospatial risk factors...
      </div>
    );
  }

  if (!assessment) return null;

  const isHigh = assessment.riskLevel === 'HIGH';
  const isModerate = assessment.riskLevel === 'MODERATE';

  const badgeBg = isHigh ? '#ef444422' : isModerate ? '#f59e0b22' : '#10b98122';
  const badgeBorder = isHigh ? '#ef444466' : isModerate ? '#f59e0b66' : '#10b98166';
  const badgeColor = isHigh ? '#fca5a5' : isModerate ? '#fcd34d' : '#6ee7b7';

  return (
    <div
      style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '6px',
        padding: '10px 12px',
        marginTop: '10px',
        color: '#f8fafc',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase' }}>
          Geospatial Risk Intelligence
        </span>
        <span
          style={{
            backgroundColor: badgeBg,
            border: `1px solid ${badgeBorder}`,
            color: badgeColor,
            fontSize: '0.7rem',
            fontWeight: '700',
            padding: '2px 8px',
            borderRadius: '12px',
          }}
        >
          {assessment.riskLevel} RISK ({assessment.riskScore}/100)
        </span>
      </div>

      {/* Human-Readable Explanation Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
        {assessment.explanationTags?.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: '0.65rem',
              backgroundColor: '#1e293b',
              color: '#cbd5e1',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid #334155',
            }}
          >
            🏷️ {tag.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* Safe-Haven Facility Info */}
      {assessment.nearestSafeHaven && (
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🏥 Nearest Safe Haven:</span>
          <span style={{ color: '#e2e8f0', fontWeight: '500' }}>
            {assessment.nearestSafeHaven.name} ({assessment.nearestSafeHaven.distanceKm} km)
          </span>
        </div>
      )}
    </div>
  );
}
