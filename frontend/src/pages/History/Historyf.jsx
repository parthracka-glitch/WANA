import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../../firebase/firebaseConfig";
import {
  Table, Container, Spinner, Badge, Card, Alert,
  Row, Col, Form, InputGroup, Button
} from "react-bootstrap";
import "./History.css";

const History = () => {
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acceptorsMap, setAcceptorsMap] = useState({}); // Store acceptors by event ID

  // Multi-Option Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const supervisorRegion = localStorage.getItem("region"); // Solapur

  const fetchRecords = async () => {
    setLoading(true);
    try {
      if (!supervisorRegion) {
        setError("Supervisor region not found. Please log in again.");
        setLoading(false);
        return;
      }

      const eventsCollection = collection(db, "pastEvents");
      const resolvedQuery = query(
        eventsCollection,
        where("is_resolved", "==", true),
        where("city", "==", supervisorRegion),
        orderBy("timestamp", "desc")
      );

      const querySnapshot = await getDocs(resolvedQuery);
      const resolvedEvents = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setEvents(resolvedEvents);
      setFilteredEvents(resolvedEvents);

      // Fetch acceptors for each past event
      await fetchAcceptorsForEvents(resolvedEvents);
    } catch (error) {
      setError("Could not retrieve regional history.");
    } finally {
      setLoading(false);
    }
  };

  const fetchAcceptorsForEvents = async (eventsList) => {
    const acceptorsData = {};

    try {
      const fetchPromises = eventsList.map(async (event) => {

        // 🔥 Step 1: Try pastEvents
        let snapshot = await getDocs(
          collection(db, "pastEvents", event.id, "acceptors")
        );

        // 🔥 Step 2: Fallback ONLY if empty
        if (snapshot.empty) {
          snapshot = await getDocs(
            collection(db, "acceptedEvents", event.id, "acceptors")
          );
        }

        const acceptors = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        return { eventId: event.id, acceptors };
      });

      const results = await Promise.all(fetchPromises);

      results.forEach(({ eventId, acceptors }) => {
        acceptorsData[eventId] = acceptors;
      });

      setAcceptorsMap(acceptorsData);

    } catch (error) {
      console.error("Error fetching acceptors:", error);
    }
  };
  useEffect(() => {
    let results = [...events];

    // Search by Name/Email
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      results = results.filter(event =>
        event.sos_clicked_by_email?.toLowerCase().includes(term) ||
        event.event_id?.toLowerCase().includes(term)
      );
    }

    // Date Range Filter
    if (startDate || endDate) {
      results = results.filter(event => {
        if (!event.timestamp?.seconds) return false;
        const eventDate = new Date(event.timestamp.seconds * 1000).toISOString().split('T')[0];
        const startMatch = startDate ? eventDate >= startDate : true;
        const endMatch = endDate ? eventDate <= endDate : true;
        return startMatch && endMatch;
      });
    }

    setFilteredEvents(results);
  }, [searchTerm, startDate, endDate, events]);

  useEffect(() => { fetchRecords(); }, [supervisorRegion]);

  return (
    <Container fluid className="history-page mt-4">
      <Card className="filter-card shadow-sm mb-4 p-4">
        <Row className="g-3 align-items-end">
          <Col lg={4} md={6}>
            <Form.Group>
              <Form.Label className="small">Search by Email or Event ID</Form.Label>
              <Form.Control
                placeholder="Type to search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-dark bg-white" // 🔥 Force visibility
              />
            </Form.Group>
          </Col>
          <Col lg={3} md={3}>
            <Form.Group>
              <Form.Label className="small">From Date</Form.Label>
              <Form.Control
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-dark bg-white"
              />
            </Form.Group>
          </Col>
          <Col lg={3} md={3}>
            <Form.Group>
              <Form.Label className="small">To Date</Form.Label>
              <Form.Control
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-dark bg-white"
              />
            </Form.Group>
          </Col>
          <Col lg={2}>
            <Button variant="outline-danger" className="w-100" onClick={() => { setSearchTerm(""); setStartDate(""); setEndDate(""); }}>
              Reset
            </Button>
          </Col>
        </Row>
      </Card>

      <Card className="shadow-sm border-0 overflow-hidden">
        <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
          <h5 className="mb-0 fw-bold">Records for {supervisorRegion}</h5>
          <Badge bg="primary">{filteredEvents.length} Entries Found</Badge>
        </Card.Header>
        <Card.Body className="p-0">
          {loading ? (
            <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
          ) : (
            <div className="table-responsive">
              <Table hover className="history-table mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Event ID</th>
                    <th>City</th>
                    <th>Type</th>
                    <th>Emergency Message</th>
                    <th>Location</th>
                    <th>Acceptors/Responders</th>
                    <th>Clicked By (Email)</th>
                    <th>User UID</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event) => {
                    const eventAcceptors = acceptorsMap[event.id] || [];

                    return (
                      <tr key={event.id}>
                        <td className="fw-bold text-primary">#{event.event_id?.substring(0, 8)}</td>
                        <td>{event.city}</td>
                        <td><Badge bg="secondary">{event.emergency_type}</Badge></td>
                        <td className="text-wrap" style={{ maxWidth: "200px" }}>{event.emergency_message}</td>
                        <td className="font-monospace small">
                          {event.location?.latitude?.toFixed(4)}, {event.location?.longitude?.toFixed(4)}
                        </td>
                        <td>
                          {eventAcceptors.length > 0 ? (
                            <div style={{ fontSize: '0.85em' }}>
                              <Badge bg="success" className="mb-1">
                                ✓ {eventAcceptors.length} {eventAcceptors.length === 1 ? 'Responder' : 'Responders'}
                              </Badge>
                              {eventAcceptors.map((acceptor, idx) => (
                                <div key={idx} style={{
                                  fontSize: '0.9em',
                                  color: '#2e7d32',
                                  marginTop: '4px',
                                  padding: '2px 0'
                                }}>
                                  👤 {acceptor.name || acceptor.email}
                                  {acceptor.acceptedAt && (
                                    <div style={{ fontSize: '0.85em', color: '#666' }}>
                                      {acceptor.acceptedAt.seconds
                                        ? new Date(acceptor.acceptedAt.seconds * 1000).toLocaleString()
                                        : 'N/A'}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <Badge bg="secondary">No responders</Badge>
                          )}
                        </td>
                        <td className="fw-bold">{event.sos_clicked_by_email}</td>
                        <td className="text-muted small">{event.sos_clicked_by_uid?.substring(0, 6)}...</td>
                        <td>
                          {event.auto_resolved ? (
                            <Badge bg="warning" text="dark">Auto-Resolved</Badge>
                          ) : (
                            <Badge bg="success">Resolved</Badge>
                          )}
                        </td>
                        <td className="small">
                          {event.timestamp?.seconds ? new Date(event.timestamp.seconds * 1000).toLocaleString() : "N/A"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
};

export default History;