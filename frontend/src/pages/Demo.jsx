import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Demo.css';

const Demo = () => {
  const navigate = useNavigate();

  return (
    <div className="demo-container">
      <div className="demo-card">
        <h1>🎯 Wana Demo Credentials</h1>
        <p className="demo-subtitle">Use these credentials to explore the application</p>

        <div className="credentials-section">
          <h2>👨‍💼 Admin Login</h2>
          <div className="credential-box">
            <div className="credential-item">
              <strong>Email:</strong> admin@wana.com
            </div>
            <div className="credential-item">
              <strong>Password:</strong> admin123
            </div>
            <div className="credential-item">
              <strong>Region:</strong> Solapur
            </div>
          </div>
        </div>

        <div className="credentials-section">
          <h2>👮 Supervisor Login</h2>
          <div className="credential-box">
            <div className="credential-item">
              <strong>Email:</strong> supervisor@wana.com
            </div>
            <div className="credential-item">
              <strong>Password:</strong> super123
            </div>
            <div className="credential-item">
              <strong>Region:</strong> Solapur
            </div>
          </div>
        </div>

        <div className="demo-note">
          <p>⚠️ <strong>Note:</strong> Backend server must be running for login to work.</p>
          <p>This is a demonstration project showcasing the UI/UX design and frontend architecture.</p>
        </div>

        <button className="demo-login-btn" onClick={() => navigate('/login')}>
          Go to Login
        </button>
      </div>
    </div>
  );
};

export default Demo;
