import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase/firebaseConfig";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import "./SupervisorDashboard.css";
import { apiUrl } from "../../config/api";


/* 🔥 UNIVERSAL LOCATION PARSER */
const extractLatLng = (location) => {
  if (!location) return { lat: null, lng: null };

  if (location.latitude !== undefined && location.longitude !== undefined) {
    return {
      lat: location.latitude,
      lng: location.longitude,
    };
  }

  if (location.lat !== undefined && location.lng !== undefined) {
    return {
      lat: Number(location.lat),
      lng: Number(location.lng),
    };
  }

  if (Array.isArray(location) && location.length === 2) {
    if (typeof location[0] === 'number' && typeof location[1] === 'number') {
      return { lat: location[0], lng: location[1] };
    }
    
    const lat = parseFloat(location[0].toString().replace(/[^\d.-]/g, ""));
    const lng = parseFloat(location[1].toString().replace(/[^\d.-]/g, ""));
    return { lat, lng };
  }

  return { lat: null, lng: null };
};

const OngoingEvents = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [supervisor, setSupervisor] = useState(null);
  const [loading, setLoading] = useState(true);

  /* 🔐 AUTH + PROFILE */
  useEffect(() => {
    const auth = getAuth();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return navigate("/login");

      const token = await user.getIdToken();
      const res = await fetch(apiUrl("/supervisor/profile"), {
        headers: { Authorization: `Bearer ${token}` },
      });

      const profile = await res.json();

      if (profile.role !== "supervisor" || !profile.isApproved) {
        navigate("/login");
        return;
      }

      setSupervisor(profile);
    });

    return () => unsub();
  }, [navigate]);

  /* 🔥 ONGOING EVENTS (REGION SAFE) */
  useEffect(() => {
    if (!supervisor) return;

    const q = query(
      collection(db, "ongoingEvents"),
      where("city", "==", supervisor.region),
      where("is_resolved", "==", false)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((doc) => {
        const d = doc.data();
        const { lat, lng } = extractLatLng(d.location);

        return {
          id: doc.id,
          email: d.sos_clicked_by_email,
          type: d.emergency_type,
          message: d.emergency_message,
          timestamp: d.timestamp,
          lat,
          lng,
        };
      });

      setAlerts(data);
      setLoading(false);
    });

    return () => unsub();
  }, [supervisor]);

  if (loading || !supervisor) {
    return <p style={{ padding: 20 }}>Loading ongoing events...</p>;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Ongoing Events</h1>
        <div className="header-stats">
          <span>Region: <strong>{supervisor.region}</strong></span>
          <span>Active Events: <strong>{alerts.length}</strong></span>
        </div>
      </header>

      <section className="table-container" style={{ marginTop: '20px' }}>
        <table className="alerts-table">
          <thead>
            <tr>
              <th>Event ID</th>
              <th>Email</th>
              <th>Type</th>
              <th>Message</th>
              <th>Coordinates</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: "center", color: "#999", padding: "40px" }}>
                  No ongoing events in your region
                </td>
              </tr>
            ) : (
              alerts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85em', color: '#666' }}>
                    {a.id.substring(0, 12)}...
                  </td>
                  <td>{a.email}</td>
                  <td>
                    <span style={{ 
                      background: '#ffebee', 
                      color: '#c62828', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      fontWeight: 'bold'
                    }}>
                      {a.type || 'SOS'}
                    </span>
                  </td>
                  <td>{a.message || 'N/A'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>
                    {a.lat && a.lng ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : "N/A"}
                  </td>
                  <td>
                    {a.timestamp?.toDate 
                      ? a.timestamp.toDate().toLocaleString()
                      : 'N/A'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default OngoingEvents;
