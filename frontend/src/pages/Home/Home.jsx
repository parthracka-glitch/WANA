import React from 'react';
import { Link } from 'react-router-dom';
import file from '../../assets/file.png'
import './Home.css';

const Home = () => {
  return (
    <div className="home-container">
      <div className="home-background">
        <div className="home-text-overlay">
          <h1 className="home-title">Welcome to Wana</h1>
          <p className="home-subtitle">A new way for women to stay safe and connected.</p>
          <div className="mt-4 d-flex gap-3 flex-wrap">
            <Link to="/supervisor/dashboard" className="btn btn-warning btn-lg fw-bold px-4 shadow">
              Open Supervisor Dashboard &rarr;
            </Link>
            <Link to="/supervisor/ongoing-events" className="btn btn-outline-light btn-lg fw-semibold px-4 shadow">
              Ongoing Events
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;