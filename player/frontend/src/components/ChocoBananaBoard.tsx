import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ChocoBananaCanon } from "../types/canon";

interface ChocoBananaBoardProps {
  canon: ChocoBananaCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;

type Coord = [number, number];

const DIRS: Coord[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// Connected components of cells matching `isShaded`. Returns each component as a
// list of coords.
function components(
  rows: number,
  cols: number,
  isShaded: (r: number, c: number) => boolean,
  wantShaded: boolean
): Coord[][] {
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
  const groups: Coord[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (seen[r][c] || isShaded(r, c) !== wantShaded) continue;
      const group: Coord[] = [];
      const queue: Coord[] = [[r, c]];
      seen[r][c] = true;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        group.push([cr, cc]);
        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (seen[nr][nc] || isShaded(nr, nc) !== wantShaded) continue;
          seen[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
      groups.push(group);
    }
  }
  return groups;
}

// A connected group is a (solid) rectangle iff its bounding-box area equals its
// cell count. Connectivity is guaranteed by construction, so a full bounding box
// implies a rectangle.
function isRectangle(group: Coord[]): boolean {
  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const [r, c] of group) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  const area = (maxR - minR + 1) * (maxC - minC + 1);
  return area === group.length;
}

// Validate a fully-decided Choco Banana grid. `shadedGrid[r][c]` = true means
// chocolate (shaded); false means banana (unshaded — includes unknown/white-mark).
function validateSolution(
  rows: number,
  cols: number,
  cells: number[][],
  shadedGrid: boolean[][]
): boolean {
  const isShaded = (r: number, c: number) => shadedGrid[r][c];

  // Map each cell to its group size, so clue cells can be checked.
  const groupSize = Array.from({ length: rows }, () => Array(cols).fill(0));

  // 1. Every shaded (chocolate) group must be a rectangle.
  const shadedGroups = components(rows, cols, isShaded, true);
  for (const group of shadedGroups) {
    if (!isRectangle(group)) return false;
    for (const [r, c] of group) groupSize[r][c] = group.length;
  }

  // 2. Every unshaded (banana) group must NOT be a rectangle.
  const bananaGroups = components(rows, cols, isShaded, false);
  for (const group of bananaGroups) {
    if (isRectangle(group)) return false;
    for (const [r, c] of group) groupSize[r][c] = group.length;
  }

  // 3. Each clue cell's group size must equal its clue.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = cells[r][c];
      if (clue > 0 && groupSize[r][c] !== clue) return false;
    }
  }

  return true;
}

export default function ChocoBananaBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: ChocoBananaBoardProps) {
  const cells = canon.cells;
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  // Cell states from user values ("c:col,row" -> 1=shaded, 2=white-mark).
  const initialStates = useMemo(() => {
    const map = new Map<string, number>();
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        if (key.startsWith("c:") && (val === 1 || val === 2)) {
          const [c, r] = key.slice(2).split(",").map(Number);
          if (r >= 0 && r < rows && c >= 0 && c < cols) map.set(`${r},${c}`, val);
        }
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cellStates, setCellStates] = useState<Map<string, number>>(initialStates);
  const completedRef = useRef(false);

  // Two-state grid used for rule validation: state 1 = shaded, everything else
  // (unknown or white-mark) = unshaded.
  const shadedGrid = useMemo(() => {
    const grid = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (const [key, state] of cellStates) {
      if (state === 1) {
        const [r, c] = key.split(",").map(Number);
        grid[r][c] = true;
      }
    }
    return grid;
  }, [cellStates, rows, cols]);

  const serializeValues = useCallback((): Record<string, number> => {
    const result: Record<string, number> = {};
    for (const [key, state] of cellStates) {
      if (state !== 1 && state !== 2) continue;
      const [r, c] = key.split(",").map(Number);
      result[`c:${c},${r}`] = state;
    }
    return result;
  }, [cellStates]);

  useEffect(() => {
    onValuesChange?.(serializeValues());
  }, [serializeValues, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSolution(rows, cols, cells, shadedGrid)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [shadedGrid, rows, cols, cells, onComplete]);

  // Left click cycles forward: unknown -> shaded -> unknown.
  // Right click cycles: unknown -> white-mark -> unknown.
  const cycleCell = useCallback(
    (r: number, c: number, target: 1 | 2) => {
      if (readonly) return;
      const key = `${r},${c}`;
      setCellStates((prev) => {
        const next = new Map(prev);
        const cur = next.get(key) ?? 0;
        if (cur === target) next.delete(key);
        else next.set(key, target);
        return next;
      });
    },
    [readonly]
  );

  // Cell fills, white-marks, and clue numbers.
  const fills: JSX.Element[] = [];
  const marks: JSX.Element[] = [];
  const labels: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const state = cellStates.get(`${r},${c}`) ?? 0;
      fills.push(
        <rect
          key={`fill-${r}-${c}`}
          x={c * CELL_SIZE}
          y={r * CELL_SIZE}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={state === 1 ? "#5a3a22" : "white"}
        />
      );
      if (state === 2) {
        marks.push(
          <circle
            key={`mark-${r}-${c}`}
            cx={c * CELL_SIZE + CELL_SIZE / 2}
            cy={r * CELL_SIZE + CELL_SIZE / 2}
            r={4}
            fill="#bbb"
            pointerEvents="none"
          />
        );
      }
      const clue = cells[r][c];
      if (clue > 0) {
        labels.push(
          <text
            key={`clue-${r}-${c}`}
            x={c * CELL_SIZE + CELL_SIZE / 2}
            y={r * CELL_SIZE + CELL_SIZE / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={CELL_SIZE * 0.5}
            fontWeight="bold"
            fill={state === 1 ? "white" : "#222"}
            pointerEvents="none"
          >
            {clue}
          </text>
        );
      }
    }
  }

  // Grid lines (all thin — Choco Banana has no regions).
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
        strokeWidth={r === 0 || r === rows ? 2 : THIN}
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
        strokeWidth={c === 0 || c === cols ? 2 : THIN}
      />
    );
  }

  // Click targets.
  const targets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        targets.push(
          <rect
            key={`click-${r}-${c}`}
            x={c * CELL_SIZE}
            y={r * CELL_SIZE}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => cycleCell(r, c, 1)}
            onContextMenu={(e) => {
              e.preventDefault();
              cycleCell(r, c, 2);
            }}
          />
        );
      }
    }
  }

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {fills}
          {gridLines}
          {marks}
          {labels}
          {targets}
        </g>
      </svg>
    </div>
  );
}
