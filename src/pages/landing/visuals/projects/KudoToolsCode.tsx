import React, { useMemo } from 'react';
import './_CodeWindow.css';
import useTypewriter from './_useTypewriter';

const KudoToolsCode: React.FC<{ play: boolean }> = ({ play }) => {
    const LINES = useMemo(
        () => [
            "const run = pipeline()",
            "  .use(auth('editor'))",
            "  .use(loadTasks({ label: 'content:pending' }))",
            "  .use(batch(update, { field: 'owner', value: 'bot@kudo' }))",
            "  .use(notify('#ops', 'Batch applied ✅'))",
            "  .done();",
        ],
        []
    );

    const { visibleLines, cursorOnLine } = useTypewriter(LINES, play, 30);

    return (
        <div className="codewin" role="img" aria-label="Kudo Tools code animation">
            <div className="codewin-head">
                <span className="codewin-dot" />
                <span className="codewin-dot" />
                <span className="codewin-dot" />
                <span className="codewin-title">kudo-tools.ts</span>
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

export default KudoToolsCode;
