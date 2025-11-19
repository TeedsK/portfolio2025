// src/pages/landing/LandingPage.tsx
import React from 'react';
import Hero from './sections/Hero';
import WorkExperience from './sections/WorkExperience';
import AStarCreativity from './sections/AStarCreativity';
import Projects from './sections/Projects';

// NEW: ensure landing animations only run when we're actually on this page
import { useLandingAnimationGate } from './utils/landingAnimationGate.ts';

function LandingPage() {
  // This hook sets a global flag and broadcasts events other components listen to.
  // It returns the current "active" state as well, which you could pass down if desired.
  // Even if you don't use the return value here, the side-effects guard all animations app-wide.
  useLandingAnimationGate();

  return (
    <>
      <Hero />
      <WorkExperience />
      {/* Height now randomizes on mount & animates with GSAP */}
      <AStarCreativity />
      <Projects />
    </>
  );
}

export default LandingPage;
