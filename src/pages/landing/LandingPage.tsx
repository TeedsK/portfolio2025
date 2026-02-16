// src/pages/landing/LandingPage.tsx
import { useEffect, useRef, useCallback, useState } from 'react';
import Hero from './sections/Hero';
import WorkExperience from './sections/WorkExperience';
import AStarCreativity from './sections/AStarCreativity';
import Projects from './sections/Projects';
import Education from './sections/Education';
import { AsciiPlanetSystem } from './components/AsciiPlanetSystem';
import { ScanBeam } from '../../types';

// NEW: ensure landing animations only run when we're actually on this page
import { useLandingAnimationGate } from './utils/landingAnimationGate.ts';

function LandingPage() {
  // This hook sets a global flag and broadcasts events other components listen to.
  // It returns the current "active" state as well, which you could pass down if desired.
  // Even if you don't use the return value here, the side-effects guard all animations app-wide.
  useLandingAnimationGate();

  // Refs for section boundaries
  const heroRef = useRef<HTMLDivElement>(null);
  const workExperienceRef = useRef<HTMLDivElement>(null);
  const planetContainerRef = useRef<HTMLDivElement>(null);

  // Scroll progress for snake orbital -> free-roaming transition (0 = orbital, >0.3 = free)
  const [scrollProgress, setScrollProgress] = useState(0);

  // Container dimensions for planet system
  const [containerDims, setContainerDims] = useState({ width: 800, height: 1400 });

  // Beams passed up from Hero for planet impacts
  const [activeBeams, setActiveBeams] = useState<ScanBeam[]>([]);

  // Calculate scroll progress based on viewport position within Hero section
  const updateScrollProgress = useCallback(() => {
    if (!heroRef.current) return;

    const heroRect = heroRef.current.getBoundingClientRect();
    const heroHeight = heroRect.height;

    if (heroHeight <= 0) return;

    // Calculate how much of the hero has scrolled past the top of the viewport
    // scrollProgress = 0 when hero top is at viewport top
    // scrollProgress = 1 when hero bottom is at viewport top
    const scrolled = -heroRect.top;
    const progress = Math.max(0, Math.min(1, scrolled / heroHeight));

    setScrollProgress(progress);
  }, []);

  // Listen to scroll events
  useEffect(() => {
    updateScrollProgress();
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress, { passive: true });
    return () => {
      window.removeEventListener('scroll', updateScrollProgress);
      window.removeEventListener('resize', updateScrollProgress);
    };
  }, [updateScrollProgress]);

  // Measure container for planet system
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

  // Callback for Hero to update beams
  const handleBeamsUpdate = useCallback((beams: ScanBeam[]) => {
    setActiveBeams(beams);
  }, []);

  return (
    <>
      {/* Wrapper for Hero and WorkExperience */}
      <div style={{ position: 'relative' }}>
        {/* ASCII Planet System overlay - spans Hero + WorkExperience */}
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
            overflow: 'hidden',
          }}
        >
          <AsciiPlanetSystem
            scrollProgress={scrollProgress}
            activeBeams={activeBeams}
            width={containerDims.width}
            height={containerDims.height}
          />
        </div>

        <div ref={heroRef}>
          <Hero onBeamsUpdate={handleBeamsUpdate} />
        </div>
        <div ref={workExperienceRef}>
          <WorkExperience />
        </div>
      </div>
      {/* Height now randomizes on mount & animates with GSAP */}
      <AStarCreativity />
      <Projects />
      <Education />
    </>
  );
}

export default LandingPage;
