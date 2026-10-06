import React from 'react';
import file from '../../assets/file.png'
import './Home.css';

const Home = () => {
  return (
    <div className="home-container">
      <div className="home-background">
        <div className="home-text-overlay">
          <h1 className="home-title">Welcome to Wana</h1>
          <p className="home-subtitle">A new way for women to stay safe and connected.</p>
        </div>
      </div>
    </div>
  );
};

export default Home;