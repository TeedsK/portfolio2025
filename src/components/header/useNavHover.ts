// src/components/header/useNavHover.ts
import { MutableRefObject, useEffect } from 'react';
import gsap from 'gsap';

/**
 * Smooth GSAP hover for header links: fades background and color in/out.
 * Works on elements with [data-nav-link="true"].
 */
export default function useNavHover(
    navRef: MutableRefObject<HTMLDivElement | null>
) {
    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;

        const links = Array.from(
            nav.querySelectorAll<HTMLAnchorElement>('[data-nav-link="true"]')
        );

        const cleanups: Array<() => void> = [];

        links.forEach((a) => {
            // Ensure no CSS transition fights GSAP
            a.style.transition = 'none';

            const enter = () => {
                gsap.to(a, {
                    backgroundColor: 'rgba(4,116,227,0.06)',
                    color: '#0474e3',
                    duration: 0.18,
                    ease: 'power2.out',
                    overwrite: 'auto',
                });
            };

            const leave = () => {
                gsap.to(a, {
                    backgroundColor: 'rgba(0,0,0,0)',
                    color: '#142d3e',
                    duration: 0.18,
                    ease: 'power2.out',
                    overwrite: 'auto',
                });
            };

            a.addEventListener('mouseenter', enter);
            a.addEventListener('mouseleave', leave);
            cleanups.push(() => {
                a.removeEventListener('mouseenter', enter);
                a.removeEventListener('mouseleave', leave);
            });
        });

        return () => cleanups.forEach((fn) => fn());
    }, [navRef]);
}
