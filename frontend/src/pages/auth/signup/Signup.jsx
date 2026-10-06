import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiUrl } from "../../../config/api";


import { auth, db } from "../../../firebase/firebaseConfig"; // Added db
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore"; // Added Firestore methods

import PasswordStrengthBar from "react-password-strength-bar";
import "./Signup.css";

import signupimage from "../../../assets/Signup.png";

const Signup = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { name, email, password } = formData;

      // 1️⃣ Create Firebase Auth account
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      // 2️⃣ Send email verification
      await sendEmailVerification(user);

      // 3️⃣ Initialize Supervisor Document in Firestore
      // We set region to null and isApproved to false to trigger onboarding flow
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name,
        email,
        role: "supervisor",
        region: "",           // Left empty for Step 2
        isApproved: false,    // Blocked until Admin action
        createdAt: new Date(),
      });

      // 4️⃣ Synchronize Supervisor Profile via authenticated endpoint (HF-04)
      const token = await user.getIdToken();
      const response = await fetch(apiUrl("/supervisor/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Supervisor registration failed");
      }
      

      alert(
        "Account created! Please verify your email. You will be asked to select your region upon your first login."
      );

      navigate("/login");
    } catch (err) {
      console.error("Signup Error:", err);
      if (err.code === "auth/weak-password") {
        setError("Password is too weak.");
      } else if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="image-section">
        <img src={signupimage} alt="Wana Welcome" className="Signup-image" />
      </div>

      <div className="form-section">
        <h2 className="heading">Create Supervisor Account</h2>
        <p style={{ color: '#64748b', marginBottom: '25px', fontSize: '0.95rem' }}>
            Register your identity to join our emergency command network.
        </p>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label className="label">Full Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Mayuri Gaikwad"
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Work Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@company.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Security Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />
            <PasswordStrengthBar
              password={formData.password}
              style={{ marginTop: "12px" }}
              barColors={['#e2e8f0', '#ef4444', '#f59e0b', '#3b82f6', '#10b981']}
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Establishing Identity..." : "Create Account"}
          </button>
          
          <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '0.85rem', color: '#64748b' }}>
            Already have an account? <Link to="/login" style={{ color: '#2563eb', fontWeight: '600', textDecoration: 'none' }}>Log In</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Signup;