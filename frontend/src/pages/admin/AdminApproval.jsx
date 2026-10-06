import React, { useEffect, useState, useMemo } from "react";
import {
  Container,
  Table,
  Button,
  Badge,
  Tabs,
  Tab,
  Card,
  Spinner,
  Alert,
  Modal,
  Form,
  InputGroup,
} from "react-bootstrap";
import { apiUrl } from "../../config/api";

const AdminApproval = () => {
  const [supervisors, setSupervisors] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [rejectModal, setRejectModal] = useState({ open: false, supervisor: null, reason: "" });
  const [suspendModal, setSuspendModal] = useState({ open: false, supervisor: null, reason: "" });

  const token = localStorage.getItem("token");

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // 1. Fetch All Supervisors for this region
      const supRes = await fetch(apiUrl("/admin/supervisors"), { headers });
      const supData = await supRes.json();

      // 2. Fetch Regional Audit Logs
      const logsRes = await fetch(apiUrl("/logs/region"), { headers });
      const logsData = await logsRes.json();

      if (supRes.ok && logsRes.ok) {
        setSupervisors(Array.isArray(supData) ? supData : []);
        setLogs(Array.isArray(logsData) ? logsData : []);
      } else {
        setError("Failed to fetch dashboard data.");
      }
    } catch (err) {
      setError("Network error. Ensure backend is running.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered supervisor lists
  const filteredSupervisors = useMemo(() => {
    return supervisors.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchName = s.name?.toLowerCase().includes(q);
      const matchEmail = s.email?.toLowerCase().includes(q);
      return !q || matchName || matchEmail;
    });
  }, [supervisors, searchQuery]);

  const pendingList = useMemo(
    () => filteredSupervisors.filter((s) => s.status === "PENDING" || (!s.status && !s.isApproved)),
    [filteredSupervisors]
  );
  const approvedList = useMemo(
    () => filteredSupervisors.filter((s) => s.status === "APPROVED" || s.isApproved === true),
    [filteredSupervisors]
  );
  const suspendedList = useMemo(
    () => filteredSupervisors.filter((s) => s.status === "SUSPENDED"),
    [filteredSupervisors]
  );
  const rejectedList = useMemo(
    () => filteredSupervisors.filter((s) => s.status === "REJECTED"),
    [filteredSupervisors]
  );

  const handleApprove = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/admin/supervisors/${id}/approve`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error?.message || data.message || "Approval failed.");
      }
    } catch (err) {
      alert("Approval network error.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModal.reason || rejectModal.reason.trim().length < 5) {
      alert("Rejection reason must be at least 5 characters.");
      return;
    }
    setActionLoading(true);
    try {
      const id = rejectModal.supervisor.uid || rejectModal.supervisor.id || rejectModal.supervisor._id;
      const res = await fetch(apiUrl(`/admin/supervisors/${id}/reject`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectModal.reason.trim() }),
      });
      if (res.ok) {
        setRejectModal({ open: false, supervisor: null, reason: "" });
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error?.message || data.message || "Rejection failed.");
      }
    } catch (err) {
      alert("Rejection network error.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmSuspend = async () => {
    if (!suspendModal.reason || suspendModal.reason.trim().length < 5) {
      alert("Suspension reason must be at least 5 characters.");
      return;
    }
    setActionLoading(true);
    try {
      const id = suspendModal.supervisor.uid || suspendModal.supervisor.id || suspendModal.supervisor._id;
      const res = await fetch(apiUrl(`/admin/supervisors/${id}/suspend`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: suspendModal.reason.trim() }),
      });
      if (res.ok) {
        setSuspendModal({ open: false, supervisor: null, reason: "" });
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error?.message || data.message || "Suspension failed.");
      }
    } catch (err) {
      alert("Suspension network error.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReinstate = async (id) => {
    setActionLoading(true);
    try {
      const res = await fetch(apiUrl(`/admin/supervisors/${id}/reinstate`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: "Reinstated by Regional Admin" }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const data = await res.json();
        alert(data.error?.message || data.message || "Reinstatement failed.");
      }
    } catch (err) {
      alert("Reinstatement network error.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center p-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  return (
    <Container className="py-4">
      <header className="mb-4 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h2 className="fw-bold text-dark">Staff Control Center</h2>
          <p className="text-muted mb-0">
            Regional Jurisdiction: <strong>{localStorage.getItem("region") || "Assigned Region"}</strong>
          </p>
        </div>
        <div className="d-flex gap-2">
          <InputGroup size="sm" style={{ maxWidth: "250px" }}>
            <Form.Control
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>
          <Button variant="outline-primary" size="sm" onClick={fetchData} disabled={actionLoading}>
            Refresh
          </Button>
        </div>
      </header>

      {error && <Alert variant="danger">{error}</Alert>}

      <Card className="shadow-sm border-0">
        <Card.Body>
          <Tabs activeKey={activeTab} onSelect={(k) => setActiveTab(k)} className="mb-4">
            {/* ========== PENDING REQUESTS ========== */}
            <Tab eventKey="pending" title={`Pending (${pendingList.length})`}>
              <Table responsive hover className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Region</th>
                    <th>Status</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingList.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-4 text-muted">
                        No pending applications.
                      </td>
                    </tr>
                  ) : (
                    pendingList.map((sup) => {
                      const id = sup.uid || sup.id || sup._id;
                      return (
                        <tr key={id}>
                          <td className="fw-bold">{sup.name}</td>
                          <td>{sup.email}</td>
                          <td>
                            <Badge bg="info" text="dark">{sup.regionId || sup.region}</Badge>
                          </td>
                          <td>
                            <Badge bg="warning" text="dark">PENDING</Badge>
                          </td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm">
                              <Button
                                variant="success"
                                onClick={() => handleApprove(id)}
                                disabled={actionLoading}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline-danger"
                                onClick={() => setRejectModal({ open: true, supervisor: sup, reason: "" })}
                                disabled={actionLoading}
                              >
                                Reject
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </Tab>

            {/* ========== ACTIVE SUPERVISORS ========== */}
            <Tab eventKey="approved" title={`Active (${approvedList.length})`}>
              <Table responsive hover className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Region</th>
                    <th>Claims Version</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedList.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-4 text-muted">
                        No active supervisors found.
                      </td>
                    </tr>
                  ) : (
                    approvedList.map((sup) => {
                      const id = sup.uid || sup.id || sup._id;
                      return (
                        <tr key={id}>
                          <td className="fw-bold">{sup.name}</td>
                          <td>{sup.email}</td>
                          <td>
                            <Badge bg="primary">{sup.regionId || sup.region}</Badge>
                          </td>
                          <td>v{sup.claimsVersion || 1}</td>
                          <td className="text-end">
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => setSuspendModal({ open: true, supervisor: sup, reason: "" })}
                              disabled={actionLoading}
                            >
                              Suspend Access
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </Tab>

            {/* ========== SUSPENDED SUPERVISORS ========== */}
            <Tab eventKey="suspended" title={`Suspended (${suspendedList.length})`}>
              <Table responsive hover className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Reason</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suspendedList.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-4 text-muted">
                        No suspended accounts.
                      </td>
                    </tr>
                  ) : (
                    suspendedList.map((sup) => {
                      const id = sup.uid || sup.id || sup._id;
                      return (
                        <tr key={id}>
                          <td className="fw-bold">{sup.name}</td>
                          <td>{sup.email}</td>
                          <td className="text-muted small">{sup.suspensionReason || "Administrative suspension"}</td>
                          <td className="text-end">
                            <Button
                              variant="outline-success"
                              size="sm"
                              onClick={() => handleReinstate(id)}
                              disabled={actionLoading}
                            >
                              Reinstate
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </Tab>

            {/* ========== REJECTED SUPERVISORS ========== */}
            <Tab eventKey="rejected" title={`Rejected (${rejectedList.length})`}>
              <Table responsive hover className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Rejection Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedList.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="text-center py-4 text-muted">
                        No rejected applications.
                      </td>
                    </tr>
                  ) : (
                    rejectedList.map((sup) => {
                      const id = sup.uid || sup.id || sup._id;
                      return (
                        <tr key={id}>
                          <td className="fw-bold">{sup.name}</td>
                          <td>{sup.email}</td>
                          <td className="text-danger small">{sup.rejectReason || "Criteria not met"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </Tab>

            {/* ========== ACTIVITY LOGS ========== */}
            <Tab eventKey="logs" title="Audit Trail">
              <Table responsive hover className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Action</th>
                    <th>Actor Role</th>
                    <th>Target / Details</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center py-4 text-muted">
                        No audit logs found for this region.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const id = log.id || log._id;
                      return (
                        <tr key={id}>
                          <td>
                            <Badge bg="secondary">{log.action || log.eventType}</Badge>
                          </td>
                          <td>{log.actorRole || "staff"}</td>
                          <td className="small text-truncate" style={{ maxWidth: "300px" }}>
                            {log.details ? JSON.stringify(log.details) : log.actionDescription || "—"}
                          </td>
                          <td className="text-muted small">
                            {log.createdAtIso
                              ? new Date(log.createdAtIso).toLocaleString()
                              : log.timestamp
                              ? new Date(log.timestamp).toLocaleString()
                              : "Just now"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>

      {/* Reject Modal */}
      <Modal
        show={rejectModal.open}
        onHide={() => setRejectModal({ open: false, supervisor: null, reason: "" })}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">Reject Supervisor Application</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            You are rejecting the application for{" "}
            <strong>{rejectModal.supervisor?.name}</strong> ({rejectModal.supervisor?.email}).
          </p>
          <Form.Group>
            <Form.Label className="fw-semibold">
              Mandatory Rejection Reason <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Provide specific feedback or reason for rejection (minimum 5 characters)..."
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setRejectModal({ open: false, supervisor: null, reason: "" })}
            disabled={actionLoading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirmReject}
            disabled={actionLoading || !rejectModal.reason || rejectModal.reason.trim().length < 5}
          >
            {actionLoading ? <Spinner size="sm" animation="border" /> : "Confirm Rejection"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Suspend Modal */}
      <Modal
        show={suspendModal.open}
        onHide={() => setSuspendModal({ open: false, supervisor: null, reason: "" })}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title className="text-danger">Suspend Supervisor Access</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Suspending access for <strong>{suspendModal.supervisor?.name}</strong> will immediately revoke all
            session tokens and prevent access to the supervisor command center.
          </p>
          <Form.Group>
            <Form.Label className="fw-semibold">
              Suspension Reason <span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="State the compliance or administrative reason for suspension..."
              value={suspendModal.reason}
              onChange={(e) => setSuspendModal({ ...suspendModal, reason: e.target.value })}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setSuspendModal({ open: false, supervisor: null, reason: "" })}
            disabled={actionLoading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirmSuspend}
            disabled={actionLoading || !suspendModal.reason || suspendModal.reason.trim().length < 5}
          >
            {actionLoading ? <Spinner size="sm" animation="border" /> : "Confirm Suspension"}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default AdminApproval;