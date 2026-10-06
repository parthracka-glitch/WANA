import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { Container, Card, Form, Button, Alert } from "react-bootstrap";
import { apiUrl } from "../../config/api";

const CompleteProfile = () => {
  const [region, setRegion] = useState("");
  const [availableRegions, setAvailableRegions] = useState([
    { id: "solapur", name: "Solapur" },
    { id: "pune", name: "Pune" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const auth = getAuth();

  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const res = await fetch(apiUrl("/regions/available"));
        if (res.ok) {
          const data = await res.json();
          if (data.regions && data.regions.length > 0) {
            setAvailableRegions(data.regions);
          }
        }
      } catch (err) {
        console.warn("Could not fetch available regions, falling back to active pilot regions:", err);
      }
    };
    fetchRegions();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!region) {
      setError("Please select a region to continue.");
      setLoading(false);
      return;
    }

    try {
      const user = auth.currentUser;
      if (user) {
        // 1️⃣ Get the ID token to authenticate with your Node.js backend
        const token = await user.getIdToken();

        // 2️⃣ Send the update request to your MongoDB via Express
        const response = await fetch(apiUrl("/supervisor/complete-profile"), {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ region })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to update profile");
        }

        // 3️⃣ Navigate to waiting room
        navigate("/pending-approval");
      }
    } catch (err) {
      console.error("Error updating profile in MongoDB:", err);
      setError(err.message || "Failed to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: "80vh" }}>
      <Card style={{ maxWidth: "500px", width: "100%", borderRadius: "15px" }} className="shadow-sm border-0">
        <Card.Body className="p-4">
          <div className="text-center mb-4">
            <h3 className="fw-bold">Step 2: Regional Assignment</h3>
            <p className="text-muted">Select your region to request access to the command center.</p>
          </div>

          {error && <Alert variant="danger">{error}</Alert>}

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-4">
              <Form.Label className="fw-semibold">Assigned Region</Form.Label>
              <Form.Select 
                value={region} 
                onChange={(e) => setRegion(e.target.value)}
                className="py-2"
                required
              >
                <option value="">Choose a region...</option>
                {availableRegions.map((r) => (
                  <option key={r.id || r.name} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </Form.Select>
              <Form.Text className="text-muted">
                Only regions with active regional admins are available for assignment.
              </Form.Text>
            </Form.Group>

            <Button 
              variant="primary" 
              type="submit" 
              className="w-100 py-2 fw-bold" 
              disabled={loading}
            >
              {loading ? "Updating MongoDB..." : "Submit for Approval"}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default CompleteProfile;