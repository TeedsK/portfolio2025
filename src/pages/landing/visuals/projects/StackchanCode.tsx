import React, { useMemo } from 'react';
import './_CodeWindow.css';
import useTypewriter from './_useTypewriter';

const StackchanCode: React.FC<{ play: boolean }> = ({ play }) => {
    const LINES = useMemo(
        () => [
            "#include <Servo.h>",
            "Servo mouth;",
            "void setup(){ mouth.attach(9); Serial.begin(115200); }",
            "void speak(const char* msg){",
            "  for (int i=0;i<strlen(msg);++i){ mouth.write(40 + (i%2)*20); delay(60);} ",
            "  mouth.write(50);",
            "}",
        ],
        []
    );

    const { visibleLines, cursorOnLine } = useTypewriter(LINES, play, 34);

    return (
        <div className="codewin" role="img" aria-label="Stackchan code animation">
            <div className="codewin-head">
                <span className="codewin-dot" />
                <span className="codewin-dot" />
                <span className="codewin-dot" />
                <span className="codewin-title">stackchan.ino</span>
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

export default StackchanCode;
