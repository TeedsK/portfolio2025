import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { STATUS_TEXTS } from '../constants';

export default function useStatusText(currentAppPhase: number) {
  const statusTextRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!statusTextRef.current) return;

    const newText = STATUS_TEXTS[currentAppPhase] || STATUS_TEXTS[0];
    const currentText = statusTextRef.current.textContent;
    const tl = gsap.timeline();

    if (currentText !== "" && currentText !== newText) {
      tl.to(statusTextRef.current, {
        y: -20,
        opacity: 0,
        duration: 0.3,
        ease: 'power1.in',
      });
    }

    tl.add(() => {
      if (statusTextRef.current) {
        statusTextRef.current.textContent = newText;
      }
    })
      .set(statusTextRef.current, { y: 20, opacity: 0 })
      .to(statusTextRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.4,
        ease: 'power1.out',
      });
  }, [currentAppPhase]);

  return statusTextRef;
}
