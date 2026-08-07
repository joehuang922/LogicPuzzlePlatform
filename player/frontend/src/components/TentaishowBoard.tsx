import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { TentaishowCanon } from "../types/canon";

interface TentaishowBoardProps {
  canon: TentaishowCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 40;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

// Two-tone checkerboard shades for enclosed single-dot regions.
const SHADE_A = "#dbeafe";
const SHADE_B = "#fde68a";

// Flood-fill cells into region ids across edges that have no wall.
function computeRegions(
  rows: number,
  cols: number,
  hEdges: number[][],
  vEdges: number[][]
): number[][] {
  const ids: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let next = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (ids[r][c] >= 0) continue;
      const id = next++;
      const queue: [number, number][] = [[r, c]];
      ids[r][c] = id;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        if (cr > 0 && ids[cr - 1][cc] < 0 && hEdges[cr - 1][cc] === 0) {
          ids[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && ids[cr + 1][cc] < 0 && hEdges[cr][cc] === 0) {
          ids[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        if (cc > 0 && ids[cr][cc - 1] < 0 && vEdges[cr][cc - 1] === 0) {
          ids[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && ids[cr][cc + 1] < 0 && vEdges[cr][cc] === 0) {
          ids[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return ids;
}

// The cells (r,c) that a dot at doubled coord (dr,dc) sits on:
// odd => single index (dr-1)/2; even => two indices dr/2-1 and dr/2.
function dotCellRows(dr: number): number[] {
  return dr % 2 === 1 ? [(dr - 1) / 2] : [dr / 2 - 1, dr / 2];
}
function dotCellCols(dc: number): number[] {
  return dc % 2 === 1 ? [(dc - 1) / 2] : [dc / 2 - 1, dc / 2];
}

// Assign each dot to the region of the cells it touches. Returns per-dot
// region id, or -1 if the dot straddles a wall (touching cells differ).
function assignDotsToRegions(
  canon: TentaishowCanon,
  regionIds: number[][]
): number[] {
  const rows = canon.height;
  const cols = canon.width;
  return canon.dots.map((dot) => {
    const rs = dotCellRows(dot.dr);
    const cs = dotCellCols(dot.dc);
    let region = -1;
    for (const r of rs) {
      for (const c of cs) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) return -1;
        const id = regionIds[r][c];
        if (region === -1) region = id;
        else if (region !== id) return -1;
      }
    }
    return region;
  });
}

function validateSolution(
  canon: TentaishowCanon,
  hEdges: number[][],
  vEdges: number[][]
): boolean {
  const rows = canon.height;
  const cols = canon.width;
  const regionIds = computeRegions(rows, cols, hEdges, vEdges);

  // Assign each dot to a region; each dot must sit cleanly inside one region.
  const dotRegion = assignDotsToRegions(canon, regionIds);
  if (dotRegion.some((id) => id < 0)) return false;

  // Each region must contain exactly one dot.
  const dotCount = new Map<number, number>();
  for (const id of dotRegion) dotCount.set(id, (dotCount.get(id) ?? 0) + 1);
  const regionSet = new Set<number>();
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) regionSet.add(regionIds[r][c]);
  for (const id of regionSet) {
    if ((dotCount.get(id) ?? 0) !== 1) return false;
  }

  // Map region id -> its dot for the symmetry check.
  const regionDot = new Map<number, { dr: number; dc: number }>();
  canon.dots.forEach((dot, i) => regionDot.set(dotRegion[i], dot));

  // Every cell's 180-degree partner about its region's dot must be in-bounds
  // and belong to the same region.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dot = regionDot.get(regionIds[r][c])!;
      const pr = dot.dr - r - 1;
      const pc = dot.dc - c - 1;
      if (pr < 0 || pr >= rows || pc < 0 || pc >= cols) return false;
      if (regionIds[pr][pc] !== regionIds[r][c]) return false;
    }
  }

  return true;
}

// Greedy 2-coloring of the adjacency graph of single-dot regions, so adjacent
// regions get contrasting shades. Falls back gracefully when a proper
// 2-coloring is impossible (just reuses a color).
function twoColorRegions(
  rows: number,
  cols: number,
  regionIds: number[][],
  hEdges: number[][],
  vEdges: number[][],
  shaded: Set<number>
): Map<number, number> {
  const adj = new Map<number, Set<number>>();
  const add = (a: number, b: number) => {
    if (a === b || !shaded.has(a) || !shaded.has(b)) return;
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = regionIds[r][c];
      if (r < rows - 1 && hEdges[r][c] === 1) {
        add(id, regionIds[r + 1][c]);
        add(regionIds[r + 1][c], id);
      }
      if (c < cols - 1 && vEdges[r][c] === 1) {
        add(id, regionIds[r][c + 1]);
        add(regionIds[r][c + 1], id);
      }
    }
  }
  const color = new Map<number, number>();
  const ordered = Array.from(shaded).sort((a, b) => a - b);
  for (const id of ordered) {
    if (color.has(id)) continue;
    // BFS coloring from this region.
    const queue = [id];
    color.set(id, 0);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const cc = color.get(cur)!;
      for (const nb of adj.get(cur) ?? []) {
        if (!color.has(nb)) {
          color.set(nb, cc ^ 1);
          queue.push(nb);
        }
      }
    }
  }
  return color;
}

export default function TentaishowBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: TentaishowBoardProps) {
  const rows = canon.height;
  const cols = canon.width;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const emptyH = () => Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  const emptyV = () => Array.from({ length: rows }, () => Array(cols - 1).fill(0));

  const initialState = useMemo(() => {
    const h = emptyH();
    const v = emptyV();
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        if (key.startsWith("h:")) {
          const [rStr, cStr] = key.slice(2).split(",");
          const r = parseInt(rStr);
          const c = parseInt(cStr);
          if (r >= 0 && r < rows - 1 && c >= 0 && c < cols) h[r][c] = val;
        } else if (key.startsWith("v:")) {
          const [rStr, cStr] = key.slice(2).split(",");
          const r = parseInt(rStr);
          const c = parseInt(cStr);
          if (r >= 0 && r < rows && c >= 0 && c < cols - 1) v[r][c] = val;
        }
      }
    }
    return { h, v };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [hEdges, setHEdges] = useState<number[][]>(initialState.h);
  const [vEdges, setVEdges] = useState<number[][]>(initialState.v);
  const completedRef = useRef(false);

  const serializeValues = useCallback((): Record<string, number> => {
    const result: Record<string, number> = {};
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        if (hEdges[r][c] === 1) result[`h:${r},${c}`] = 1;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (vEdges[r][c] === 1) result[`v:${r},${c}`] = 1;
      }
    }
    return result;
  }, [hEdges, vEdges, rows, cols]);

  useEffect(() => {
    onValuesChange?.(serializeValues());
  }, [serializeValues, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSolution(canon, hEdges, vEdges)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [hEdges, vEdges, canon, onComplete]);

  const handleHEdgeClick = useCallback(
    (r: number, c: number) => {
      if (readonly) return;
      setHEdges((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 0 ? 1 : 0;
        return next;
      });
    },
    [readonly]
  );

  const handleVEdgeClick = useCallback(
    (r: number, c: number) => {
      if (readonly) return;
      setVEdges((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 0 ? 1 : 0;
        return next;
      });
    },
    [readonly]
  );

  // Region shading: shade every region that contains exactly one dot, using a
  // two-tone checkerboard so adjacent regions contrast.
  const shading = useMemo(() => {
    const regionIds = computeRegions(rows, cols, hEdges, vEdges);
    const dotRegion = assignDotsToRegions(canon, regionIds);
    const dotCount = new Map<number, number>();
    for (const id of dotRegion) {
      if (id >= 0) dotCount.set(id, (dotCount.get(id) ?? 0) + 1);
    }
    const shaded = new Set<number>();
    for (const [id, count] of dotCount) {
      if (count === 1) shaded.add(id);
    }
    const color = twoColorRegions(rows, cols, regionIds, hEdges, vEdges, shaded);
    return { regionIds, shaded, color };
  }, [canon, rows, cols, hEdges, vEdges]);

  const elements: JSX.Element[] = [];

  // Cell backgrounds (region shading).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = shading.regionIds[r][c];
      let fill = "white";
      if (shading.shaded.has(id)) {
        fill = shading.color.get(id) === 1 ? SHADE_B : SHADE_A;
      }
      elements.push(
        <rect
          key={`bg-${r}-${c}`}
          x={c * CELL_SIZE}
          y={r * CELL_SIZE}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={fill}
        />
      );
    }
  }

  // Grid lines (dashed interior, thick walls, thick border).
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
          strokeDasharray={isThick ? undefined : "3,3"}
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
          strokeDasharray={isThick ? undefined : "3,3"}
        />
      );
    }
  }

  // Dots at doubled coordinates: pixel = (doubled / 2) * CELL_SIZE.
  const dots: JSX.Element[] = [];
  canon.dots.forEach((dot, i) => {
    const cx = (dot.dc / 2) * CELL_SIZE;
    const cy = (dot.dr / 2) * CELL_SIZE;
    const rad = CELL_SIZE * 0.18;
    dots.push(
      <circle
        key={`dot-${i}`}
        cx={cx}
        cy={cy}
        r={rad}
        fill={dot.color === 1 ? "#111" : "white"}
        stroke="#111"
        strokeWidth={2}
        pointerEvents="none"
      />
    );
  });

  // Edge click targets.
  const edgeTargets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        edgeTargets.push(
          <rect
            key={`he-${r}-${c}`}
            x={c * CELL_SIZE}
            y={(r + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2}
            width={CELL_SIZE}
            height={EDGE_HIT_WIDTH}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => handleHEdgeClick(r, c)}
          />
        );
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        edgeTargets.push(
          <rect
            key={`ve-${r}-${c}`}
            x={(c + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2}
            y={r * CELL_SIZE}
            width={EDGE_HIT_WIDTH}
            height={CELL_SIZE}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => handleVEdgeClick(r, c)}
          />
        );
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {elements}
            {gridLines}
            {dots}
            {edgeTargets}
          </g>
        </svg>
      </div>
    </div>
  );
}
