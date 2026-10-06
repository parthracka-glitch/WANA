import { useState, useEffect } from 'react';
import { db } from '../firebase/firebaseConfig';
import { collectionGroup, query, where, onSnapshot, collection, doc, getDocs } from 'firebase/firestore';

/**
 * Universally extract lat/lng from location object or array
 */
const extractCoords = (location) => {
  if (!location) return { lat: null, lng: null };
  if (location.latitude !== undefined && location.longitude !== undefined) {
    return { lat: location.latitude, lng: location.longitude };
  }
  if (location.lat !== undefined && location.lng !== undefined) {
    return { lat: Number(location.lat), lng: Number(location.lng) };
  }
  if (Array.isArray(location) && location.length === 2) {
    if (typeof location[0] === 'number' && typeof location[1] === 'number') {
      return { lat: location[0], lng: location[1] };
    }
    const lat = parseFloat(location[0].toString().replace(/[^\d.-]/g, ''));
    const lng = parseFloat(location[1].toString().replace(/[^\d.-]/g, ''));
    return { lat, lng };
  }
  return { lat: null, lng: null };
};

/**
 * Collection Group Acceptors Hook (FE-17)
 * Efficiently streams all active responders in a region using collectionGroup('acceptors').
 * Seamlessly falls back to event-by-event query if collection group index is pending.
 */
export function useResponders({ regionId, activeEvents = [] }) {
  const [responders, setResponders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!regionId) {
      setResponders([]);
      setLoading(false);
      return;
    }

    let unsub = null;
    let fallbackActive = false;

    try {
      // 1. Preferred Primary: Collection Group Query (Flat scale overhead)
      const cgQuery = query(
        collectionGroup(db, 'acceptors'),
        where('regionId', '==', regionId.toLowerCase().trim())
      );

      unsub = onSnapshot(
        cgQuery,
        (snapshot) => {
          const list = [];
          snapshot.forEach((d) => {
            const data = d.data();
            const { lat, lng } = extractCoords(data.userLocation || data.location);
            list.push({
              id: d.id,
              eventId: data.eventId || d.ref.parent.parent?.id,
              name: data.name,
              email: data.email,
              phone: data.phone,
              acceptedAt: data.acceptedAt,
              active: data.active !== false,
              lat,
              lng,
            });
          });
          setResponders(list);
          setLoading(false);
        },
        async (error) => {
          // If index not ready (code: 'failed-precondition'), run fallback
          console.warn('⚠️ CollectionGroup query fallback active:', error.message);
          fallbackActive = true;
          executeFallback();
        }
      );
    } catch {
      fallbackActive = true;
      executeFallback();
    }

    // Fallback: poll per-active-event
    const executeFallback = async () => {
      if (activeEvents.length === 0) {
        setResponders([]);
        setLoading(false);
        return;
      }

      const list = [];
      for (const ev of activeEvents) {
        try {
          const accRef = collection(db, 'acceptedEvents', ev.id, 'acceptors');
          const snap = await getDocs(accRef);
          snap.forEach((d) => {
            const data = d.data();
            const { lat, lng } = extractCoords(data.userLocation || data.location);
            list.push({
              id: `${d.id}_${ev.id}`,
              eventId: ev.id,
              name: data.name,
              email: data.email,
              phone: data.phone,
              acceptedAt: data.acceptedAt,
              lat,
              lng,
            });
          });
        } catch {}
      }
      setResponders(list);
      setLoading(false);
    };

    return () => {
      if (unsub) unsub();
    };
  }, [regionId, activeEvents.length]);

  return { responders, loading };
}

export default useResponders;
