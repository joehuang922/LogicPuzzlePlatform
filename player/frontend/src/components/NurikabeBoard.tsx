import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { NurikabeCanon } from "../types/canon";

interface NurikabeBoardProps {
  canon: NurikabeCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 2;

// Base board color for unset/clue cells. Light grey so white-marked dots and
// black fills both read clearly.
const BOARD_BG = "#eee";
const BLACK_FILL = "#333";

// Clue cells are always white islands by rule, so a cell is "white" (part of an
// island) when it is either a clue or has not been painted black.
function isBlack(states: number[][], r: number, c: number): boolean {
  return states[r][c] === 1;
}

// Validate a completed Nurikabe grid.
//  1. Every black cell forms one connected sea.
//  2. No 2x2 block is entirely black.
//  3. Each white (non-black) region contains exactly one clue whose value
//     equals the region's size.
function validateSolution(canon: NurikabeCanon, states: number[][]): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return false;

  const DIRS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  // 1. All black cells form a single connected region.
  const blackCells: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBlack(states, r, c)) blackCells.push([r, c]);
    }
  }
  if (blackCells.length === 0) return false;
  {
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const stack: [number, number][] = [blackCells[0]];
    visited[blackCells[0][0]][blackCells[0][1]] = true;
    let seen = 0;
    while (stack.length > 0) {
      const [cr, cc] = stack.pop()!;
      seen++;
      for (const [dr, dc] of DIRS) {
        const nr = cr + dr;
        const nc = cc + dc;
        if (
          nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
          !visited[nr][nc] && isBlack(states, nr, nc)
        ) {
          visited[nr][nc] = true;
          stack.push([nr, nc]);
        }
      }
    }
    if (seen !== blackCells.length) return false;
  }

  // 2. No 2x2 all-black pool.
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (
        isBlack(states, r, c) && isBlack(states, r, c + 1) &&
        isBlack(states, r + 1, c) && isBlack(states, r + 1, c + 1)
      ) {
        return false;
      }
    }
  }

  // 3. Each white region has exactly one clue equal to its size.
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBlack(states, r, c) || visited[r][c]) continue;
      // Flood the white region.
      const stack: [number, number][] = [[r, c]];
      visited[r][c] = true;
      let size = 0;
      let clueCount = 0;
      let clueValue = 0;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        size++;
        const clue = canon.cells[cr][cc];
        if (clue > 0) {
          clueCount++;
          clueValue = clue;
        }
        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (
            nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
            !visited[nr][nc] && !isBlack(states, nr, nc)
          ) {
            visited[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (clueCount !== 1) return false;
      if (clueValue !== size) return false;
    }
  }

  return true;
}

export default function NurikabeBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: NurikabeBoardProps) {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  // Clue lookup: cell "r,c" -> clue value (>0).
  const isClue = useCallback(
    (r: number, c: number) => canon.cells[r]?.[c] > 0,
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
    if (validateSolution(canon, states)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, onComplete]);

  // Left-click cycles forward: 0 -> 1 -> 2 -> 0. Right-click cycles backward.
  // Clue cells are read-only.
  const cycle = useCallback(
    (r: number, c: number, dir: number) => {
      if (readonly || isClue(r, c)) return;
      setStates((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = (next[r][c] + dir + 3) % 3;
        return next;
      });
    },
    [readonly, isClue]
  );

  const cellFill = (r: number, c: number) => {
    if (states[r][c] === 1) return BLACK_FILL;
    return BOARD_BG;
  };

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

          {/* White-marked dots */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            if (states[r][c] !== 2) return null;
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

          {/* Clue numbers */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const clue = canon.cells[r][c];
            if (clue <= 0) return null;
            return (
              <text
                key={`clue-${r}-${c}`}
                x={c * CELL_SIZE + CELL_SIZE / 2}
                y={r * CELL_SIZE + CELL_SIZE / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={CELL_SIZE * 0.5}
                fontFamily="sans-serif"
                fontWeight="bold"
                fill="black"
                pointerEvents="none"
              >
                {clue}
              </text>
            );
          })}

          {/* Click targets */}
          {!readonly && Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            if (isClue(r, c)) return null;
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
