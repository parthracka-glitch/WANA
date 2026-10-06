import React from "react";
import { Container, Card, Button } from "react-bootstrap";
import { getAuth, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

const PendingApproval = () => {
  const navigate = useNavigate();
  const auth = getAuth();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: "80vh" }}>
      <Card className="text-center p-5 shadow-sm" style={{ maxWidth: "600px", borderRadius: "20px" }}>
        <div className="mb-4">
          <div className="display-1 text-warning mb-3">⏳</div>
          <h2 className="fw-bold">Approval Pending</h2>
          <p className="text-muted fs-5">
            Your profile has been submitted successfully. An Admin is currently reviewing your request for regional access.
          </p>
        </div>
        
        <div className="bg-light p-3 rounded mb-4">
          <small className="text-secondary">
            Once approved, you will automatically gain access to the Supervisor Command Center. 
            Try refreshing the page in a few minutes.
          </small>
        </div>

        <div className="d-grid gap-2">
          <Button variant="outline-primary" onClick={() => window.location.reload()}>
            Check Status (Refresh)
          </Button>
          <Button variant="link" className="text-muted" onClick={handleLogout}>
            Log out and check later
          </Button>
        </div>
      </Card>
    </Container>
  );
};

export default PendingApproval;