import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { SinkaminoCanon } from "../types/canon";
import { ArrowTrail } from "./sinkaminoArrows";
import { BLACK as BLACK_CELL, GIVEN, MARKED, SQUARE, validateSinkamino } from "./sinkaminoRules";

interface SinkaminoBoardProps {
  canon: SinkaminoCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 2;

const BOARD_BG = "#fff";
const BLACK_FILL = "#333";
// Given squares are drawn like the print (black outline); placed squares use the same
// inset square in blue so the givens stay recognisable.
const GIVEN_STROKE = "#111";
const PLACED_STROKE = "#1e5bb8";
const PLACED_FILL = "#dbe8fb";
const SQUARE_INSET = 0.22;

export default function SinkaminoBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: SinkaminoBoardProps) {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  // Black cells and given squares take no input.
  const isLocked = useCallback(
    (r: number, c: number) => canon.cells[r]?.[c] !== 0,
    [canon]
  );

  const initialStates = useMemo(() => {
    const states = Array.from({ length: rows }, () => Array(cols).fill(0));
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        const [c, r] = key.split(",").map(Number);
        if (r >= 0 && r < rows && c >= 0 && c < cols && canon.cells[r][c] === 0) {
          states[r][c] = val;
        }
      }
    }
    return states;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [states, setStates] = useState<number[][]>(initialStates);
  const completedRef = useRef(false);

  useEffect(() => {
    const values: Record<string, number> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (states[r][c] !== 0) values[`${c},${r}`] = states[r][c];
      }
    }
    onValuesChange?.(values);
  }, [states, rows, cols, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSinkamino(canon, states)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, onComplete]);

  // Left-click cycles forward: 0 -> 1 -> 2 -> 0. Right-click cycles backward.
  // Black cells and given squares are read-only.
  const cycle = useCallback(
    (r: number, c: number, dir: number) => {
      if (readonly || isLocked(r, c)) return;
      setStates((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = (next[r][c] + dir + 3) % 3;
        return next;
      });
    },
    [readonly, isLocked]
  );

  const cellFill = (r: number, c: number) => (canon.cells[r][c] === BLACK_CELL ? BLACK_FILL : BOARD_BG);

  const gridLines: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    gridLines.push(
      <line
        key={`h-${r}`}
        x1={0}
        y1={r * CELL_SIZE}
        x2={cols * CELL_SIZE}
        y2={r * CELL_SIZE}
        stroke="black"
        strokeWidth={r === 0 || r === rows ? THICK : THIN}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    gridLines.push(
      <line
        key={`v-${c}`}
        x1={c * CELL_SIZE}
        y1={0}
        x2={c * CELL_SIZE}
        y2={rows * CELL_SIZE}
        stroke="black"
        strokeWidth={c === 0 || c === cols ? THICK : THIN}
      />
    );
  }

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Cell fills */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            return (
              <rect
                key={`fill-${r}-${c}`}
                x={c * CELL_SIZE}
                y={r * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill={cellFill(r, c)}
              />
            );
          })}

          {/* Marked dots */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            if (isLocked(r, c) || states[r][c] !== MARKED) return null;
            return (
              <circle
                key={`dot-${r}-${c}`}
                cx={c * CELL_SIZE + CELL_SIZE / 2}
                cy={r * CELL_SIZE + CELL_SIZE / 2}
                r={4}
                fill="#888"
                pointerEvents="none"
              />
            );
          })}

          {gridLines}

          {/* Squares: givens in black, placed ones in blue */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const given = canon.cells[r][c] === GIVEN;
            if (!given && (isLocked(r, c) || states[r][c] !== SQUARE)) return null;
            const inset = CELL_SIZE * SQUARE_INSET;
            return (
              <rect
                key={`sq-${r}-${c}`}
                x={c * CELL_SIZE + inset}
                y={r * CELL_SIZE + inset}
                width={CELL_SIZE - 2 * inset}
                height={CELL_SIZE - 2 * inset}
                fill={given ? "#fff" : PLACED_FILL}
                stroke={given ? GIVEN_STROKE : PLACED_STROKE}
                strokeWidth={given ? 1.5 : 2}
                pointerEvents="none"
              />
            );
          })}

          {/* Arrow trails on top */}
          {canon.arrows.map((trail, i) => (
            <ArrowTrail key={`arrow-${i}`} trail={trail} cellSize={CELL_SIZE} />
          ))}

          {/* Click targets */}
          {!readonly && Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            if (isLocked(r, c)) return null;
            return (
              <rect
                key={`click-${r}-${c}`}
                x={c * CELL_SIZE}
                y={r * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onClick={() => cycle(r, c, 1)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  cycle(r, c, -1);
                }}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
