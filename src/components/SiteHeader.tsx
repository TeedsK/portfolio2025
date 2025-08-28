// src/components/SiteHeader.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'antd';
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

/** ---- Ask: suggestion pool ---- */
const ASK_POOL: string[] = [
  "How’d I build the AI system on the landing page?",
  "How’d I increased Goldman Sachs project onboarding from 19 to 100%?",
  "What steps did I take to outreach to 253,000 people?",
  "What’s my favorite travel spot?",
  "What tech stack powers this site?",
  "Which projects am I most proud of and why?",
  "How do I approach product design vs. engineering trade-offs?",
  "What’s my approach to learning new frameworks?",
  "Am I open to freelance consulting?",
  "How can we work together this quarter?"
];

function pickRandom<T>(arr: T[], count: number): T[] {
  const idxs = Array.from({ length: arr.length }, (_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  return idxs.slice(0, count).map(i => arr[i]);
}

/** Placeholder modes tied to browser width */
type AskVariant = 'full' | 'alt' | 'short1' | 'short2' | 'icon';
const placeholderByVariant: Record<Exclude<AskVariant, 'icon'>, string> = {
  full:   "Have a question about me? Ask my AI here",
  alt:    "Ask my AI a question about me here",
  short1: "Have a question about me?",
  short2: "Have a question?",
};
function variantFromViewport(vw: number): AskVariant {
  if (vw >= 1400) return 'full';
  if (vw >= 1100) return 'alt';
  if (vw >= 920)  return 'short1';
  if (vw >= 780)  return 'short2';
  return 'icon';
}

const SiteHeader: React.FC = () => {
  const [active, setActive] = useState<MenuKey>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [winW, setWinW] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );
  const [scrolled, setScrolled] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.scrollY > 0 : false
  );
  const askVariant = useMemo<AskVariant>(() => variantFromViewport(winW), [winW]);
  const askPlaceholder = askVariant === 'icon' ? '' : placeholderByVariant[askVariant];
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
  const disarmRef = useRef<boolean>(false);

  // Build dropdown timeline once
  useEffect(() => {
    if (!ddRef.current) return;
    ddTL.current = gsap
      .timeline({ paused: true, defaults: { ease: 'power2.out' } })
      .set(ddRef.current, { pointerEvents: 'auto' }, 0)
      .fromTo(
        ddRef.current,
        { autoAlpha: 0, y: -8, rotateX: 6 },
        { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.24 }
      );

    gsap.set(ddRef.current, {
      autoAlpha: 0,
      y: -8,
      rotateX: 6,
      transformOrigin: 'top center',
      pointerEvents: 'none',
    });

    ddTL.current.eventCallback('onReverseComplete', () => {
      if (ddRef.current) gsap.set(ddRef.current, { pointerEvents: 'none' });
    });
  }, []);

  const cancelOpenIntent = () => { if (openTimer.current) { window.clearTimeout(openTimer.current); openTimer.current = null; } };
  const cancelCloseIntent = () => { if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; } };

  const forceHideDropdown = () => {
    setActive(null);
    rotateArrows(null);
    ddTL.current?.pause(0).progress(0);
    if (ddRef.current) {
      gsap.set(ddRef.current, {
        autoAlpha: 0,
        y: -8,
        rotateX: 6,
        pointerEvents: 'none',
      });
    }
  };

  const rotateArrows = (key: MenuKey) => {
    gsap.to([arrowExpRef.current, arrowProjRef.current], { rotate: 0, duration: 0.18, overwrite: 'auto' });
    const target = key === 'experience' ? arrowExpRef.current : key === 'projects' ? arrowProjRef.current : null;
    if (target) gsap.to(target, { rotate: 180, duration: 0.18, overwrite: 'auto' });
  };

  const suppressDropdown = () => {
    disarmRef.current = true;
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
      if (disarmRef.current) return;
      setActive(key);
      rotateArrows(key);
      if (ddRef.current) gsap.set(ddRef.current, { pointerEvents: 'auto' });
      ddTL.current?.play(0);
      if (ddRef.current) {
        const grid = ddRef.current.querySelector(`.${styles.gridContainer}`);
        if (grid) {
          gsap.fromTo(grid as HTMLElement, { autoAlpha: 0, y: 2 }, { autoAlpha: 1, y: 0, duration: 0.18, ease: 'power1.out' });
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
      if (immediate) ddTL.current?.reverse(0);
      else ddTL.current?.reverse();
    };
    if (immediate) doClose();
    else closeTimer.current = window.setTimeout(doClose, CLOSE_DELAY);
  };

  // --- Capturing guard on the entire header ---
  useEffect(() => {
    const host = headerRef.current;
    if (!host) return;
    const onPointerOverCapture = (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const isTrigger = !!t.closest<HTMLElement>('[data-dd-trigger="true"]');
      const isDDSurface = !!t.closest<HTMLElement>('[data-dd-surface="true"]');
      if (isTrigger || isDDSurface) { disarmRef.current = false; return; }
      suppressDropdown();
    };
    host.addEventListener('pointerover', onPointerOverCapture, true);
    return () => host.removeEventListener('pointerover', onPointerOverCapture, true);
  }, []);

  useEffect(() => () => { cancelOpenIntent(); cancelCloseIntent(); }, []);

  const dropdownItems = useMemo<DDItem[]>(() => {
    if (active === 'experience') return EXPERIENCE_ITEMS;
    if (active === 'projects') return PROJECT_ITEMS;
    return [];
  }, [active]);

  /* ----------------------- ASK: state + refs + helpers ---------------------- */
  const [askOpen, setAskOpen] = useState(false);
  const [askValue, setAskValue] = useState('');
  const [askActiveIdx, setAskActiveIdx] = useState<number>(-1);
  const [askSuggestions, setAskSuggestions] = useState<string[]>([]);
  const [askFlyoutOpen, setAskFlyoutOpen] = useState(false); // icon mode flyout

  // shared refs (inline + flyout)
  const askWrapRef = useRef<HTMLDivElement | null>(null);
  const askInputRef = useRef<HTMLInputElement | null>(null);
  const askSubmitRef = useRef<HTMLButtonElement | null>(null);
  const askDropdownRef = useRef<HTMLDivElement | null>(null);
  const askIconRef = useRef<HTMLButtonElement | null>(null);
  const askFlyoutRef = useRef<HTMLDivElement | null>(null);

  const askTL = useRef<gsap.core.Timeline | null>(null);
  const askFlyTL = useRef<gsap.core.Timeline | null>(null);
  const submitShownRef = useRef<boolean>(false);

  const positionAskDropdown = () => {
    if (!askWrapRef.current || !askDropdownRef.current) return;
    const rect = askWrapRef.current.getBoundingClientRect();
    askDropdownRef.current.style.left = `${Math.round(rect.left)}px`;
    askDropdownRef.current.style.top = `${Math.round(rect.bottom + 8)}px`;
    askDropdownRef.current.style.width = `${Math.round(rect.width)}px`;
  };

  useEffect(() => {
    const node = askDropdownRef.current;
    if (!node || askTL.current) return;
    askTL.current = gsap.timeline({ paused: true })
      .set(node, { pointerEvents: 'auto' }, 0)
      .fromTo(node, { autoAlpha: 0, y: -6, rotateX: 3 }, { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.2, ease: 'power2.out' });
    gsap.set(node, { autoAlpha: 0, y: -6, rotateX: 3, transformOrigin: 'top center', pointerEvents: 'none' });
    return () => { askTL.current?.kill(); askTL.current = null; };
  }, [askDropdownRef.current]);

  useEffect(() => {
    if (!askOpen) return;
    positionAskDropdown();
    const onResize = () => positionAskDropdown();
    const onScroll = () => positionAskDropdown();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [askOpen]);

  const positionAskFlyout = () => {
    if (!askIconRef.current || !askFlyoutRef.current) return;
    const rect = askIconRef.current.getBoundingClientRect();
    const fly = askFlyoutRef.current;
    const width = Math.round(Math.min(520, Math.max(320, window.innerWidth * 0.72)));
    fly.style.left = `${Math.round(Math.min(rect.left, window.innerWidth - width - 8))}px`;
    fly.style.top = `${Math.round(rect.bottom + 8)}px`;
    fly.style.width = `${width}px`;
  };

  useEffect(() => {
    if (!askFlyoutOpen) return;
    positionAskFlyout();
    const onResize = () => positionAskFlyout();
    const onScroll = () => positionAskFlyout();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [askFlyoutOpen]);

  useEffect(() => {
    const node = askFlyoutRef.current;
    if (!node || askFlyTL.current) return;
    askFlyTL.current = gsap.timeline({ paused: true })
      .set(node, { pointerEvents: 'auto' }, 0)
      .fromTo(node, { autoAlpha: 0, y: -6, scale: 0.98 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.22, ease: 'power2.out' });
    gsap.set(node, { autoAlpha: 0, y: -6, scale: 0.98, pointerEvents: 'none' });
    return () => { askFlyTL.current?.kill(); askFlyTL.current = null; };
  }, [askFlyoutRef.current]);

  const openAsk = () => {
    if (!askWrapRef.current) return;
    setAskOpen(true);
    requestAnimationFrame(() => {
      positionAskDropdown();
      askTL.current?.play(0);
    });
  };
  const closeAsk = () => {
    askTL.current?.reverse();
    setAskActiveIdx(-1);
    setAskOpen(false);
    if (askFlyoutOpen) {
      askFlyTL.current?.reverse();
      setAskFlyoutOpen(false);
    }
  };

  const setSubmitVisible = (show: boolean) => {
    if (!askSubmitRef.current) return;
    if (submitShownRef.current === show) return;
    submitShownRef.current = show;
    gsap.to(askSubmitRef.current, {
      scale: show ? 1 : 0,
      autoAlpha: show ? 1 : 0,
      duration: 0.2,
      ease: 'power2.out',
    });
  };
  useEffect(() => { setSubmitVisible(askValue.trim().length > 0); }, [askValue]);

  useEffect(() => {
    if (!askOpen && !askFlyoutOpen) return;
    const onDocDown = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      const inWrap = !!t.closest(`.${styles.askWrap}`);
      const inDD = askDropdownRef.current?.contains(t);
      const inFly = askFlyoutRef.current?.contains(t);
      if (!inWrap && !inDD && !inFly) closeAsk();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { closeAsk(); askInputRef.current?.blur(); }
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [askOpen, askFlyoutOpen]);

  const refreshAskSuggestions = () => {
    setAskSuggestions(pickRandom(ASK_POOL, 4));
    setAskActiveIdx(-1);
  };

  const applySuggestion = (s: string) => {
    setAskValue(s);
    closeAsk();
    askInputRef.current?.focus();
  };

  const handleAskKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!askOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      refreshAskSuggestions(); openAsk(); return;
    }
    if (!askOpen) {
      if (e.key === 'Enter' && askValue.trim()) {
        window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`;
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setAskActiveIdx((idx) => Math.min(askSuggestions.length - 1, idx + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setAskActiveIdx((idx) => Math.max(-1, idx - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (askActiveIdx >= 0) applySuggestion(askSuggestions[askActiveIdx]);
      else if (askValue.trim()) window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`;
    } else if (e.key === 'Escape') {
      e.preventDefault(); closeAsk();
    }
  };

  const askDropdown = askOpen
    ? createPortal(
        <div
          id="ask-dropdown"
          ref={askDropdownRef}
          className={styles.askDropdown}
          role="listbox"
          aria-label="Example questions about Theo Kremer"
          style={{ zIndex: 4000, position: 'fixed' }}
        >
          {askSuggestions.map((q, i) => (
            <div
              key={`${q}-${i}`}
              role="option"
              aria-selected={askActiveIdx === i}
              className={`${styles.askItem} ${askActiveIdx === i ? styles.askItemActive : ''}`}
              onMouseEnter={() => setAskActiveIdx(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySuggestion(q)}
              title={q}
            >
              {q}
            </div>
          ))}
        </div>,
        document.body
      )
    : null;

  const onAskSubmit = () => {
    if (!askValue.trim()) return;
    window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`;
  };

  // Icon-mode flyout (input rendered in a body portal)
  const askFlyout = askFlyoutOpen
    ? createPortal(
        <div ref={askFlyoutRef} className={styles.askFlyout} style={{ position: 'fixed', zIndex: 4050 }}>
          <div
            ref={askWrapRef}
            className={`${styles.askWrap} ${styles.askFlyoutWrap}`}
            onMouseDown={() => {
              refreshAskSuggestions();
              requestAnimationFrame(() => {
                openAsk();
                askInputRef.current?.focus();
              });
            }}
          >
            <input
              ref={askInputRef}
              type="text"
              className={styles.askField}
              placeholder={askPlaceholder || "Ask my AI a question about me here"}
              value={askValue}
              onChange={(e) => setAskValue(e.target.value)}
              onFocus={() => { refreshAskSuggestions(); openAsk(); }}
              onKeyDown={handleAskKeyDown}
              aria-expanded={askOpen}
              aria-controls="ask-dropdown"
            />
            
            <button
              ref={askSubmitRef}
              type="button"
              className={styles.askSubmit}
              aria-label="Submit question"
              onClick={onAskSubmit}
            >
              <span className={styles.askSubmitLabel}>Ask</span>
              <svg className={styles.askSubmitIcon} width="18" height="18" viewBox="0 0 24 24"
                   fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <header ref={headerRef} className={`${styles.headerWrap} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.headerInner}>
        {/* Brand (left) */}
        <div className={styles.brandArea} onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
          <a href="/" className={styles.brandText}>ttkremer.com</a>
        </div>

        {/* Center nav (desktop only) */}
        {!isMobile && (
          <nav ref={navRef} className={styles.nav} onMouseLeave={() => closeDropdown()}>
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

            <a className={styles.linkPlain} href="/education" onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
              Education
            </a>
            <a className={styles.linkPlain} href="/about" onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
              About me
            </a>
            <a className={styles.linkPlain} href="/contact" onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
              Contact
            </a>

            <div
              ref={ddRef}
              data-dd-surface="true"
              className={`${styles.dropdownContent} ${active ? styles.open : ''}`}
              role="menu"
              aria-hidden={!active}
              onMouseEnter={() => { cancelCloseIntent(); disarmRef.current = false; }}
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

        {/* --- ENSURED SPACER: guarantees >= 75px blank space --- */}
        {!isMobile && <div className={styles.navRightSpacer} aria-hidden="true" />}

        {/* Right actions */}
        {!isMobile && (
          <div className={styles.rightArea} onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
            {/* Ask: dynamic placeholder / icon mode */}
            {askVariant !== 'icon' ? (
              <div
                ref={askWrapRef}
                className={styles.askWrap}
                onMouseDown={() => {
                  refreshAskSuggestions();
                  openAsk();
                  requestAnimationFrame(() => askInputRef.current?.focus());
                }}
              >
                <input
                  ref={askInputRef}
                  type="text"
                  className={styles.askField}
                  placeholder={askPlaceholder}
                  value={askValue}
                  onChange={(e) => setAskValue(e.target.value)}
                  onFocus={() => { refreshAskSuggestions(); openAsk(); }}
                  onKeyDown={handleAskKeyDown}
                  aria-expanded={askOpen}
                  aria-controls="ask-dropdown"
                />
                <Button
              ref={askSubmitRef}
              type="primary"
              className={styles.askSubmit}
              aria-label="Submit question"
              onClick={onAskSubmit}
            >
              <span className={styles.askSubmitLabel}>Ask</span>
              <svg className={styles.askSubmitIcon} width="18" height="18" viewBox="0 0 24 24"
                   fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </Button>
              </div>
            ) : (
              <>
                <button
                  ref={askIconRef}
                  type="button"
                  aria-label="Ask a question"
                  className={styles.askIconBtn}
                  onClick={() => {
                    setAskFlyoutOpen(true);
                    refreshAskSuggestions();
                    requestAnimationFrame(() => {
                      positionAskFlyout();
                      askFlyTL.current?.play(0);
                      askInputRef.current?.focus();
                      openAsk();
                    });
                  }}
                >
                  ?
                </button>
                {askFlyout}
              </>
            )}

            {/* Resume: Ant Design primary button */}
            <Button type="text" className={styles.resumeBtnAntd} href="/resume">
              My Resume
            </Button>
          </div>
        )}
      </div>

      {/* Ask dropdown via portal (independent overlay) */}
      {askDropdown}
    </header>
  );
};

export default SiteHeader;
