import { useState, useEffect, useMemo, useRef } from "react";
import { MannequinGate2Canon } from "../types/canon";
import { EMPTY, MARKED, SHADED, badLines, cellKey, statesFromValues, validateMannequinGate2 } from "./mannequinGate2Rules";

interface MannequinGate2BoardProps {
  canon: MannequinGate2Canon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
  /** Editor hooks: highlight these line indices and these cells (e.g. a drag in progress). */
  highlightLines?: number[];
  highlightCells?: number[][];
}

export const CELL_SIZE = 40;
export const PAD = 14;
// No rooms, so shading is black as in the print; the lines are drawn on top in a mid
// gray that stays visible on both white and black.
const SHADE_FILL = "#111";
const LINE_COLOR = "#9a9a9a";
const ERROR_COLOR = "#d33";
const HIGHLIGHT = "#3b7dd8";
const MARK_COLOR = "#555";

/** SVG points for a line: centre to centre, each end extended a quarter cell past its centre. */
export function linePoints(line: number[][]): string {
  const pts = line.map(([r, c]) => [(c + 0.5) * CELL_SIZE, (r + 0.5) * CELL_SIZE]);
  if (pts.length >= 2) {
    const ext = (a: number[], b: number[]) => {
      const dx = a[0] - b[0];
      const dy = a[1] - b[1];
      const len = Math.hypot(dx, dy) || 1;
      return [a[0] + (dx / len) * CELL_SIZE * 0.28, a[1] + (dy / len) * CELL_SIZE * 0.28];
    };
    pts[0] = ext(pts[0], pts[1]);
    pts[pts.length - 1] = ext(pts[pts.length - 1], pts[pts.length - 2]);
  }
  return pts.map((p) => p.join(",")).join(" ");
}

/** The grid, the shading and the gray lines, shared by the board and the editor. */
export function MannequinGate2Svg({
  canon,
  states,
  bad,
  highlightLines,
  highlightCells,
  onCellClick,
  onCellPointer,
}: {
  canon: MannequinGate2Canon;
  states?: number[][];
  bad?: Set<number>;
  highlightLines?: number[];
  highlightCells?: number[][];
  onCellClick?: (r: number, c: number, back: boolean) => void;
  onCellPointer?: { down: (e: React.PointerEvent<SVGSVGElement>) => void; move: (e: React.PointerEvent<SVGSVGElement>) => void; up: () => void };
}) {
  const { rows, cols, lines } = canon;
  const w = cols * CELL_SIZE + PAD * 2;
  const h = rows * CELL_SIZE + PAD * 2;
  const hl = new Set(highlightLines ?? []);
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      style={{ maxWidth: w, userSelect: "none", display: "block", touchAction: onCellPointer ? "none" : undefined }}
      onPointerDown={onCellPointer?.down}
      onPointerMove={onCellPointer?.move}
      onPointerUp={onCellPointer?.up}
      onPointerCancel={onCellPointer?.up}
    >
      <g transform={`translate(${PAD},${PAD})`}>
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const s = states?.[r]?.[c] ?? EMPTY;
            return (
              <g key={`c-${r}-${c}`}>
                <rect
                  x={c * CELL_SIZE}
                  y={r * CELL_SIZE}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill={s === SHADED ? SHADE_FILL : "white"}
                  stroke="#222"
                  strokeWidth={0.75}
                  style={{ cursor: onCellClick ? "pointer" : undefined }}
                  onClick={onCellClick ? () => onCellClick(r, c, false) : undefined}
                  onContextMenu={
                    onCellClick
                      ? (e) => {
                          e.preventDefault();
                          onCellClick(r, c, true);
                        }
                      : undefined
                  }
                />
                {s === MARKED && (
                  <circle cx={(c + 0.5) * CELL_SIZE} cy={(r + 0.5) * CELL_SIZE} r={CELL_SIZE * 0.09} fill={MARK_COLOR} pointerEvents="none" />
                )}
              </g>
            );
          })
        )}
        {(highlightCells ?? []).map(([r, c], k) => (
          <rect key={`hc-${k}`} x={c * CELL_SIZE + 2} y={r * CELL_SIZE + 2} width={CELL_SIZE - 4} height={CELL_SIZE - 4}
            fill="none" stroke={HIGHLIGHT} strokeWidth={2} pointerEvents="none" />
        ))}
        {lines.map((line, i) => (
          <polyline
            key={`l-${i}`}
            points={linePoints(line)}
            fill="none"
            stroke={bad?.has(i) ? ERROR_COLOR : hl.has(i) ? HIGHLIGHT : LINE_COLOR}
            strokeOpacity={0.92}
            strokeWidth={CELL_SIZE * 0.17}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        ))}
        <rect x={0} y={0} width={cols * CELL_SIZE} height={rows * CELL_SIZE} fill="none" stroke="#222" strokeWidth={2.5} pointerEvents="none" />
      </g>
    </svg>
  );
}

/**
 * Mannequin Gate 2 (type 43). Click cycles a cell empty -> shaded -> marked -> empty
 * (right-click goes back). With live validation on, a line that already breaks a rule is
 * red. Values ride as "c:col,row" -> 1 (shaded) / 2 (marked).
 */
export default function MannequinGate2Board({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
  highlightLines,
  highlightCells,
}: MannequinGate2BoardProps) {
  const { rows, cols } = canon;
  const [states, setStates] = useState<number[][]>(() => statesFromValues(rows, cols, initialUserValues ?? {}));
  const completedRef = useRef(false);
  const firstRef = useRef(true);

  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    const values: Record<string, number> = {};
    states.forEach((row, r) => row.forEach((s, c) => { if (s !== EMPTY) values[cellKey(r, c)] = s; }));
    onValuesChange?.(values);
  }, [states, onValuesChange]);

  useEffect(() => {
    if (completedRef.current || readonly) return;
    if (validateMannequinGate2(canon, states)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, onComplete, readonly]);

  const bad = useMemo(() => (liveValidate ? badLines(canon, states) : undefined), [liveValidate, canon, states]);

  const cycle = (r: number, c: number, back: boolean) => {
    setStates((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = (next[r][c] + (back ? 2 : 1)) % 3;
      return next;
    });
  };

  return (
    <div style={{ maxWidth: cols * CELL_SIZE + PAD * 2, width: "100%" }}>
      <MannequinGate2Svg
        canon={canon}
        states={states}
        bad={bad}
        highlightLines={highlightLines}
        highlightCells={highlightCells}
        onCellClick={readonly ? undefined : cycle}
      />
    </div>
  );
}
