import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const PRESET_QUERIES = [
  { code: 'CHECK_DANGER', label: '⚠️ Physical Danger?', text: 'Are you in immediate physical danger?' },
  { code: 'ATTACKER_PRESENT', label: '👀 Perpetrator Visible?', text: 'Are perpetrators in the same room or visible?' },
  { code: 'CAN_YOU_SPEAK', label: '🤫 Can Speak?', text: 'Can you speak or make any sound safely?' },
  { code: 'MEDICAL_NEED', label: '🩹 Need Medical Aid?', text: 'Is anyone physically injured or requiring urgent medical aid?' },
  { code: 'ARMED_THREAT', label: '🔫 Armed Threat?', text: 'Are the perpetrators armed with weapons?' },
];

export const TacticalChatDeck = ({ eventId, token }) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [customText, setCustomText] = useState('');

  const fetchMessages = async () => {
    if (!eventId || !token) return;
    try {
      const res = await fetch(apiUrl(`/events/tactical-chat/${eventId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setMessages(json.messages || []);
      }
    } catch (err) {
      console.warn('Tactical chat fetch error:', err.message);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 4000);
    return () => clearInterval(interval);
  }, [eventId, token]);

  const handleSendQuery = async (queryCode, text) => {
    if (!eventId || !token || sending) return;
    setSending(true);
    try {
      const res = await fetch(apiUrl(`/events/tactical-chat/${eventId}/query`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          queryCode,
          customText: text || undefined,
        }),
      });
      if (res.ok) {
        setCustomText('');
        fetchMessages();
      }
    } catch (err) {
      alert(`Failed to send query: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#0f172a',
        borderRadius: '8px',
        padding: '12px',
        color: '#f8fafc',
        border: '1px solid #334155',
        marginTop: '10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '6px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1rem' }}>🤫</span>
          <strong style={{ fontSize: '0.85rem', letterSpacing: '0.5px' }}>
            SILENT TACTICAL CHAT (ZERO AUDIO/VIBE)
          </strong>
        </div>
        <span
          style={{
            fontSize: '0.7rem',
            backgroundColor: '#0284c7',
            color: '#fff',
            padding: '2px 6px',
            borderRadius: '4px',
          }}
        >
          {messages.length} msgs
        </span>
      </div>

      {/* Message Stream */}
      <div
        style={{
          maxHeight: '180px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          marginBottom: '10px',
          paddingRight: '4px',
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              textAlign: 'center',
              padding: '12px 0',
              fontStyle: 'italic',
            }}
          >
            No tactical exchanges yet. Send a silent prompt below.
          </div>
        ) : (
          messages.map((m) => {
            const isSupervisor = m.senderType === 'SUPERVISOR';
            return (
              <div
                key={m.id}
                style={{
                  alignSelf: isSupervisor ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  backgroundColor: isSupervisor ? '#1e3a8a' : '#14532d',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '0.8rem',
                  border: isSupervisor ? '1px solid #2563eb' : '1px solid #16a34a',
                }}
              >
                <div
                  style={{
                    fontSize: '0.65rem',
                    color: isSupervisor ? '#93c5fd' : '#86efac',
                    marginBottom: '2px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <span>{isSupervisor ? '👮 Control Room' : '📱 Citizen (Covert Tap)'}</span>
                  {m.answerCode && (
                    <span
                      style={{
                        backgroundColor: '#22c55e',
                        color: '#052e16',
                        fontWeight: '700',
                        padding: '1px 4px',
                        borderRadius: '3px',
                      }}
                    >
                      {m.answerCode}
                    </span>
                  )}
                </div>
                <div>{m.text}</div>
              </div>
            );
          })
        )}
      </div>

      {/* Preset Query Action Pills */}
      <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '4px' }}>
        Quick Tactical Queries:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
        {PRESET_QUERIES.map((q) => (
          <button
            key={q.code}
            disabled={sending}
            onClick={() => handleSendQuery(q.code, q.text)}
            style={{
              backgroundColor: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid #475569',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.72rem',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Custom Text Input */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          type="text"
          placeholder="Or type discreet custom query..."
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customText.trim()) {
              handleSendQuery('CUSTOM_QUERY', customText.trim());
            }
          }}
          style={{
            flex: 1,
            backgroundColor: '#020617',
            border: '1px solid #334155',
            color: '#ffffff',
            borderRadius: '4px',
            padding: '5px 8px',
            fontSize: '0.75rem',
          }}
        />
        <button
          disabled={sending || !customText.trim()}
          onClick={() => handleSendQuery('CUSTOM_QUERY', customText.trim())}
          style={{
            backgroundColor: '#0284c7',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            padding: '5px 10px',
            fontSize: '0.75rem',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default TacticalChatDeck;
