import React, { useMemo } from 'react';
import './_CodeWindow.css';
import useTypewriter from './_useTypewriter';

const HoloCleanCode: React.FC<{ play: boolean }> = ({ play }) => {
    const LINES = useMemo(
        () => [
            "import pandas as pd",
            "df = pd.read_csv('users.csv')",
            "df['email'] = df['email'].str.strip().str.lower()",
            "df.loc[df['age'] < 0, 'age'] = None  # fix impossible values",
            "df = df.drop_duplicates(subset=['email'])",
            "quality = assess(df)  # completeness: 97.2%, validity: 98.9%",
        ],
        []
    );

    const { visibleLines, cursorOnLine } = useTypewriter(LINES, play, 28);

    return (
        <div className="codewin" role="img" aria-label="HoloClean code animation">
            <div className="codewin-head">
                <span className="codewin-dot" />
                <span className="codewin-dot" />
                <span className="codewin-dot" />
                <span className="codewin-title">holoclean.py</span>
            </div>
            <div className="codewin-body">
                {LINES.map((full, idx) => {
                    const text = visibleLines[idx] ?? (idx < cursorOnLine ? full : '');
                    const isDim = idx < cursorOnLine - 2;
                    return (
                        <div key={idx} className={`type-line ${isDim ? 'dim' : ''}`}>
                            {text}
                            {idx === cursorOnLine && <span className="caret" />}
                        </div>
                    );
                })}
                <div className="scroll-fade" />
            </div>
        </div>
    );
};

export default HoloCleanCode;
