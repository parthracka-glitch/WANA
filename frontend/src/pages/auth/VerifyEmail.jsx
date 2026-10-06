import React, { useState, useEffect } from "react";
import { getAuth, sendEmailVerification } from "firebase/auth";
import { useNavigate } from "react-router-dom";

export default function VerifyEmail() {
  const auth = getAuth();
  const navigate = useNavigate();
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        setMessage("Verification email has been resent. Please check your inbox and spam folder.");
        setError("");
        setCooldown(60);
      } else {
        setError("No authenticated user found. Please log in.");
      }
    } catch (err) {
      setError("Failed to send verification email: " + err.message);
    }
  };

  const handleRefresh = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        navigate("/complete-profile");
      } else {
        setMessage("Email is not verified yet. Please check your link.");
      }
    }
  };

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card shadow-sm border-0 p-4 text-center">
            <div className="mb-3">
              <span style={{ fontSize: "3rem" }}>✉️</span>
            </div>
            <h3 className="fw-bold mb-2">Verify Your Email</h3>
            <p className="text-muted">
              We have sent a verification email to{" "}
              <strong>{auth.currentUser?.email || "your address"}</strong>. Please click the link to verify your identity.
            </p>

            {message && <div className="alert alert-info py-2">{message}</div>}
            {error && <div className="alert alert-danger py-2">{error}</div>}

            <div className="d-grid gap-2 mt-3">
              <button className="btn btn-primary" onClick={handleRefresh}>
                I Have Verified My Email
              </button>
              <button
                className="btn btn-outline-secondary"
                onClick={handleResend}
                disabled={cooldown > 0}
              >
                {cooldown > 0 ? `Resend Email (${cooldown}s)` : "Resend Verification Email"}
              </button>
              <button className="btn btn-link text-muted" onClick={() => navigate("/login")}>
                Return to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
