import React, { useState, useEffect } from 'react';

/**
 * Connection State & Offline Sync Banner (FE-11)
 * Monitors online/offline network transitions and cache synchronization.
 */
export const ConnectionBanner = ({ isFromCache = false }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 4000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowRestored(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOnline) {
    return (
      <div
        role="alert"
        style={{
          backgroundColor: '#d32f2f',
          color: '#ffffff',
          padding: '8px 16px',
          textAlign: 'center',
          fontWeight: '600',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          zIndex: 9999,
          position: 'sticky',
          top: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        }}
      >
        <span>⚠️ Disconnected: Operating in offline mode. Live incident telemetry is paused.</span>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#ffffff',
            color: '#d32f2f',
            border: 'none',
            padding: '3px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Reconnect
        </button>
      </div>
    );
  }

  if (isFromCache) {
    return (
      <div
        role="status"
        style={{
          backgroundColor: '#f57c00',
          color: '#ffffff',
          padding: '6px 16px',
          textAlign: 'center',
          fontWeight: '500',
          fontSize: '0.85rem',
          zIndex: 9999,
          position: 'sticky',
          top: 0,
        }}
      >
        <span>⚡ Synchronizing: Serving cached regional data while connection stabilizes...</span>
      </div>
    );
  }

  if (showRestored) {
    return (
      <div
        role="status"
        style={{
          backgroundColor: '#2e7d32',
          color: '#ffffff',
          padding: '6px 16px',
          textAlign: 'center',
          fontWeight: '500',
          fontSize: '0.85rem',
          zIndex: 9999,
          position: 'sticky',
          top: 0,
          transition: 'all 0.3s ease',
        }}
      >
        <span>✅ Connection Restored: Live regional control room stream is active.</span>
      </div>
    );
  }

  return null;
};

export default ConnectionBanner;
