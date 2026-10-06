import React from "react";
import { useNavigate } from "react-router-dom";
import { getAuth, signOut } from "firebase/auth";

export default function Suspended({ reason = "Account privileges suspended by regional administrator." }) {
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
              <span style={{ fontSize: "3rem" }}>🔒</span>
            </div>
            <h3 className="fw-bold text-danger mb-2">Account Suspended</h3>
            <p className="text-muted">
              Your supervisor credentials have been suspended. All access tokens and live operational privileges have been revoked.
            </p>

            <div className="alert alert-secondary text-start my-3">
              <strong>Notice:</strong>
              <p className="mb-0 mt-1">{reason}</p>
            </div>

            <p className="small text-muted">
              For security compliance inquiries or administrative reinstatement, please contact security operations at{" "}
              <a href="mailto:security-lead@wana.org">security-lead@wana.org</a>.
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
