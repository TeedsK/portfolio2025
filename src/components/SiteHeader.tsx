// src/components/SiteHeader.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'antd';
import gsap from 'gsap';
import styles from './SiteHeader.module.css';

import useNavHover from './header/useNavHover';
import useDropdownHeight from './header/useDropdownHeight';
import useDropdownSwap from './header/useDropdownSwap';
import { EXPERIENCE_ITEMS, PROJECT_ITEMS, type DDItem } from './header/ddData';

type MenuKey = 'experience' | 'projects' | null;

const BREAKPOINT = 720;
const OPEN_DELAY = 90;     // ms
const CLOSE_DELAY = 220;   // forgiving gap crossing

/* ---- Ask suggestions ---- */
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
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function itemsFor(key: MenuKey): DDItem[] {
  if (key === 'experience') return EXPERIENCE_ITEMS;
  if (key === 'projects') return PROJECT_ITEMS;
  return [];
}

type AskVariant = 'full' | 'alt' | 'short1' | 'short2' | 'icon';
const placeholderByVariant: Record<Exclude<AskVariant, 'icon'>, string> = {
  full: "Have a question about me? Ask my AI here",
  alt: "Ask my AI a question about me here",
  short1: "Have a question about me?",
  short2: "Have a question?",
};
function variantFromViewport(vw: number): AskVariant {
  if (vw >= 1400) return 'full';
  if (vw >= 1100) return 'alt';
  if (vw >= 920) return 'short1';
  if (vw >= 780) return 'short2';
  return 'icon';
}

const SiteHeader: React.FC = () => {
  const [active, setActive] = useState<MenuKey>(null);
  const [prevKey, setPrevKey] = useState<MenuKey>(null); // overlay grid
  const [winW, setWinW] = useState<number>(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
  const [scrolled, setScrolled] = useState<boolean>(() => (typeof window !== 'undefined' ? window.scrollY > 0 : false));
  const askVariant = useMemo<AskVariant>(() => variantFromViewport(winW), [winW]);
  const askPlaceholder = askVariant === 'icon' ? '' : placeholderByVariant[askVariant];
  const isMobile = winW <= BREAKPOINT;

  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    const onScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll); };
  }, []);

  // --- Refs ----
  const headerRef = useRef<HTMLElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  const ddRef = useRef<HTMLDivElement | null>(null);        // container animates HEIGHT
  const ddInnerRef = useRef<HTMLDivElement | null>(null);    // not used for measure anymore, but kept for structure
  const outgoingRef = useRef<HTMLDivElement | null>(null);   // overlay grid
  const incomingRef = useRef<HTMLDivElement | null>(null);   // **measurement target**

  const gapBridgeRef = useRef<HTMLDivElement | null>(null);  // outside bridge (not clipped)

  const arrowExpRef = useRef<HTMLImageElement | null>(null);
  const arrowProjRef = useRef<HTMLImageElement | null>(null);

  // Appear/disappear TL (opacity/translate/rotate only)
  const ddTL = useRef<gsap.core.Timeline | null>(null);

  // timers / guards
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const disarmRef = useRef<boolean>(false);
  const isOpenRef = useRef<boolean>(false);

  // Hooks
  useNavHover(navRef);
  const heightCtl = useDropdownHeight(ddRef); // now measures the *incoming grid*
  const swapCtl = useDropdownSwap();

  // --- Dropdown appear TL
  useEffect(() => {
    const wrap = ddRef.current;
    if (!wrap) return;

    const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } })
      .set(wrap, { pointerEvents: 'auto' }, 0)
      .fromTo(
        wrap,
        { autoAlpha: 0, y: -8, rotateX: 6 },
        { autoAlpha: 1, y: 0, rotateX: 0, duration: 0.24 }
      );

    ddTL.current = tl;

    gsap.set(wrap, {
      autoAlpha: 0,
      y: -8,
      rotateX: 6,
      transformOrigin: 'top center',
      pointerEvents: 'none',
      height: '0px',
    });

    tl.eventCallback('onReverseComplete', () => {
      gsap.set(wrap, { pointerEvents: 'none' });
      isOpenRef.current = false;
    });

    return () => { tl.kill(); ddTL.current = null; };
  }, []);

  // utils
  const cancelOpenIntent = () => { if (openTimer.current) { window.clearTimeout(openTimer.current); openTimer.current = null; } };
  const cancelCloseIntent = () => { if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; } };

  const rotateArrows = (key: MenuKey) => {
    gsap.to([arrowExpRef.current, arrowProjRef.current], { rotate: 0, duration: 0.18, overwrite: 'auto' });
    const target = key === 'experience' ? arrowExpRef.current : key === 'projects' ? arrowProjRef.current : null;
    if (target) gsap.to(target, { rotate: 180, duration: 0.18, overwrite: 'auto' });
  };

  const forceHideDropdown = () => {
    const wrap = ddRef.current;
    const tl = ddTL.current;
    setActive(null);
    setPrevKey(null);
    rotateArrows(null);
    swapCtl.kill();

    if (wrap) {
      const prev = wrap.style.transition;
      wrap.style.transition = 'none';
      gsap.set(wrap, { autoAlpha: 0, y: -8, rotateX: 6, pointerEvents: 'none', height: '0px' });
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      wrap.offsetHeight;
      wrap.style.transition = prev;
    }

    heightCtl.detachWatchers();
    tl?.pause(0).progress(0);
    isOpenRef.current = false;
  };

  const suppressDropdown = () => {
    disarmRef.current = true;
    cancelOpenIntent();
    cancelCloseIntent();
    forceHideDropdown();
  };

  // ----- OPEN / SWITCH / CLOSE ---------------------------------------------
  const openFromHidden = (key: Exclude<MenuKey, null>) => {
    const tl = ddTL.current;
    if (!tl) return;

    setPrevKey(null);
    setActive(key);
    rotateArrows(key);

    // Ensure the *incoming grid* is our measurement target,
    // then animate 0 -> content height
    requestAnimationFrame(() => {
      heightCtl.setMeasureEl(incomingRef.current || null);
      heightCtl.openFromHidden();

      isOpenRef.current = true;
      tl.play(0);

      // entrance animation for the first render
      const items = ddRef.current?.querySelectorAll<HTMLElement>(`.${styles.gridItem}`);
      if (items && items.length) {
        gsap.fromTo(
          items,
          { autoAlpha: 0, y: 12, scale: 0.98 },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.24, ease: 'power2.out', stagger: 0.02 }
        );
      }
    });
  };

  const switchWhileOpen = (key: Exclude<MenuKey, null>) => {
    const wrap = ddRef.current;
    const tl = ddTL.current;
    if (!wrap) return;

    tl?.pause();
    gsap.set(wrap, { autoAlpha: 1, y: 0, rotateX: 0, pointerEvents: 'auto' });

    setPrevKey(active);
    setActive(key);
    rotateArrows(key);

    // On next frame, measure ONLY the incoming grid and animate to its height,
    // then play the scroll-like swap.
    requestAnimationFrame(() => {
      heightCtl.setMeasureEl(incomingRef.current || null);
      heightCtl.animateToContent();

      const outItems = outgoingRef.current?.querySelectorAll<HTMLElement>(`.${styles.gridItem}`) ?? null;
      const inItems = incomingRef.current?.querySelectorAll<HTMLElement>(`.${styles.gridItem}`) ?? null;
      swapCtl.play(outItems, inItems, () => setPrevKey(null));
    });
  };

  const openDropdown = (key: MenuKey) => {
    if (isMobile) return;
    if (key !== 'experience' && key !== 'projects') return;

    cancelCloseIntent();
    cancelOpenIntent();

    openTimer.current = window.setTimeout(() => {
      if (disarmRef.current) return;
      const tl = ddTL.current;
      const wrap = ddRef.current;
      if (!tl || !wrap) return;

      const progress = tl.progress();
      const isReversing = tl.reversed() && tl.isActive() && progress > 0;
      const isFullyHidden = progress === 0 && !tl.isActive() && wrap.style.pointerEvents === 'none';

      if (active === key) {
        rotateArrows(key);
        if (isReversing) {
          tl.play();
          requestAnimationFrame(() => {
            heightCtl.setMeasureEl(incomingRef.current || null);
            heightCtl.animateToContent();
          });
        } else if (isFullyHidden) {
          openFromHidden(key);
        }
        return;
      }

      if (!isFullyHidden && (progress > 0 || tl.isActive() || isOpenRef.current)) {
        switchWhileOpen(key);
        return;
      }

      openFromHidden(key);
    }, OPEN_DELAY);
  };

  const closeDropdown = (immediate = false) => {
    if (isMobile) return;
    cancelOpenIntent();
    cancelCloseIntent();

    const doClose = () => {
      rotateArrows(null);
      swapCtl.kill();
      setPrevKey(null);

      if (!ddTL.current) return;
      heightCtl.closeToZero(); // height -> 0 (CSS anim)

      if (immediate) {
        ddTL.current.reverse(0);
        isOpenRef.current = false;
      } else {
        ddTL.current.reverse();
        isOpenRef.current = false;
      }
    };

    if (immediate) doClose();
    else closeTimer.current = window.setTimeout(doClose, CLOSE_DELAY);
  };

  // ---- GAP BRIDGE & GLOBAL CAPTURE ----------------------------------------
  // External bridge element (NOT inside dropdown, so not clipped by overflow).
  const handleNavMouseLeave: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && (ddRef.current?.contains(next) || navRef.current?.contains(next))) {
      return; // moving into dropdown or staying within nav — keep open
    }
    closeDropdown();
  };

  useEffect(() => {
    const host = headerRef.current;
    if (!host) return;
    const onPointerOverCapture = (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const isTrigger = !!t.closest<HTMLElement>('[data-dd-trigger="true"]');
      const isSurface = !!t.closest<HTMLElement>('[data-dd-surface="true"]');
      const isKeep = !!t.closest<HTMLElement>('[data-dd-keepalive="true"]');
      if (isTrigger || isSurface || isKeep) { disarmRef.current = false; return; }
      suppressDropdown();
    };
    host.addEventListener('pointerover', onPointerOverCapture, true);
    return () => host.removeEventListener('pointerover', onPointerOverCapture, true);
  }, []);

  // --- Cleanup
  useEffect(() => () => {
    cancelOpenIntent();
    cancelCloseIntent();
    heightCtl.detachWatchers();
    swapCtl.kill();
  }, []);

  // --- Active items
  const dropdownItems = useMemo<DDItem[]>(() => itemsFor(active), [active]);

  /* ----------------------- ASK: state + refs + helpers ---------------------- */
  const [askOpen, setAskOpen] = useState(false);
  const [askValue, setAskValue] = useState('');
  const [askActiveIdx, setAskActiveIdx] = useState<number>(-1);
  const [askSuggestions, setAskSuggestions] = useState<string[]>([]);
  const [askFlyoutOpen, setAskFlyoutOpen] = useState(false);
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
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll); };
  }, [askOpen]);

  const positionAskFlyout = () => {
    if (!askIconRef.current || !askFlyoutRef.current) return;
    const rect = askIconRef.current.getBoundingClientRect();
    const width = Math.round(Math.min(520, Math.max(320, window.innerWidth * 0.72)));
    askFlyoutRef.current.style.left = `${Math.round(Math.min(rect.left, window.innerWidth - width - 8))}px`;
    askFlyoutRef.current.style.top = `${Math.round(rect.bottom + 8)}px`;
    askFlyoutRef.current.style.width = `${width}px`;
  };

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
    requestAnimationFrame(() => { positionAskDropdown(); askTL.current?.play(0); });
  };
  const closeAsk = () => {
    askTL.current?.reverse();
    setAskActiveIdx(-1);
    setAskOpen(false);
    if (askFlyoutOpen) { askFlyTL.current?.reverse(); setAskFlyoutOpen(false); }
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
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { closeAsk(); askInputRef.current?.blur(); } };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocDown); document.removeEventListener('keydown', onKey); };
  }, [askOpen, askFlyoutOpen]);

  const refreshAskSuggestions = () => { setAskSuggestions(pickRandom(ASK_POOL, 4)); setAskActiveIdx(-1); };

  const applySuggestion = (s: string) => {
    setAskValue(s); closeAsk(); askInputRef.current?.focus();
  };

  const handleAskKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!askOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { refreshAskSuggestions(); openAsk(); return; }
    if (!askOpen) { if (e.key === 'Enter' && askValue.trim()) window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`; return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAskActiveIdx((idx) => Math.min(askSuggestions.length - 1, idx + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAskActiveIdx((idx) => Math.max(-1, idx - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (askActiveIdx >= 0) applySuggestion(askSuggestions[askActiveIdx]);
      else if (askValue.trim()) window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`;
    } else if (e.key === 'Escape') { e.preventDefault(); closeAsk(); }
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

  const onAskSubmit = () => { if (!askValue.trim()) return; window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`; };

  return (
    <header ref={headerRef} className={`${styles.headerWrap} ${scrolled ? styles.scrolled : ''}`}>
      <div className={styles.headerInner}>
        {/* Brand */}
        <div className={styles.brandArea} onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
          <a href="/" className={styles.brandText}>ttkremer.com</a>
        </div>

        {/* Left-aligned nav */}
        {!isMobile && (
          <nav
            ref={navRef}
            className={styles.nav}
            data-dd-keepalive="true"
            onMouseLeave={handleNavMouseLeave}
          >
            <div
              className={styles.navItem}
              data-dd-trigger="true"
              onMouseEnter={() => openDropdown('experience')}
              onFocus={() => openDropdown('experience')}
              aria-haspopup="true"
              aria-expanded={active === 'experience'}
            >
              <a className={styles.link} data-nav-link="true" href="/experience" onClick={(e) => e.preventDefault()}>
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
              <a className={styles.link} data-nav-link="true" href="/projects" onClick={(e) => e.preventDefault()}>
                Projects
                <img
                  ref={arrowProjRef}
                  alt=""
                  className={styles.linkArrow}
                  src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23142d3e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>"
                />
              </a>
            </div>

            <a className={styles.linkPlain} data-nav-link="true" href="/education" onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
                Education
              </a>
              <a className={styles.linkPlain} data-nav-link="true" href="/about" onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
                About me
              </a>
              <a className={styles.linkPlain} data-nav-link="true" href="/contact" onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
                Contact
              </a>

              {/* --- External GAP BRIDGE (keeps dropdown alive through the gap) --- */}
              <div
                ref={gapBridgeRef}
                className={`${styles.gapBridge} ${active ? styles.gapBridgeOpen : ''}`}
                data-dd-keepalive="true"
                onMouseEnter={() => { cancelCloseIntent(); disarmRef.current = false; }}
                aria-hidden
              />

              {/* Dropdown */}
              <div
                ref={ddRef}
                data-dd-surface="true"
                className={`${styles.dropdownContent} ${active ? styles.open : ''}`}
                role="menu"
                aria-hidden={!active}
                onMouseEnter={() => {
                  cancelCloseIntent();
                  disarmRef.current = false;
                  if (ddTL.current && ddTL.current.reversed() && ddTL.current.isActive()) ddTL.current.play();
                }}
                onMouseLeave={() => closeDropdown()}
              >
                {/* Inner + swap overlay */}
                <div ref={ddInnerRef} className={styles.ddInner}>
                  {!!active && (
                    <div className={styles.gridSwapWrap}>
                      {!!prevKey && prevKey !== active && (
                        <div ref={outgoingRef} className={`${styles.gridContainer} ${styles.gridOutgoing}`}>
                          {itemsFor(prevKey).map((it) => (
                            <a key={`out-${it.label}`} href={it.href} className={styles.gridItem}>
                              <div className={styles.gridThumbWrap} aria-hidden>
                                <img className={styles.gridThumb} src={it.img} alt={`${it.label} thumbnail`} />
                              </div>
                              <div className={styles.gridText}>
                                <span className={styles.gridTitle}>{it.label}</span>
                                <span className={styles.gridSubtle}>{it.sub}</span>
                                <p className={styles.gridDesc}>
                                  {it.desc.split('\n').map((line, i) => <span key={i} style={{ display: 'block' }}>{line}</span>)}
                                </p>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}

                      <div ref={incomingRef} className={styles.gridContainer}>
                        {dropdownItems.map((it) => (
                          <a key={`in-${it.label}`} href={it.href} className={styles.gridItem}>
                            <div className={styles.gridThumbWrap} aria-hidden>
                              <img className={styles.gridThumb} src={it.img} alt={`${it.label} thumbnail`} />
                            </div>
                            <div className={styles.gridText}>
                              <span className={styles.gridTitle}>{it.label}</span>
                              <span className={styles.gridSubtle}>{it.sub}</span>
                              <p className={styles.gridDesc}>
                                {it.desc.split('\n').map((line, i) => <span key={i} style={{ display: 'block' }}>{line}</span>)}
                              </p>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
          </nav>
        )}

        {/* Right actions */}
        {!isMobile && (
          <div className={styles.rightArea} onMouseEnter={suppressDropdown} onFocus={suppressDropdown}>
            <AskControl
              askVariant={askVariant}
              askPlaceholder={askPlaceholder}
            />
            <Button type="text" className={styles.resumeBtnAntd} href="/resume">My Resume</Button>
          </div>
        )}
      </div>

      {askDropdown}
    </header>
  );
};

/* ---------------- Small inline Ask control to keep SiteHeader tidy ---- */
const AskControl: React.FC<{ askVariant: AskVariant; askPlaceholder: string; }> = ({ askVariant, askPlaceholder }) => {
  const [askOpen, setAskOpen] = useState(false);
  const [askValue, setAskValue] = useState('');
  const [askActiveIdx, setAskActiveIdx] = useState<number>(-1);
  const [askSuggestions, setAskSuggestions] = useState<string[]>([]);
  const [askFlyoutOpen, setAskFlyoutOpen] = useState(false);

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
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll); };
  }, [askOpen]);

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
    requestAnimationFrame(() => { positionAskDropdown(); askTL.current?.play(0); });
  };
  const closeAsk = () => {
    askTL.current?.reverse();
    setAskActiveIdx(-1);
    setAskOpen(false);
    if (askFlyoutOpen) { askFlyTL.current?.reverse(); setAskFlyoutOpen(false); }
  };

  const setSubmitVisible = (show: boolean) => {
    if (!askSubmitRef.current) return;
    if (submitShownRef.current === show) return;
    submitShownRef.current = show;
    gsap.to(askSubmitRef.current, { scale: show ? 1 : 0, autoAlpha: show ? 1 : 0, duration: 0.2, ease: 'power2.out' });
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
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { closeAsk(); askInputRef.current?.blur(); } };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocDown); document.removeEventListener('keydown', onKey); };
  }, [askOpen, askFlyoutOpen]);

  const refreshAskSuggestions = () => { setAskSuggestions(pickRandom(ASK_POOL, 4)); setAskActiveIdx(-1); };

  const applySuggestion = (s: string) => {
    setAskValue(s); closeAsk(); askInputRef.current?.focus();
  };

  const handleAskKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (!askOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { refreshAskSuggestions(); openAsk(); return; }
    if (!askOpen) { if (e.key === 'Enter' && askValue.trim()) window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`; return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAskActiveIdx((idx) => Math.min(askSuggestions.length - 1, idx + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAskActiveIdx((idx) => Math.max(-1, idx - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (askActiveIdx >= 0) applySuggestion(askSuggestions[askActiveIdx]);
      else if (askValue.trim()) window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`;
    } else if (e.key === 'Escape') { e.preventDefault(); closeAsk(); }
  };

  return (
    <>
      {askVariant !== 'icon' ? (
        <div
          ref={askWrapRef}
          className={styles.askWrap}
          onMouseDown={() => {
            refreshAskSuggestions();
            setAskOpen(true);
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
            onFocus={() => { refreshAskSuggestions(); setAskOpen(true); }}
            onKeyDown={handleAskKeyDown}
            aria-expanded={askOpen}
            aria-controls="ask-dropdown"
          />
          <Button
            ref={askSubmitRef as any}
            type="primary"
            className={styles.askSubmit}
            aria-label="Submit question"
            onClick={() => { if (!askValue.trim()) return; window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`; }}
          >
            <span className={styles.askSubmitLabel}>Ask</span>
            <svg className={styles.askSubmitIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
              requestAnimationFrame(() => askInputRef.current?.focus());
            }}
          >
            ?
          </button>
          {askFlyoutOpen && (
            <div ref={askFlyoutRef} className={styles.askFlyout} style={{ position: 'fixed', zIndex: 4050 }}>
              <div
                ref={askWrapRef}
                className={`${styles.askWrap} ${styles.askFlyoutWrap}`}
                onMouseDown={() => {
                  refreshAskSuggestions();
                  requestAnimationFrame(() => {
                    setAskOpen(true);
                    askInputRef.current?.focus();
                  });
                }}
              >
                <input
                  ref={askInputRef}
                  type="text"
                  className={styles.askField}
                  placeholder={askPlaceholder || 'Ask my AI a question about me here'}
                  value={askValue}
                  onChange={(e) => setAskValue(e.target.value)}
                  onFocus={() => { refreshAskSuggestions(); setAskOpen(true); }}
                  onKeyDown={handleAskKeyDown}
                  aria-expanded={askOpen}
                  aria-controls="ask-dropdown"
                />
                <button
                  ref={askSubmitRef}
                  type="button"
                  className={styles.askSubmit}
                  aria-label="Submit question"
                  onClick={() => { if (!askValue.trim()) return; window.location.href = `/contact?q=${encodeURIComponent(askValue.trim())}`; }}
                >
                  <span className={styles.askSubmitLabel}>Ask</span>
                  <svg className={styles.askSubmitIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ask dropdown portal is rendered in parent */}
    </>
  );
};

export default SiteHeader;
