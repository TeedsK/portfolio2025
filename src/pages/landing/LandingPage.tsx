// src/pages/landing/LandingPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hero from './sections/Hero';
import WorkExperience from './sections/WorkExperience';
import AStarCreativity from './sections/AStarCreativity';
import Projects from './sections/Projects';
import AsciiOrb from './components/AsciiOrb';

// NEW: ensure landing animations only run when we're actually on this page
import { useLandingAnimationGate } from './utils/landingAnimationGate.ts';

function LandingPage() {
  // This hook sets a global flag and broadcasts events other components listen to.
  // It returns the current "active" state as well, which you could pass down if desired.
  // Even if you don't use the return value here, the side-effects guard all animations app-wide.
  useLandingAnimationGate();

  // Track when neural net has faded so we can show the ASCII orbs
  const [showOrbs, setShowOrbs] = useState(false);

  // Refs for section boundaries
  const heroRef = useRef<HTMLDivElement>(null);
  const workExperienceRef = useRef<HTMLDivElement>(null);
  const orbContainerRef = useRef<HTMLDivElement>(null);

  // Scroll target for snakes (0 = top of container, 1 = bottom)
  const [scrollTargetY, setScrollTargetY] = useState(0.5);

  // Calculate scroll target based on viewport position within Hero + WorkExperience
  const updateScrollTarget = useCallback(() => {
    if (!heroRef.current || !workExperienceRef.current) return;

    const heroRect = heroRef.current.getBoundingClientRect();
    const workRect = workExperienceRef.current.getBoundingClientRect();

    // Total scrollable area is from Hero top to WorkExperience bottom
    const totalTop = heroRect.top;
    const totalBottom = workRect.bottom;
    const totalHeight = totalBottom - totalTop;

    if (totalHeight <= 0) return;

    // Calculate where the viewport center is within this range
    const viewportCenter = window.innerHeight / 2;

    // How far down is the viewport center from the top of the scrollable area?
    // When hero top is at viewport center, target = 0
    // When work experience bottom is at viewport center, target = 1
    const scrollProgress = (viewportCenter - totalTop) / totalHeight;

    // Clamp to 0-1 range
    const clamped = Math.max(0, Math.min(1, scrollProgress));
    setScrollTargetY(clamped);
  }, []);

  // Listen to scroll events
  useEffect(() => {
    updateScrollTarget();
    window.addEventListener('scroll', updateScrollTarget, { passive: true });
    window.addEventListener('resize', updateScrollTarget, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateScrollTarget);
      window.removeEventListener('resize', updateScrollTarget);
    };
  }, [updateScrollTarget]);

  // Callback for when neural net fades in Hero
  const handleNeuralNetFaded = useCallback(() => {
    setShowOrbs(true);
  }, []);

  return (
    <>
      {/* Wrapper for Hero and WorkExperience - allows orbs to span both sections */}
      <div style={{ position: 'relative' }}>
        {/* ASCII Orb container - spans Hero + WorkExperience */}
        <div
          ref={orbContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 1,
            overflow: 'hidden',
          }}
        >
          <AsciiOrb
            show={showOrbs}
            bodyLength={45}
            speed={0.7}
            baseThickness={6}
            minZ={0.15}
            maxZ={1.0}
            colorTheme="green"
            seed={42}
            followScroll={true}
            scrollTargetY={scrollTargetY}
            scrollInfluence={0.4}
          />
          <AsciiOrb
            show={showOrbs}
            bodyLength={40}
            speed={0.8}
            baseThickness={5}
            minZ={0.2}
            maxZ={0.95}
            colorTheme="pink"
            seed={137}
            followScroll={true}
            scrollTargetY={scrollTargetY}
            scrollInfluence={0.35}
          />
        </div>

        <div ref={heroRef}>
          <Hero onNeuralNetFaded={handleNeuralNetFaded} />
        </div>
        <div ref={workExperienceRef}>
          <WorkExperience />
        </div>
      </div>
      {/* Height now randomizes on mount & animates with GSAP */}
      <AStarCreativity />
      <Projects />
    </>
  );
}

export default LandingPage;
