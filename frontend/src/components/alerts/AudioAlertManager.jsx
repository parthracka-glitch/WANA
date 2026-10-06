import React, { useState, useEffect, useRef } from 'react';

/**
 * Audible New-SOS Alarm & Audio Permission Manager (FE-15)
 * Uses Web Audio API to synthesize emergency siren/chime tones.
 * Handles browser autoplay policies with explicit unlock prompt.
 * Supports temporary 60-second mute cooldown.
 */
export const AudioAlertManager = ({ activeUnacknowledgedCount = 0 }) => {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [muteRemaining, setMuteRemaining] = useState(0);

  const audioCtxRef = useRef(null);
  const oscillatorRef = useRef(null);
  const gainNodeRef = useRef(null);
  const intervalRef = useRef(null);
  const muteTimerRef = useRef(null);

  // Initialize Web Audio Context
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    return audioCtxRef.current;
  };

  // Explicit user unlock for browser autoplay policy
  const unlockAudio = async () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
      }
      setAudioUnlocked(true);
      // Play a short confirmation beep
      playChime(660, 0.15);
    } catch (err) {
      console.warn('AudioContext resume error:', err);
    }
  };

  // Play a single synthesized tone
  const playChime = (freq = 880, duration = 0.25) => {
    try {
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Tone synthesis warning:', e);
    }
  };

  // Start periodic alarm loop if unacknowledged events exist
  useEffect(() => {
    if (activeUnacknowledgedCount > 0 && audioUnlocked && !isMuted) {
      // Emergency two-tone siren sequence every 2 seconds
      if (!intervalRef.current) {
        let toggle = false;
        intervalRef.current = setInterval(() => {
          playChime(toggle ? 980 : 740, 0.35);
          toggle = !toggle;
        }, 1200);
      }
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeUnacknowledgedCount, audioUnlocked, isMuted]);

  // Handle Mute for 60s
  const handleMute60s = () => {
    setIsMuted(true);
    setMuteRemaining(60);

    if (muteTimerRef.current) clearInterval(muteTimerRef.current);

    muteTimerRef.current = setInterval(() => {
      setMuteRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(muteTimerRef.current);
          setIsMuted(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '6px 14px',
        borderRadius: '6px',
        backgroundColor: activeUnacknowledgedCount > 0 ? '#ffebee' : '#f5f5f5',
        border: activeUnacknowledgedCount > 0 ? '1px solid #ef5350' : '1px solid #e0e0e0',
        fontSize: '0.85rem',
      }}
    >
      {!audioUnlocked ? (
        <button
          onClick={unlockAudio}
          style={{
            background: '#d32f2f',
            color: '#fff',
            border: 'none',
            padding: '5px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
          title="Enable emergency sirens for incoming dispatch events"
        >
          🔊 Enable Audible Alerts
        </button>
      ) : (
        <span style={{ color: '#2e7d32', fontWeight: '600' }}>
          🔊 Audio Active
        </span>
      )}

      {activeUnacknowledgedCount > 0 && (
        <>
          <span
            style={{
              color: '#d32f2f',
              fontWeight: '700',
              animation: 'pulse 1s infinite',
            }}
          >
            🚨 {activeUnacknowledgedCount} Unacknowledged Incident{activeUnacknowledgedCount > 1 ? 's' : ''}
          </span>

          {isMuted ? (
            <span style={{ color: '#666', fontStyle: 'italic' }}>
              Muted ({muteRemaining}s remaining)
            </span>
          ) : (
            <button
              onClick={handleMute60s}
              style={{
                background: '#424242',
                color: '#fff',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              🔇 Mute for 60s
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default AudioAlertManager;
