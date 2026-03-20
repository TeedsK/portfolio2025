import { useEffect, useState } from 'react';
import './LoadingScreen.css';

const MIN_DISPLAY_MS = 700;

export default function LoadingScreen() {
    const [fading, setFading] = useState(false);
    const [gone, setGone] = useState(false);

    useEffect(() => {
        const start = Date.now();

        const finish = () => {
            const elapsed = Date.now() - start;
            const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
            setTimeout(() => {
                setFading(true);
                setTimeout(() => setGone(true), 550);
            }, wait);
        };

        if (document.readyState === 'complete') {
            finish();
        } else {
            window.addEventListener('load', finish, { once: true });
            return () => window.removeEventListener('load', finish);
        }
    }, []);

    if (gone) return null;

    return (
        <div className={`ls-screen${fading ? ' ls-screen--fade' : ''}`} aria-hidden="true">
            <div className="ls-inner">
                <p className="ls-name">Theo Kremer</p>
                <div className="ls-bar">
                    <div className="ls-bar-fill" />
                </div>
            </div>
        </div>
    );
}
