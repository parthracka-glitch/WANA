import { useEffect, useRef } from 'react';

/**
 * Inactivity Timeout Hook (FE-16)
 * Automatically triggers onTimeout (e.g. session logout) after specified idle period.
 * Default: 15 minutes (900,000 ms).
 */
export function useIdleTimeout({
  timeoutMs = 15 * 60 * 1000,
  onTimeout,
  enabled = true,
}) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled || typeof onTimeout !== 'function') return;

    const resetTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        console.warn('⏱️ Session idle timeout reached (15m). Initiating logout...');
        onTimeout();
      }, timeoutMs);
    };

    // User activity events to listen to
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [timeoutMs, onTimeout, enabled]);
}

export default useIdleTimeout;
