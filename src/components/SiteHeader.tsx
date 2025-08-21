// src/components/SiteHeader.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import styles from './SiteHeader.module.css';

type MenuKey = 'experience' | 'projects' | null;

type DDItem = {
  label: string;
  href: string;
  sub: string;
  img: string;
  desc: string;
};

const EXPERIENCE_ITEMS: DDItem[] = [
  {
    label: 'Goldman Sachs',
    href: '/experience/goldman-sachs',
    sub: 'Software & ML',
    img: '/images/dropdowns/exp_gs.jpg',
    desc:
      'Summer analyst work in ML infrastructure & tooling.\n' +
      'Shipped reliable data + compute pipelines.',
  },
  {
    label: 'University of Utah',
    href: '/experience/university-of-utah',
    sub: 'Teaching & Research',
    img: '/images/dropdowns/exp_uofu.jpg',
    desc:
      'Instruction + lab research across applied ML and systems.\n' +
      'Mentored project‑based learning.',
  },
  {
    label: 'Rodina Consulting',
    href: '/experience/rodina-consulting',
    sub: 'Founder',
    img: '/images/dropdowns/exp_rodina.jpg',
    desc:
      'Built client portal and analytics stacks for SMBs.\n' +
      'Focus on clean data flows and UX.',
  },
  {
    label: 'Tippett Studio',
    href: '/experience/tippett-studio',
    sub: 'Engineering',
    img: '/images/dropdowns/exp_tippett.jpg',
    desc:
      'Production‑adjacent engineering for digital pipelines.\n' +
      'Emphasis on performance + tooling.',
  },
];

const PROJECT_ITEMS: DDItem[] = [
  {
    label: 'SmartLinked',
    href: '/projects/smartlinked',
    sub: 'AI LinkedIn toolkit',
    img: '/images/dropdowns/proj_smartlinked.jpg',
    desc:
      'Assistive authoring, profile insights, and cold‑start messages.\n' +
      'Built for iteration speed.',
  },
  {
    label: 'Kudo Tools',
    href: '/projects/kudo-tools',
    sub: 'Frontend + backend suite',
    img: '/images/dropdowns/proj_kudo.jpg',
    desc:
      'Utility bundle for fast UI prototyping, typed APIs,\n' +
      'and deploy‑ready scaffolds.',
  },
  {
    label: 'HoloClean',
    href: '/projects/holoclean',
    sub: 'Probabilistic data repair',
    img: '/images/dropdowns/proj_holoclean.jpg',
    desc:
      'Constraint‑aware cleaning with weak supervision.\n' +
      'Strong baselines on messy tables.',
  },
  {
    label: 'OCR Playground',
    href: '/projects/ocr-playground',
    sub: 'Neural OCR demo',
    img: '/images/dropdowns/proj_ocr.jpg',
    desc:
      'Tiny CNN with live character flow and activation viz.\n' +
      'Optimized for clarity and feel.',
  },
  {
    label: 'GraphPilot',
    href: '/projects/graphpilot',
    sub: 'LangGraph + Gremlin',
    img: '/images/dropdowns/proj_graphpilot.jpg',
    desc:
      'Composable graph workflows for agents;\n' +
      'testing + observability built‑in.',
  },
  {
    label: 'Rodina Client Portal',
    href: '/projects/rodina-portal',
    sub: 'Accounting SaaS',
    img: '/images/dropdowns/proj_rodina.jpg',
    desc:
      'Multi‑tenant portal with role‑based access and secure docs.\n' +
      'Zero‑friction onboarding.',
  },
];

const BREAKPOINT = 720;
const OPEN_DELAY = 90;    // ms
const CLOSE_DELAY = 120;  // ms

const SiteHeader: React.FC = () => {
  const [active, setActive] = useState<MenuKey>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [winW, setWinW] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  const [scrolled, setScrolled] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.scrollY > 0 : false
  );

  const isMobile = winW <= BREAKPOINT;

  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    const onScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Refs / timers / state gates
  const headerRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const ddRef = useRef<HTMLDivElement | null>(null);
  const arrowExpRef = useRef<HTMLImageElement | null>(null);
  const arrowProjRef = useRef<HTMLImageElement | null>(null);

  const ddTL = useRef<gsap.core.Timeline | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const disarmRef = useRef<boolean>(false); // true while hovering *non‑allowed* zones

  // Build dropdown timeline once
  useEffect(() => {
    if (!ddRef.current) return;
    ddTL.current = gsap
      .timeline({ paused: true, defaults: { ease: 'power2.out' } })
      .set(ddRef.current, { pointerEvents: 'auto' }, 0)
      .fromTo(
        ddRef.current,
        { autoAlpha: 0, y: -8, rotateX: 6, filter: 'blur(8px)' },
        { autoAlpha: 1, y: 0, rotateX: 0, filter: 'blur(0px)', duration: 0.24 }
      );

    gsap.set(ddRef.current, {
      autoAlpha: 0,
      y: -8,
      rotateX: 6,
      filter: 'blur(8px)',
      transformOrigin: 'top center',
      pointerEvents: 'none',
    });

    ddTL.current.eventCallback('onReverseComplete', () => {
      if (ddRef.current) gsap.set(ddRef.current, { pointerEvents: 'none' });
    });
  }, []);

  // Cancel helpers
  const cancelOpenIntent = () => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };
  const cancelCloseIntent = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Immediate hide (prevents one‑frame flash)
  const forceHideDropdown = () => {
    setActive(null);
    rotateArrows(null);
    ddTL.current?.pause(0).progress(0);
    if (ddRef.current) {
      gsap.set(ddRef.current, {
        autoAlpha: 0,
        y: -8,
        rotateX: 6,
        filter: 'blur(8px)',
        pointerEvents: 'none',
      });
    }
  };

  // Arrow rotate helpers
  const rotateArrows = (key: MenuKey) => {
    gsap.to([arrowExpRef.current, arrowProjRef.current], {
      rotate: 0,
      duration: 0.18,
      overwrite: 'auto',
    });
    const target =
      key === 'experience'
        ? arrowExpRef.current
        : key === 'projects'
        ? arrowProjRef.current
        : null;
    if (target) gsap.to(target, { rotate: 180, duration: 0.18, overwrite: 'auto' });
  };

  // For any non‑trigger area (brand, plain tabs, resume, gaps)
  const suppressDropdown = () => {
    disarmRef.current = true;  // block opens while in non‑allowed zones
    cancelOpenIntent();
    cancelCloseIntent();
    forceHideDropdown();
  };

  const openDropdown = (key: MenuKey) => {
    if (isMobile) return;
    if (key !== 'experience' && key !== 'projects') return;
    cancelCloseIntent();
    cancelOpenIntent();

    openTimer.current = window.setTimeout(() => {
      // double‑check *right before* opening to avoid races
      if (disarmRef.current) return;
      setActive(key);
      rotateArrows(key);
      if (ddRef.current) gsap.set(ddRef.current, { pointerEvents: 'auto' });

      ddTL.current?.play(0);

      if (ddRef.current) {
        const grid = ddRef.current.querySelector(`.${styles.gridContainer}`);
        if (grid) {
          gsap.fromTo(
            grid as HTMLElement,
            { autoAlpha: 0, y: 4 },
            { autoAlpha: 1, y: 0, duration: 0.18, ease: 'power1.out' }
          );
        }
      }
    }, OPEN_DELAY);
  };

  const closeDropdown = (immediate = false) => {
    if (isMobile) return;
    cancelOpenIntent();
    cancelCloseIntent();

    const doClose = () => {
      rotateArrows(null);
      setActive(null);
      if (immediate) {
        ddTL.current?.reverse(0);
      } else {
        ddTL.current?.reverse();
      }
    };

    if (immediate) doClose();
    else closeTimer.current = window.setTimeout(doClose, CLOSE_DELAY);
  };

  // --- Capturing guard on the entire header ---
  // Allowed zones: triggers (Experience/Projects) OR the dropdown surface itself.
  useEffect(() => {
    const host = headerRef.current;
    if (!host) return;

    const onPointerOverCapture = (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;

      const isTrigger = !!t.closest<HTMLElement>('[data-dd-trigger="true"]');
      const isDDSurface = !!t.closest<HTMLElement>('[data-dd-surface="true"]');

      if (isTrigger || isDDSurface) {
        // Allowed region → (re)arm opening
        disarmRef.current = false;
        return;
      }

      // Any other header region → kill opens immediately, hard‑hide
      suppressDropdown();
    };

    host.addEventListener('pointerover', onPointerOverCapture, true);
    return () => host.removeEventListener('pointerover', onPointerOverCapture, true);
  }, []);

  // Reset disarm on leaving the nav entirely (desktop)
  const handleNavMouseLeave = () => {
    disarmRef.current = false;
    closeDropdown();
  };

  // Also ensure timers are cleared on unmount
  useEffect(() => {
    return () => {
      cancelOpenIntent();
      cancelCloseIntent();
    };
  }, []);

  const dropdownItems = useMemo<DDItem[]>(() => {
    if (active === 'experience') return EXPERIENCE_ITEMS;
    if (active === 'projects') return PROJECT_ITEMS;
    return [];
  }, [active]);

  return (
    <header ref={headerRef} className={`${styles.headerWrap} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.headerInner}>
        {/* Brand (left) */}
        <div
          className={styles.brandArea}
          onMouseEnter={suppressDropdown}
          onFocus={suppressDropdown}
        >
          <a href="/" className={styles.brandText}>ttkremer</a>
        </div>

        {/* Center nav (desktop only) */}
        {!isMobile && (
          <nav ref={navRef} className={styles.nav} onMouseLeave={handleNavMouseLeave}>
            {/* Experience (dropdown trigger) */}
            <div
              className={styles.navItem}
              data-dd-trigger="true"
              onMouseEnter={() => openDropdown('experience')}
              onFocus={() => openDropdown('experience')}
              aria-haspopup="true"
              aria-expanded={active === 'experience'}
            >
              <a className={styles.link} href="/experience" onClick={(e) => e.preventDefault()}>
                Experience
                <img
                  ref={arrowExpRef}
                  alt=""
                  className={styles.linkArrow}
                  src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23142d3e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>"
                />
              </a>
            </div>

            {/* Projects (dropdown trigger) */}
            <div
              className={styles.navItem}
              data-dd-trigger="true"
              onMouseEnter={() => openDropdown('projects')}
              onFocus={() => openDropdown('projects')}
              aria-haspopup="true"
              aria-expanded={active === 'projects'}
            >
              <a className={styles.link} href="/projects" onClick={(e) => e.preventDefault()}>
                Projects
                <img
                  ref={arrowProjRef}
                  alt=""
                  className={styles.linkArrow}
                  src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23142d3e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>"
                />
              </a>
            </div>

            {/* Plain links — never open dropdown and actively suppress */}
            <a
              className={styles.linkPlain}
              href="/education"
              onMouseEnter={suppressDropdown}
              onFocus={suppressDropdown}
            >
              Education
            </a>
            <a
              className={styles.linkPlain}
              href="/about"
              onMouseEnter={suppressDropdown}
              onFocus={suppressDropdown}
            >
              About me
            </a>
            <a
              className={styles.linkPlain}
              href="/contact"
              onMouseEnter={suppressDropdown}
              onFocus={suppressDropdown}
            >
              Contact
            </a>

            {/* Shared dropdown surface — stays open when hovered */}
            <div
              ref={ddRef}
              data-dd-surface="true"
              className={`${styles.dropdownContent} ${active ? styles.open : ''}`}
              role="menu"
              aria-hidden={!active}
              onMouseEnter={() => {
                // While hovering the panel, keep it alive
                cancelCloseIntent();
                disarmRef.current = false;
              }}
              onMouseLeave={() => closeDropdown()}
            >
              {!!active && (
                <div className={styles.gridContainer}>
                  {dropdownItems.map((it) => (
                    <a key={it.label} href={it.href} className={styles.gridItem}>
                      <div className={styles.gridThumbWrap} aria-hidden>
                        <img className={styles.gridThumb} src={it.img} alt={`${it.label} thumbnail`} />
                      </div>
                      <div className={styles.gridText}>
                        <span className={styles.gridTitle}>{it.label}</span>
                        <span className={styles.gridSubtle}>{it.sub}</span>
                        <p className={styles.gridDesc}>
                          {it.desc.split('\n').map((line, i) => (
                            <span key={i} style={{ display: 'block' }}>{line}</span>
                          ))}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </nav>
        )}

        {/* Right actions */}
        {!isMobile && (
          <div
            className={styles.rightArea}
            onMouseEnter={suppressDropdown}
            onFocus={suppressDropdown}
          >
            <a className={styles.resumeBtn} href="/resume">Resume</a>
          </div>
        )}

        {/* Mobile hamburger */}
        {isMobile && (
          <div className={styles.hamburgerWrap}>
            <button
              className={styles.hamburgerBtn}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>

            <div className={`${styles.mobilePanel} ${menuOpen ? styles.mobilePanelOpen : ''}`}>
              <div className={styles.mobileSection}>
                <div className={styles.mobileHeading}>Experience</div>
                <ul className={styles.mobileList}>
                  {EXPERIENCE_ITEMS.map((it) => (
                    <li key={it.label}><a href={it.href}>{it.label}</a></li>
                  ))}
                </ul>
              </div>

              <div className={styles.mobileSection}>
                <div className={styles.mobileHeading}>Projects</div>
                <ul className={styles.mobileList}>
                  {PROJECT_ITEMS.map((it) => (
                    <li key={it.label}><a href={it.href}>{it.label}</a></li>
                  ))}
                </ul>
              </div>

              <div className={styles.mobileSection}>
                <ul className={styles.mobileList}>
                  <li><a href="/education">Education</a></li>
                  <li><a href="/about">About me</a></li>
                  <li><a href="/contact">Contact</a></li>
                </ul>
              </div>

              <div className={styles.mobileFooter}>
                <a className={styles.resumeBtn} href="/resume">Resume</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default SiteHeader;
