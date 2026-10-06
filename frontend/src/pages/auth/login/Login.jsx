import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { auth } from "../../../firebase/firebaseConfig";
import loginImg from "../../../assets/Login.png";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import { apiUrl } from "../../../config/api";


import "./Login.css";

const Login = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showResend, setShowResend] = useState(false);
  const [unverifiedUser, setUnverifiedUser] = useState(null);

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleForgotPassword = async () => {
    if (!formData.email) return setError("Enter email first");
    try {
      await sendPasswordResetEmail(auth, formData.email);
      setMessage("Password reset email sent");
    } catch (err) {
      setError("Failed to send reset email.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      // 1️⃣ Firebase Auth login
      const cred = await signInWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const user = cred.user;

      // 2️⃣ Fetch role and region from the authenticated /auth/me route (HF-04)
      const token = await user.getIdToken();
      const res = await fetch(apiUrl('/auth/me'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!res.ok) {
        throw new Error("Account record not found in system database.");
      }
      const data = await res.json();

      // 3️⃣ Email Verification Rule (Ignore for Admins)
      if (!user.emailVerified && data.role !== "admin") {
        setError("Please verify your email address.");
        setShowResend(true);
        setUnverifiedUser(user);
        await signOut(auth); 
        setLoading(false);
        return;
      }

      // 4️⃣ Success Logic: Set session storage
      localStorage.setItem("token", token);
      localStorage.setItem("role", data.role);
      
      // Store region so other components (Header/Logs) can use it
      if (data.region) {
        localStorage.setItem("region", data.region);
      }

      // 5️⃣ Create Audit Log (Login Event)
      // Tagging with region ensures the Solapur Admin can see this log
      await fetch(apiUrl("/logs/create"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventType: "login",
          actionDescription: `User (${user.email}) logged into the system`,
          region: data.region || "", // Crucial for Admin filtering
        }),
      });

      // 6️⃣ Directional Logic
      if (data.role === "admin") {
        navigate("/admin/approval");
      } else {
        // ProtectedRoute will handle onboarding checks for supervisors
        navigate("/supervisor/dashboard");
      }
    } catch (err) {
      console.error("Login Error:", err);
      let displayError = err.message;
      if (err.message.includes("auth/invalid-credential")) {
        displayError = "Invalid email or password.";
      }
      setError(displayError);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    try {
      await sendEmailVerification(unverifiedUser);
      setMessage("Verification email sent! Check your inbox.");
      setShowResend(false);
    } catch (err) {
      setError("Failed to resend. Try again later.");
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-image">
          <img src={loginImg} alt="login" />
        </div>
        <div className="login-card">
          <h2>Welcome Back</h2>
          <p className="subtitle">Enter your credentials to access WANA</p>
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Work Email</label>
              <input
                type="email"
                name="email"
                placeholder="you@company.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
            {error && <div className="error-msg">{error}</div>}
            {message && <div className="success-msg">{message}</div>}
            {showResend && (
              <button type="button" className="link-btn" onClick={handleResendVerification}>
                Resend Verification Email
              </button>
            )}
            <button className="primary-btn" disabled={loading}>
              {loading ? "Authenticating..." : "Login"}
            </button>
          </form>
          <div className="footer-links">
            <button onClick={handleForgotPassword} className="link-btn">Forgot Password?</button>
            <p>Don’t have an account? <Link to="/register">Sign Up</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;