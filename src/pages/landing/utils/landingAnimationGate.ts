// src/pages/landing/utils/landingAnimationGate.ts
import { useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        __LANDING_ANIM_ACTIVE__?: boolean;
        __LANDING_VIDEO_PLAYING__?: boolean;
    }
}

const DEFAULT_LANDING_PATHS = ['/', '/home', '/landing'];

/** True if current location matches a landing path. */
export function isOnLandingRoute(paths: string[] = DEFAULT_LANDING_PATHS): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const p = window.location?.pathname || '/';
        return paths.includes(p);
    } catch {
        return false;
    }
}

/** Set global active flag + broadcast a change event. */
export function setLandingAnimationActive(active: boolean) {
    if (typeof window === 'undefined') return;
    const prev = window.__LANDING_ANIM_ACTIVE__;
    window.__LANDING_ANIM_ACTIVE__ = active;

    // Only broadcast if it changed
    if (prev !== active) {
        window.dispatchEvent(
            new CustomEvent('landing:anim-active-changed', { detail: { active } })
        );
    }
}

/** Read whether landing animations should currently run. */
export function shouldRunLandingAnimations(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    // If someone explicitly set it, respect it. Otherwise, infer from route + visibility.
    if (typeof window.__LANDING_ANIM_ACTIVE__ === 'boolean') return window.__LANDING_ANIM_ACTIVE__!;
    return isOnLandingRoute() && document.visibilityState === 'visible';
}

/**
 * React hook that keeps the global "landing animation" active flag in sync
 * with the current route & page visibility. Any component can call this
 * from the landing page.
 */
export function useLandingAnimationGate(paths: string[] = DEFAULT_LANDING_PATHS): boolean {
    const [active, setActive] = useState<boolean>(() => shouldRunLandingAnimations());
    const pathsKeyRef = useRef(paths.join('|'));

    useEffect(() => {
        const update = () => {
            const next =
                isOnLandingRoute(paths) &&
                typeof document !== 'undefined' &&
                document.visibilityState === 'visible';
            setActive(next);
            setLandingAnimationActive(next);
        };

        // Initial set
        update();

        // React to visibility and navigation changes
        window.addEventListener('popstate', update);
        window.addEventListener('hashchange', update);
        window.addEventListener('focus', update);
        window.addEventListener('blur', update);
        document.addEventListener('visibilitychange', update);

        return () => {
            window.removeEventListener('popstate', update);
            window.removeEventListener('hashchange', update);
            window.removeEventListener('focus', update);
            window.removeEventListener('blur', update);
            document.removeEventListener('visibilitychange', update);
            // When the landing page unmounts, mark animations inactive
            setLandingAnimationActive(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathsKeyRef.current]);

    return active;
}
