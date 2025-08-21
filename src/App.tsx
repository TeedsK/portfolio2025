// src/App.tsx
import React from 'react';
import LandingPage from './pages/landing/LandingPage';
import './App.css';
import SiteHeader from './components/SiteHeader';

function App() {
  return (
    <>
      <SiteHeader />
      {/* Push content below the fixed header and share the same frame for alignment */}
      <div className="page-frame">
        <div className="app-container">
          <LandingPage />
        </div>
      </div>
    </>
  );
}

export default App;
