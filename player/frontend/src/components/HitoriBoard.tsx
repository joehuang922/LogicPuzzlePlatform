import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { HitoriCanon } from "../types/canon";

interface HitoriBoardProps {
  canon: HitoriCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 2;

// Hitori has no rooms, so shaded cells use a solid black fill with white numbers
// (the number must stay readable to check remaining duplicates).
const BOARD_BG = "#fff";
const SHADE_FILL = "black";
const SHADE_TEXT = "white";

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function isShaded(states: number[][], r: number, c: number): boolean {
  return states[r][c] === 1;
}

// Validate a completed Hitori grid. Unset (0) and marked (2) cells both count
// as unshaded.
//  1. No value repeats among the unshaded cells of any row or column.
//  2. No two shaded cells are orthogonally adjacent.
//  3. All unshaded cells form one orthogonally connected region.
function validateSolution(canon: HitoriCanon, states: number[][]): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return false;

  // 1. Row/column uniqueness among unshaded cells.
  for (let r = 0; r < rows; r++) {
    const seen = new Set<number>();
    for (let c = 0; c < cols; c++) {
      if (isShaded(states, r, c)) continue;
      const v = canon.cells[r][c];
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  for (let c = 0; c < cols; c++) {
    const seen = new Set<number>();
    for (let r = 0; r < rows; r++) {
      if (isShaded(states, r, c)) continue;
      const v = canon.cells[r][c];
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }

  // 2. No orthogonally adjacent shaded cells (checking right and down suffices).
  let unshaded = 0;
  let start: [number, number] | null = null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isShaded(states, r, c)) {
        if (c + 1 < cols && isShaded(states, r, c + 1)) return false;
        if (r + 1 < rows && isShaded(states, r + 1, c)) return false;
      } else {
        unshaded++;
        if (!start) start = [r, c];
      }
    }
  }
  if (!start) return false;

  // 3. Unshaded cells are connected.
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const stack: [number, number][] = [start];
  visited[start[0]][start[1]] = true;
  let reached = 0;
  while (stack.length > 0) {
    const [cr, cc] = stack.pop()!;
    reached++;
    for (const [dr, dc] of DIRS) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (
        nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
        !visited[nr][nc] && !isShaded(states, nr, nc)
      ) {
        visited[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
  }
  return reached === unshaded;
}

export default function HitoriBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: HitoriBoardProps) {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const initialStates = useMemo(() => {
    const states = Array.from({ length: rows }, () => Array(cols).fill(0));
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        const [c, r] = key.split(",").map(Number);
        if (r >= 0 && r < rows && c >= 0 && c < cols && (val === 1 || val === 2)) {
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
    if (validateSolution(canon, states)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, onComplete]);

  // Left-click cycles forward: 0 -> 1 -> 2 -> 0. Right-click cycles backward.
  const cycle = useCallback(
    (r: number, c: number, dir: number) => {
      if (readonly) return;
      setStates((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = (next[r][c] + dir + 3) % 3;
        return next;
      });
    },
    [readonly]
  );

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
                fill={states[r][c] === 1 ? SHADE_FILL : BOARD_BG}
              />
            );
          })}

          {/* Marked cells: circle around the number */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            if (states[r][c] !== 2) return null;
            return (
              <circle
                key={`mark-${r}-${c}`}
                cx={c * CELL_SIZE + CELL_SIZE / 2}
                cy={r * CELL_SIZE + CELL_SIZE / 2}
                r={CELL_SIZE * 0.4}
                fill="none"
                stroke="black"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            );
          })}

          {gridLines}

          {/* Numbers (two-digit values get a smaller font to fit the cell) */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const value = canon.cells[r][c];
            return (
              <text
                key={`num-${r}-${c}`}
                x={c * CELL_SIZE + CELL_SIZE / 2}
                y={r * CELL_SIZE + CELL_SIZE / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={CELL_SIZE * (value >= 10 ? 0.4 : 0.5)}
                fontFamily="sans-serif"
                fontWeight="bold"
                fill={states[r][c] === 1 ? SHADE_TEXT : "black"}
                pointerEvents="none"
              >
                {value}
              </text>
            );
          })}

          {/* Click targets */}
          {!readonly && Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
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
