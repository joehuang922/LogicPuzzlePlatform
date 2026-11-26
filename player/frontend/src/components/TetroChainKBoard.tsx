import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TetroChainKCanon } from "../types/canon";
import { DOT, SHADED, brokenClues, fromValues, toValues, validateTetroChainK } from "./tetroChainKRules";

interface TetroChainKBoardProps {
  canon: TetroChainKCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const TETRO_CHAIN_K_CELL = 36;
export const TETRO_CHAIN_K_PAD = 14;
const CELL = TETRO_CHAIN_K_CELL;
const PAD = TETRO_CHAIN_K_PAD;
// No rooms to keep visible, so a dark fill; circles get a white halo on top of it.
const SHADE = "#555";
const ERROR = "#d32f2f";
const DOT_COLOR = "#777";
const CIRCLE_FILL = ["#fff", "#111", "#9a9a9a"]; // white, black, gray

/** Thin grid lines and the border; shared with the editor. */
export function TetroChainKGrid({ canon }: { canon: TetroChainKCanon }) {
  const { width: cols, height: rows } = canon;
  return (
    <>
      {Array.from({ length: rows - 1 }, (_, i) => (
        <line key={`gh-${i}`} x1={0} y1={(i + 1) * CELL} x2={cols * CELL} y2={(i + 1) * CELL} stroke="#444" strokeWidth={1} />
      ))}
      {Array.from({ length: cols - 1 }, (_, i) => (
        <line key={`gv-${i}`} x1={(i + 1) * CELL} y1={0} x2={(i + 1) * CELL} y2={rows * CELL} stroke="#444" strokeWidth={1} />
      ))}
      <rect x={0} y={0} width={cols * CELL} height={rows * CELL} fill="none" stroke="#111" strokeWidth={3} />
    </>
  );
}

/** The circle clues with a white halo; [bad] holds indices drawn red. */
export function TetroChainKCircles({ canon, bad }: { canon: TetroChainKCanon; bad?: Set<number> }) {
  return (
    <>
      {canon.circles.map((k, i) => {
        const cx = (k.dc / 2) * CELL;
        const cy = (k.dr / 2) * CELL;
        const isBad = bad?.has(i);
        return (
          <g key={`circle-${k.dr}-${k.dc}`} pointerEvents="none">
            <circle cx={cx} cy={cy} r={CELL * 0.17 + 2} fill="#fff" />
            <circle cx={cx} cy={cy} r={CELL * 0.17} fill={CIRCLE_FILL[k.color] ?? "#fff"}
              stroke={isBad ? ERROR : "#111"} strokeWidth={isBad ? 3 : 1.5} />
          </g>
        );
      })}
    </>
  );
}

export default function TetroChainKBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: TetroChainKBoardProps) {
  const { width: cols, height: rows } = canon;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const [states, setStates] = useState<number[][]>(() => fromValues(canon, initialUserValues ?? {}));
  const completedRef = useRef(false);

  useEffect(() => {
    onValuesChange?.(toValues(states));
  }, [states, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateTetroChainK(canon, states)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, onComplete]);

  // Left click cycles forward: unset -> shaded -> dot -> unset. Right click backward.
  const cycle = useCallback(
    (r: number, c: number, dir: 1 | -1) => {
      if (readonly) return;
      setStates((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = (next[r][c] + dir + 3) % 3;
        return next;
      });
    },
    [readonly]
  );

  const broken = useMemo(() => (liveValidate ? brokenClues(canon, states) : null), [liveValidate, canon, states]);

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ userSelect: "none", display: "block", border: "1px solid #ccc" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <rect x={0} y={0} width={cols * CELL} height={rows * CELL} fill="white" />
          {states.flatMap((row, r) =>
            row.map((s, c) => {
              const x = c * CELL;
              const y = r * CELL;
              const bad = broken?.cells.has(`${r},${c}`);
              return (
                <g key={`cell-${r}-${c}`}>
                  <rect
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    fill={s === SHADED ? SHADE : "white"}
                    style={{ cursor: readonly ? "default" : "pointer" }}
                    onClick={() => cycle(r, c, 1)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      cycle(r, c, -1);
                    }}
                  />
                  {bad && (
                    <rect x={x + 3} y={y + 3} width={CELL - 6} height={CELL - 6} fill="none" stroke={ERROR}
                      strokeWidth={2.5} pointerEvents="none" />
                  )}
                  {s === DOT && <circle cx={x + CELL / 2} cy={y + CELL / 2} r={3} fill={DOT_COLOR} pointerEvents="none" />}
                </g>
              );
            })
          )}
          <TetroChainKGrid canon={canon} />
          <TetroChainKCircles canon={canon} bad={broken?.circles} />
        </g>
      </svg>
    </div>
  );
}
