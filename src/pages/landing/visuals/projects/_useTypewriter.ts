// Simple hook to "type" an array of lines repeatedly.
// When `play` toggles from false -> true, the sequence restarts.
import { useEffect, useRef, useState } from 'react';

export default function useTypewriter(lines: string[], play: boolean, cps = 28) {
    const [visible, setVisible] = useState<string[]>([]);
    const [cursorOnLine, setCursorOnLine] = useState<number>(0);
    const [cursorPos, setCursorPos] = useState<number>(0);
    const timerRef = useRef<number | null>(null);
    const seqRef = useRef({ line: 0, char: 0 });

    // reset on play
    useEffect(() => {
        if (!play) {
            // pause animation but keep what’s on screen
            if (timerRef.current) cancelAnimationFrame(timerRef.current);
            timerRef.current = null;
            return;
        }
        // restart sequence
        seqRef.current = { line: 0, char: 0 };
        setVisible(['']);
        setCursorOnLine(0);
        setCursorPos(0);

        const tick = (lastT: number) => {
            const now = performance.now();
            const dt = now - lastT;
            const stepChars = Math.max(1, Math.floor((cps * dt) / 1000));

            let { line, char } = seqRef.current;
            const currentLine = lines[line] ?? '';
            char += stepChars;

            if (char >= currentLine.length) {
                // finish this line, then start the next after a short pause
                char = currentLine.length;
                seqRef.current.char = char;

                setVisible((prev) => {
                    const clone = [...prev];
                    clone[line] = currentLine;
                    return clone;
                });
                setCursorOnLine(line);
                setCursorPos(char);

                // proceed to next line with a delay
                const delay = 320; // ms
                setTimeout(() => {
                    line += 1;
                    if (line >= lines.length) {
                        // loop
                        line = 0;
                        setVisible(['']);
                    } else {
                        setVisible((prev) => {
                            const clone = [...prev];
                            clone[line] = '';
                            return clone;
                        });
                    }
                    seqRef.current = { line, char: 0 };
                    setCursorOnLine(line);
                    setCursorPos(0);
                    timerRef.current = requestAnimationFrame((t) => tick(t));
                }, delay);
                return;
            }

            // normal typing
            seqRef.current.char = char;
            setVisible((prev) => {
                const clone = [...prev];
                clone[line] = currentLine.slice(0, char);
                return clone;
            });
            setCursorOnLine(line);
            setCursorPos(char);

            timerRef.current = requestAnimationFrame((t) => tick(t));
        };

        timerRef.current = requestAnimationFrame((t) => tick(t));
        return () => {
            if (timerRef.current) cancelAnimationFrame(timerRef.current);
            timerRef.current = null;
        };
    }, [lines, play, cps]);

    return { visibleLines: visible, cursorOnLine, cursorPos };
}
