import React from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";

export default function Rejected({ reason = "Application criteria not met." }) {
  const navigate = useNavigate();
  const auth = getAuth();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card shadow-sm border-danger border-2 p-4 text-center">
            <div className="mb-3">
              <span style={{ fontSize: "3rem" }}>🚫</span>
            </div>
            <h3 className="fw-bold text-danger mb-2">Application Rejected</h3>
            <p className="text-muted">
              Your regional supervisor application was reviewed and rejected by the regional administrator.
            </p>

            <div className="alert alert-warning text-start my-3">
              <strong>Reason Provided:</strong>
              <p className="mb-0 mt-1">{reason}</p>
            </div>

            <p className="small text-muted">
              If you believe this decision was made in error or wish to appeal, please contact the emergency operations division at{" "}
              <a href="mailto:ops-appeals@wana.org">ops-appeals@wana.org</a>.
            </p>

            <div className="d-grid gap-2 mt-3">
              <button className="btn btn-outline-danger" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
