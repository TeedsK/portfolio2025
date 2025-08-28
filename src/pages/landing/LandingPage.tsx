// src/pages/landing/LandingPage.tsx
import React from 'react';
import Hero from './sections/Hero';
import WorkExperience from './sections/WorkExperience';
import AStarCreativity from './sections/AStarCreativity';
import Projects from './sections/Projects'; // ← NEW

function LandingPage() {
  return (
    <>
      <Hero />
      <WorkExperience />
      <AStarCreativity heightPx={560} />
      <Projects /> {/* ← NEW: directly under AStarCreativity */}
    </>
  );
}

export default LandingPage;
