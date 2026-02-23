// src/pages/landing/LandingPage.tsx
import { useEffect, useRef, useCallback, useState } from 'react';
import Hero from './sections/Hero';
import WorkExperience from './sections/WorkExperience';
import AStarCreativity from './sections/AStarCreativity';
import Projects from './sections/Projects';
import Education from './sections/Education';
import AboutMe from './sections/AboutMe';
import { AsciiPlanetSystem } from './components/AsciiPlanetSystem';

// Ensure landing animations only run when we're actually on this page
import { useLandingAnimationGate } from './utils/landingAnimationGate.ts';

function LandingPage() {
  useLandingAnimationGate();

  const heroRef = useRef<HTMLDivElement>(null);
  const workExperienceRef = useRef<HTMLDivElement>(null);

  const planetContainerRef = useRef<HTMLDivElement>(null);

  const [scrollProgress, setScrollProgress] = useState(0);
  const [containerDims, setContainerDims] = useState({ width: 800, height: 1400 });

  const PLANET_X_OFFSET = 0.7;
  const PLANET_Y_OFFSET = 0.18;

  const updateScrollProgress = useCallback(() => {
    if (!heroRef.current) return;

    const heroRect = heroRef.current.getBoundingClientRect();
    const heroHeight = heroRect.height;
    if (heroHeight <= 0) return;

    const scrolled = -heroRect.top;
    const progress = Math.max(0, Math.min(1, scrolled / heroHeight));
    setScrollProgress(progress);
  }, []);

  useEffect(() => {
    updateScrollProgress();
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateScrollProgress);
      window.removeEventListener('resize', updateScrollProgress);
    };
  }, [updateScrollProgress]);

  useEffect(() => {
    const measure = () => {
      if (planetContainerRef.current) {
        const rect = planetContainerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setContainerDims({ width: rect.width, height: rect.height });
        }
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <>
      <div style={{ position: 'relative', overflowX: 'clip' as const }}>
        {/* ===== Orb canvas overlay ===== */}
        <div
          ref={planetContainerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            zIndex: 1,
            overflow: 'visible',
          }}
        >
          <AsciiPlanetSystem
            scrollProgress={scrollProgress}
            width={containerDims.width}
            height={containerDims.height}
            planetXOffset={PLANET_X_OFFSET}
            planetYOffset={PLANET_Y_OFFSET}
            planetYPixelOffset={100}
            bleed={200}
          />
        </div>

        {/* ===== Page content ===== */}
        <div ref={heroRef} style={{ position: 'relative', zIndex: 2 }}>
          <Hero />
        </div>

        <div ref={workExperienceRef} style={{ position: 'relative', zIndex: 2 }}>
          <WorkExperience />
        </div>
      </div>

      <AStarCreativity />
      <Projects />
      <Education />
      <AboutMe />
    </>
  );
}

export default LandingPage;
