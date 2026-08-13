import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { NorinoriCanon } from "../types/canon";

interface NorinoriBoardProps {
  canon: NorinoriCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

type Coord = [number, number];

// ---------------------------------------------------------------------------
// Region detection from thick borders (same convention as LITS / Nurimaze).
// ---------------------------------------------------------------------------

function computeRegions(rows: number, cols: number, hEdges: number[][], vEdges: number[][]): number[][] {
  const regionIds: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let nextId = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (regionIds[r][c] >= 0) continue;
      const id = nextId++;
      const queue: Coord[] = [[r, c]];
      regionIds[r][c] = id;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        if (cr > 0 && regionIds[cr - 1][cc] < 0 && hEdges[cr - 1][cc] === 0) {
          regionIds[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && regionIds[cr + 1][cc] < 0 && hEdges[cr][cc] === 0) {
          regionIds[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        if (cc > 0 && regionIds[cr][cc - 1] < 0 && vEdges[cr][cc - 1] === 0) {
          regionIds[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && regionIds[cr][cc + 1] < 0 && vEdges[cr][cc] === 0) {
          regionIds[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return regionIds;
}

// A Norinori solution is valid when:
//   1. Every region contains exactly two shaded cells.
//   2. Every shaded cell has exactly one orthogonally-adjacent shaded cell
//      (so all shaded cells partition into dominoes). Dominoes may cross
//      region boundaries.
function validateSolution(
  rows: number,
  cols: number,
  regionIds: number[][],
  shaded: Set<string>
): boolean {
  // 1. Exactly two shaded cells per region.
  const regionCounts = new Map<number, number>();
  const allRegions = new Set<number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      allRegions.add(regionIds[r][c]);
      if (shaded.has(`${r},${c}`)) {
        const rid = regionIds[r][c];
        regionCounts.set(rid, (regionCounts.get(rid) ?? 0) + 1);
      }
    }
  }
  for (const rid of allRegions) {
    if ((regionCounts.get(rid) ?? 0) !== 2) return false;
  }

  // 2. Every shaded cell has exactly one shaded orthogonal neighbor.
  if (shaded.size === 0) return false;
  for (const key of shaded) {
    const [r, c] = key.split(",").map(Number);
    let neighbors = 0;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Coord[]) {
      if (shaded.has(`${r + dr},${c + dc}`)) neighbors++;
    }
    if (neighbors !== 1) return false;
  }

  return true;
}

export default function NorinoriBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: NorinoriBoardProps) {
  const { grids } = canon;
  const hEdges = grids.h;
  const vEdges = grids.v;
  const rows = hEdges.length + 1;
  const cols = vEdges[0].length + 1;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const regionIds = useMemo(
    () => computeRegions(rows, cols, hEdges, vEdges),
    [rows, cols, hEdges, vEdges]
  );

  // Cell states from user values ("c:col,row" -> 1=black, 2=marked).
  // "marked" (a centered dot) is a solver aid and counts as NOT shaded.
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

  // The set of shaded (black) cells — the only state that matters for rules.
  const shaded = useMemo(() => {
    const set = new Set<string>();
    for (const [key, state] of cellStates) {
      if (state === 1) set.add(key);
    }
    return set;
  }, [cellStates]);

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
    if (validateSolution(rows, cols, regionIds, shaded)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [shaded, rows, cols, regionIds, onComplete]);

  // Left click cycles forward: empty -> black -> marked -> empty.
  // Right click cycles backward: empty -> marked -> black -> empty.
  const cycleCell = useCallback(
    (r: number, c: number, dir: 1 | -1) => {
      if (readonly) return;
      const key = `${r},${c}`;
      setCellStates((prev) => {
        const next = new Map(prev);
        const cur = next.get(key) ?? 0;
        const state = (cur + dir + 3) % 3;
        if (state === 0) next.delete(key);
        else next.set(key, state);
        return next;
      });
    },
    [readonly]
  );

  // Cell fills and marked-cell dots
  const fills: JSX.Element[] = [];
  const marks: JSX.Element[] = [];
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
          fill={state === 1 ? "#333" : "white"}
        />
      );
      if (state === 2) {
        marks.push(
          <circle
            key={`mark-${r}-${c}`}
            cx={c * CELL_SIZE + CELL_SIZE / 2}
            cy={r * CELL_SIZE + CELL_SIZE / 2}
            r={4}
            fill="black"
            pointerEvents="none"
          />
        );
      }
    }
  }

  // Grid lines: thick = region border (or outer perimeter), thin = cell divider.
  const gridLines: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      const isThick = isBorder || (r > 0 && r < rows && hEdges[r - 1][c] === 1);
      gridLines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={(c + 1) * CELL_SIZE}
          y2={r * CELL_SIZE}
          stroke="black"
          strokeWidth={isThick ? THICK : THIN}
        />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick = isBorder || (c > 0 && c < cols && vEdges[r][c - 1] === 1);
      gridLines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={c * CELL_SIZE}
          y2={(r + 1) * CELL_SIZE}
          stroke="black"
          strokeWidth={isThick ? THICK : THIN}
        />
      );
    }
  }

  // Click targets
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
              cycleCell(r, c, -1);
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
          {targets}
        </g>
      </svg>
    </div>
  );
}
