import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './_CodeWindow.css';
import './HoloPopups.css';
import {
  PopupBelt,
  BeltItem,
  PopupType,
} from './HoloPopups';

type LineKind = 'cmd' | 'subcmd';

type Step =
  | { kind: 'cmd'; text: string; topLevel?: boolean; delayAfterMs?: number }
  | { kind: 'subcmd'; text: string; delayAfterMs?: number }
  | { kind: 'popup'; ptype: PopupType; delayAfterMs?: number };

type RenderLine = {
  id: string;
  kind: LineKind;
  text: string;
  block: number;       // groups: 1 command (+ its subcmds)
  dim: boolean;        // faded style for previous blocks
  vanishing?: boolean; // when being removed with fade-away animation
  isTyping?: boolean;  // caret display for current command typing
};

// ---- Design baseline used by the auto-fit scaler ----
const BASE_HEIGHT = 320;   // total design height: terminal + gap + belt
// (The belt's internal height is controlled by CSS var --belt-h = 200px at 1.0 scale)

const HoloCleanCode: React.FC<{ play: boolean }> = ({ play }) => {
  // ---------- Script (commands only; outputs are popups in the belt) ----------
  const STEPS: Step[] = useMemo(() => {
    return [
      // --- Docker compose: bring up Postgres ---
      { kind: 'cmd', text: 'docker-compose up -d', topLevel: true, delayAfterMs: 260 },
      { kind: 'popup', ptype: 'db', delayAfterMs: 520 },

      // --- Build table definitions / messy source snapshot ---
      { kind: 'cmd', text: 'chmod +x init-db.sh', topLevel: true, delayAfterMs: 160 },
      { kind: 'cmd', text: './init-db.sh', topLevel: false, delayAfterMs: 220 },
      { kind: 'popup', ptype: 'schemaMessy', delayAfterMs: 520 },

      // --- Sanity check inside the container (psql \dt → clean table view) ---
      {
        kind: 'cmd',
        text: 'docker exec -it holoclean_postgres_db psql -U holoclean_user -d holoclean_db',
        topLevel: true,
        delayAfterMs: 240,
      },
      { kind: 'subcmd', text: 'holoclean_db=# \\dt', delayAfterMs: 180 },
      { kind: 'popup', ptype: 'psqlTables', delayAfterMs: 540 },

      // --- Python environment (commands only for realism) ---
      { kind: 'cmd', text: 'python -m venv .venv', topLevel: true, delayAfterMs: 140 },
      { kind: 'subcmd', text: 'source .venv/bin/activate', delayAfterMs: 120 },
      { kind: 'subcmd', text: '(.venv) $ pip install -r requirements.txt', delayAfterMs: 360 },

      // --- RUN HOLOCLEAN PIPELINE (each step shows a popup) ---
      { kind: 'cmd', text: '(.venv) $ python ingest.py', topLevel: true, delayAfterMs: 220 },
      { kind: 'popup', ptype: 'ingestHospitals', delayAfterMs: 520 },

      { kind: 'cmd', text: '(.venv) $ python run_detectors.py', topLevel: true, delayAfterMs: 200 },
      { kind: 'popup', ptype: 'detectors', delayAfterMs: 520 },

      { kind: 'cmd', text: '(.venv) $ python run_pruning.py', topLevel: true, delayAfterMs: 200 },
      { kind: 'popup', ptype: 'pruning', delayAfterMs: 560 },

      { kind: 'cmd', text: '(.venv) $ python run_compiler.py', topLevel: true, delayAfterMs: 200 },
      { kind: 'popup', ptype: 'compiler', delayAfterMs: 520 },

      {
        kind: 'cmd',
        text:
          '(.venv) $ python run_inference.py --mode train_predict --learniter 25 --save_model_path trained_model_100.pth --save_builder_path builder_state_100.pkl --pred_output_file marginals_100_rows.pkl --lr 0.005',
        topLevel: true,
        delayAfterMs: 200,
      },
      { kind: 'popup', ptype: 'inference', delayAfterMs: 900 },

      // Optional final evaluation command (no popup requested)
      { kind: 'cmd', text: '(.venv) $ python evaluate.py --pred_file marginals_100_rows.pkl --truth_file hospital_100_clean.csv', topLevel: true, delayAfterMs: 600 },
    ];
  }, []);

  // ---------- Animation / playback state ----------
  const containerRef = useRef<HTMLDivElement>(null); // scrollable terminal body
  const [lines, setLines] = useState<RenderLine[]>([]);
  const linesRef = useRef<RenderLine[]>([]);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  const [blockIdx, setBlockIdx] = useState(0);
  const playTokenRef = useRef(0);
  const timeouts = useRef<number[]>([]);

  // Belt popups state
  const [popups, setPopups] = useState<BeltItem[]>([]);

  const POPUP_LIFETIMES: Record<PopupType, number> = {
    db: 2400,
    schemaMessy: 2400,
    psqlTables: 2600,
    ingestHospitals: 2400,
    detectors: 2600,
    pruning: 2800,
    compiler: 2400,
    inference: 4200,
  };

  const showPopup = (ptype: PopupType) => {
    const id = `pop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const item: BeltItem = { id, type: ptype, lifetimeMs: POPUP_LIFETIMES[ptype] ?? 2400 };
    setPopups((prev) => [...prev, item]);
  };

  const handleClose = useCallback((id: string) => {
    setPopups((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Helpers
  const clearTimers = () => {
    timeouts.current.forEach((id) => clearTimeout(id));
    timeouts.current = [];
  };
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = window.setTimeout(resolve, ms);
      timeouts.current.push(id);
    });
  const nextFrame = () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  // Scrolling + space handling (for the terminal text)
  const BOTTOM_GUTTER_PX = 28;          // breathing room at bottom
  const MAX_OVERFLOW_FACTOR = 1.35;     // content may grow vs. viewport before eviction
  const autoScroll = async () => {
    await nextFrame();
    const el = containerRef.current;
    if (!el) return;
    const target =
      Math.max(0, el.scrollHeight - el.clientHeight - BOTTOM_GUTTER_PX);
    el.scrollTop = target;
  };

  // Only evict whole *old* blocks (never the current block)
  const ensureFits = async (currentBlock: number) => {
    await nextFrame();
    const el = containerRef.current;
    if (!el) return;

    let guard = 0;
    while (el.scrollHeight > el.clientHeight * MAX_OVERFLOW_FACTOR && guard++ < 12) {
      const existing = linesRef.current;
      const oldestBlock = existing
        .filter((l) => l.block < currentBlock && !l.vanishing)
        .reduce<number | null>(
          (min, l) => (min === null ? l.block : Math.min(min, l.block)),
          null
        );

      if (oldestBlock === null) break;

      setLines((prev) =>
        prev.map((l) => (l.block === oldestBlock ? { ...l, vanishing: true } : l)),
      );
      await wait(360);
      setLines((prev) => prev.filter((l) => l.block !== oldestBlock));
      await nextFrame();
    }

    await autoScroll();
  };

  const dimPreviousBlocks = () => {
    setLines((prev) => prev.map((l) => ({ ...l, dim: true })));
  };

  const pushLine = (line: Omit<RenderLine, 'id'>) => {
    const id = `ln-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry: RenderLine = { id, ...line };
    setLines((prev) => [...prev, entry]);
    return id;
  };

  const updateLine = (id: string, patch: Partial<RenderLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const COMMAND_CPS = 32; // characters per second

  const runSteps = async () => {
    const myToken = ++playTokenRef.current;

    // Reset state
    setLines([]);
    setPopups([]);
    setBlockIdx(0);
    await wait(50);

    let currentBlock = 0;

    for (let i = 0; i < STEPS.length; i++) {
      if (playTokenRef.current !== myToken) return; // cancelled
      const step = STEPS[i];

      if (step.kind === 'cmd') {
        if (step.topLevel !== false) {
          dimPreviousBlocks();
          currentBlock += 1;
          setBlockIdx(currentBlock);
        }
        const lineId = pushLine({
          kind: 'cmd',
          text: '',
          block: currentBlock,
          dim: false,
          isTyping: true,
        });

        // Type out the command
        const full = `$ ${step.text}`;
        for (let c = 0; c <= full.length; c++) {
          if (playTokenRef.current !== myToken) return;
          updateLine(lineId, { text: full.slice(0, c) });
          await wait(1000 / COMMAND_CPS);
        }
        updateLine(lineId, { isTyping: false });

        await ensureFits(currentBlock);
        await wait(step.delayAfterMs ?? 140);
      }

      if (step.kind === 'subcmd') {
        const lineId = pushLine({
          kind: 'subcmd',
          text: '',
          block: currentBlock,
          dim: false,
          isTyping: true,
        });

        const full = step.text;
        for (let c = 0; c <= full.length; c++) {
          if (playTokenRef.current !== myToken) return;
          updateLine(lineId, { text: full.slice(0, c) });
          await wait(1000 / COMMAND_CPS);
        }
        updateLine(lineId, { isTyping: false });

        await ensureFits(currentBlock);
        await wait(step.delayAfterMs ?? 120);
      }

      if (step.kind === 'popup') {
        showPopup(step.ptype);
        await wait(step.delayAfterMs ?? 320);
      }
    }

    // Small pause at end, then loop
    await wait(1200);
    if (playTokenRef.current === myToken) runSteps();
  };

  useEffect(() => {
    if (!play) {
      clearTimers();
      ++playTokenRef.current; // cancel any running loop
      return;
    }
    clearTimers();
    runSteps();

    return () => {
      clearTimers();
      ++playTokenRef.current; // cancel
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  // ---------- Auto-fit scaling to keep everything within the screen height ----------
  const fitRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const host = fitRef.current;
    if (!host) return;

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      const availableH = rect.height || host.clientHeight || window.innerHeight;
      const s = Math.min(1, availableH / BASE_HEIGHT);
      setScale(s > 0 ? s : 1);
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Render inner HoloClean UI once, then wrap with scale canvas
  const Inner = (
    <div className="holo-root">
      {/* Terminal (shorter, auto-scrolling text) */}
      <div className="codewin codewin--terminal" role="img" aria-label="HoloClean terminal setup and run">
        <div className="codewin-head">
          <span className="codewin-dot" />
          <span className="codewin-dot" />
          <span className="codewin-dot" />
          <span className="codewin-title">holoclean.py</span>
        </div>

        <div ref={containerRef} className="codewin-body">
          {lines.map((ln) => {
            const classes = [
              'type-line',
              ln.dim ? 'dim' : '',
              ln.kind === 'cmd' ? 'cmd' : '',
              ln.kind === 'subcmd' ? 'cmd cmd--sub' : '',
              ln.vanishing ? 'vanish' : '',
            ].filter(Boolean).join(' ');

            return (
              <div key={ln.id} className={classes}>
                {ln.text}
                {ln.isTyping && <span className="caret" />}
              </div>
            );
          })}
          <div style={{ height: BOTTOM_GUTTER_PX }} />
          <div className="scroll-fade" />
        </div>
      </div>

      {/* Popup belt (below) */}
      <PopupBelt
        items={popups}
        onClose={handleClose}
      />
    </div>
  );

  // When scale < 1, we render a fixed-height design canvas and scale it.
  // We also pre-expand width to 100%/scale so the scaled width still fills the container.
  if (scale < 0.999) {
    const inv = 1 / scale;
    return (
      <div ref={fitRef} className="holo-fitbox">
        <div
          className="holo-stage"
          style={{
            height: BASE_HEIGHT,
            width: `${inv * 100}%`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }}
        >
          {Inner}
        </div>
      </div>
    );
  }

  // If plenty of height, render at 1:1 without scaling
  return (
    <div ref={fitRef} className="holo-fitbox">
      {Inner}
    </div>
  );
};

export default HoloCleanCode;
