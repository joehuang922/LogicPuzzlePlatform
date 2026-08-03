import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { LitsCanon } from "../types/canon";

interface LitsBoardProps {
  canon: LitsCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

// ---------------------------------------------------------------------------
// Tetromino classification (L, I, T, S — up to rotation and reflection).
// The O (2x2 square) tetromino is not a valid LITS piece.
// ---------------------------------------------------------------------------

type Coord = [number, number];

function normalize(coords: Coord[]): Coord[] {
  const minR = Math.min(...coords.map(([r]) => r));
  const minC = Math.min(...coords.map(([, c]) => c));
  return coords
    .map(([r, c]) => [r - minR, c - minC] as Coord)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function serialize(coords: Coord[]): string {
  return normalize(coords)
    .map(([r, c]) => `${r},${c}`)
    .join(";");
}

// Canonical signature invariant under the 4 rotations x 2 reflections.
function canonicalKey(coords: Coord[]): string {
  let variant = coords.map(([r, c]) => [r, c] as Coord);
  const keys: string[] = [];
  for (let refl = 0; refl < 2; refl++) {
    for (let rot = 0; rot < 4; rot++) {
      keys.push(serialize(variant));
      // rotate 90deg: (r, c) -> (c, -r)
      variant = variant.map(([r, c]) => [c, -r] as Coord);
    }
    // reflect: (r, c) -> (r, -c)
    variant = variant.map(([r, c]) => [r, -c] as Coord);
  }
  keys.sort();
  return keys[0];
}

// Reference shapes -> canonical key -> tetromino letter.
const TETROMINO_KEYS: Record<string, string> = (() => {
  const refs: Record<string, Coord[]> = {
    I: [[0, 0], [0, 1], [0, 2], [0, 3]],
    L: [[0, 0], [1, 0], [2, 0], [2, 1]],
    T: [[0, 0], [0, 1], [0, 2], [1, 1]],
    S: [[0, 1], [0, 2], [1, 0], [1, 1]],
    O: [[0, 0], [0, 1], [1, 0], [1, 1]],
  };
  const map: Record<string, string> = {};
  for (const [letter, coords] of Object.entries(refs)) {
    map[canonicalKey(coords)] = letter;
  }
  return map;
})();

// Classify 4 connected cells. Returns "L" | "I" | "T" | "S", or null if the
// cells are not a valid (non-O) tetromino.
function classifyTetromino(coords: Coord[]): string | null {
  if (coords.length !== 4) return null;
  const letter = TETROMINO_KEYS[canonicalKey(coords)];
  if (!letter || letter === "O") return null;
  return letter;
}

// ---------------------------------------------------------------------------
// Region detection from thick borders (same convention as Nurimaze).
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

// Group shaded cells by region and classify each region's tetromino.
// Returns a map regionId -> letter for regions that hold exactly one valid
// (connected, non-O) tetromino.
function classifyRegions(
  rows: number,
  cols: number,
  regionIds: number[][],
  shaded: Set<string>
): Map<number, string> {
  const byRegion = new Map<number, Coord[]>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!shaded.has(`${r},${c}`)) continue;
      const rid = regionIds[r][c];
      if (!byRegion.has(rid)) byRegion.set(rid, []);
      byRegion.get(rid)!.push([r, c]);
    }
  }

  const result = new Map<number, string>();
  for (const [rid, cells] of byRegion) {
    if (cells.length !== 4) continue;
    // must be orthogonally connected
    if (!isConnected(cells)) continue;
    const letter = classifyTetromino(cells);
    if (letter) result.set(rid, letter);
  }
  return result;
}

function isConnected(cells: Coord[]): boolean {
  if (cells.length === 0) return false;
  const set = new Set(cells.map(([r, c]) => `${r},${c}`));
  const visited = new Set<string>();
  const queue: Coord[] = [cells[0]];
  visited.add(`${cells[0][0]},${cells[0][1]}`);
  while (queue.length > 0) {
    const [r, c] = queue.pop()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const key = `${r + dr},${c + dc}`;
      if (set.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([r + dr, c + dc]);
      }
    }
  }
  return visited.size === cells.length;
}

function validateSolution(
  rows: number,
  cols: number,
  regionIds: number[][],
  shaded: Set<string>
): boolean {
  // Count regions
  const allRegions = new Set<number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) allRegions.add(regionIds[r][c]);
  }

  // 1. Every region holds exactly one valid tetromino
  const regionTypes = classifyRegions(rows, cols, regionIds, shaded);
  if (regionTypes.size !== allRegions.size) return false;

  // 2. All shaded cells form a single orthogonally connected group
  const shadedCoords: Coord[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (shaded.has(`${r},${c}`)) shadedCoords.push([r, c]);
    }
  }
  if (shadedCoords.length === 0) return false;
  if (!isConnected(shadedCoords)) return false;

  // 3. No fully-shaded 2x2 area
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (
        shaded.has(`${r},${c}`) &&
        shaded.has(`${r},${c + 1}`) &&
        shaded.has(`${r + 1},${c}`) &&
        shaded.has(`${r + 1},${c + 1}`)
      ) {
        return false;
      }
    }
  }

  // 4. No two orthogonally adjacent tetrominoes share the same shape type.
  //    Check adjacent shaded cells that belong to different regions.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!shaded.has(`${r},${c}`)) continue;
      const rid = regionIds[r][c];
      for (const [dr, dc] of [[1, 0], [0, 1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= rows || nc >= cols) continue;
        if (!shaded.has(`${nr},${nc}`)) continue;
        const nrid = regionIds[nr][nc];
        if (nrid === rid) continue;
        if (regionTypes.get(rid) === regionTypes.get(nrid)) return false;
      }
    }
  }

  return true;
}

export default function LitsBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: LitsBoardProps) {
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
