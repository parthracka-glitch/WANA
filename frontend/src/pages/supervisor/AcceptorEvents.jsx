import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase/firebaseConfig";
import { collection, onSnapshot, query, where, getDocs, doc } from "firebase/firestore";
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

const AcceptorEvents = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [acceptors, setAcceptors] = useState([]);
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
          lat,
          lng,
        };
      });

      setAlerts(data);
      setLoading(false);
    });

    return () => unsub();
  }, [supervisor]);

  /* 👥 FETCH ACCEPTORS FOR ONGOING EVENTS */
  useEffect(() => {
    if (!supervisor || alerts.length === 0) {
      setAcceptors([]);
      return;
    }

    const fetchAcceptors = async () => {
      const acceptorsList = [];

      try {
        for (const alert of alerts) {
          const acceptedEventDocRef = doc(db, "acceptedEvents", alert.id);
          const acceptorsCollectionRef = collection(acceptedEventDocRef, "acceptors");
          
          try {
            const acceptorsSnapshot = await getDocs(acceptorsCollectionRef);

            if (!acceptorsSnapshot.empty) {
              acceptorsSnapshot.forEach((acceptorDoc) => {
                const acceptorData = acceptorDoc.data();
                const { lat, lng } = extractLatLng(acceptorData.userLocation);

                const uniqueId = `${acceptorDoc.id}_${alert.id}`;
                acceptorsList.push({
                  id: uniqueId,
                  acceptorDocId: acceptorDoc.id,
                  eventId: alert.id,
                  name: acceptorData.name,
                  email: acceptorData.email,
                  acceptedAt: acceptorData.acceptedAt,
                  lat,
                  lng,
                });
              });
            }
          } catch (error) {
            console.log("Error fetching acceptors for event:", alert.id);
          }
        }

        setAcceptors(acceptorsList);
      } catch (error) {
        console.error("Error fetching acceptors:", error);
      }
    };

    fetchAcceptors();
  }, [alerts, supervisor]);

  if (loading || !supervisor) {
    return <p style={{ padding: 20 }}>Loading acceptor events...</p>;
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Acceptors (People Responding)</h1>
        <div className="header-stats">
          <span>Region: <strong>{supervisor.region}</strong></span>
          <span>Total Responders: <strong>{acceptors.length}</strong></span>
        </div>
      </header>

      <section className="table-container" style={{ marginTop: '20px' }}>
        <table className="alerts-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Responding To</th>
              <th>Accepted At</th>
              <th>Coordinates</th>
            </tr>
          </thead>
          <tbody>
            {acceptors.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: "center", color: "#999", padding: "40px" }}>
                  No acceptors yet
                </td>
              </tr>
            ) : (
              acceptors.map((acceptor) => {
                const relatedEvent = alerts.find(a => a.id === acceptor.eventId);
                return (
                  <tr key={acceptor.id}>
                    <td>
                      <strong style={{ color: 'green' }}>👤 {acceptor.name}</strong>
                    </td>
                    <td>{acceptor.email}</td>
                    <td>
                      {relatedEvent ? (
                        <div style={{ fontSize: '0.9em' }}>
                          <div style={{ 
                            fontWeight: 'bold', 
                            color: '#d32f2f',
                            background: '#ffebee',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            display: 'inline-block'
                          }}>
                            🚨 {relatedEvent.type || 'SOS'}
                          </div>
                          <div style={{ color: '#666', fontSize: '0.85em', marginTop: '4px' }}>
                            Victim: {relatedEvent.email}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: '#999' }}>Event resolved</span>
                      )}
                    </td>
                    <td>
                      {acceptor.acceptedAt?.toDate
                        ? acceptor.acceptedAt.toDate().toLocaleString()
                        : "N/A"}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>
                      {acceptor.lat && acceptor.lng
                        ? `${acceptor.lat.toFixed(5)}, ${acceptor.lng.toFixed(5)}`
                        : "N/A"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default AcceptorEvents;
