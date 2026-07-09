import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { NurimazeCanon } from "../types/canon";

interface NurimazeBoardProps {
  canon: NurimazeCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

function computeRooms(cells: number[][], grids: NurimazeCanon["grids"]): number[][] {
  const rows = cells.length;
  const cols = cells[0].length;
  const roomIds: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let nextId = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (roomIds[r][c] >= 0) continue;
      const id = nextId++;
      const queue: [number, number][] = [[r, c]];
      roomIds[r][c] = id;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        // up
        if (cr > 0 && roomIds[cr - 1][cc] < 0 && grids.h[cr - 1][cc] === 0) {
          roomIds[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        // down
        if (cr < rows - 1 && roomIds[cr + 1][cc] < 0 && grids.h[cr][cc] === 0) {
          roomIds[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        // left
        if (cc > 0 && roomIds[cr][cc - 1] < 0 && grids.v[cr][cc - 1] === 0) {
          roomIds[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        // right
        if (cc < cols - 1 && roomIds[cr][cc + 1] < 0 && grids.v[cr][cc] === 0) {
          roomIds[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return roomIds;
}

function hasSpecialCell(cells: number[][], roomIds: number[][], roomId: number): boolean {
  const rows = cells.length;
  const cols = cells[0].length;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (roomIds[r][c] === roomId && cells[r][c] > 0) return true;
    }
  }
  return false;
}

function validateSolution(
  cells: number[][],
  roomIds: number[][],
  roomStates: Record<number, number>
): boolean {
  const rows = cells.length;
  const cols = cells[0].length;

  // Build cell state grid: 0=white, 1=black, 2=marked
  const stateGrid: number[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => roomStates[roomIds[r][c]] ?? 0)
  );

  // 1. All rooms must have a non-zero state (no white rooms)
  const allRoomIds = new Set<number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      allRoomIds.add(roomIds[r][c]);
    }
  }
  for (const rid of allRoomIds) {
    if ((roomStates[rid] ?? 0) === 0) return false;
  }

  // 2. No 2x2 blocks of all-black or all-white/marked (non-black)
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const s00 = stateGrid[r][c];
      const s01 = stateGrid[r][c + 1];
      const s10 = stateGrid[r + 1][c];
      const s11 = stateGrid[r + 1][c + 1];
      const allBlack = s00 === 1 && s01 === 1 && s10 === 1 && s11 === 1;
      const allNonBlack = s00 !== 1 && s01 !== 1 && s10 !== 1 && s11 !== 1;
      if (allBlack || allNonBlack) return false;
    }
  }

  // 3. White/marked cells must form a connected region
  const nonBlackCells: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (stateGrid[r][c] !== 1) nonBlackCells.push([r, c]);
    }
  }
  if (nonBlackCells.length === 0) return false;

  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const bfsQueue: [number, number][] = [nonBlackCells[0]];
  visited[nonBlackCells[0][0]][nonBlackCells[0][1]] = true;
  let visitedCount = 0;
  while (bfsQueue.length > 0) {
    const [cr, cc] = bfsQueue.shift()!;
    visitedCount++;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc] && stateGrid[nr][nc] !== 1) {
        visited[nr][nc] = true;
        bfsQueue.push([nr, nc]);
      }
    }
  }
  if (visitedCount !== nonBlackCells.length) return false;

  // 4. BFS shortest path from S to G must pass all circles and no triangles
  let sPos: [number, number] | null = null;
  let gPos: [number, number] | null = null;
  const circleCells = new Set<string>();
  const triangleCells = new Set<string>();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] === 3) sPos = [r, c];
      if (cells[r][c] === 4) gPos = [r, c];
      if (cells[r][c] === 1) circleCells.add(`${r},${c}`);
      if (cells[r][c] === 2) triangleCells.add(`${r},${c}`);
    }
  }

  if (!sPos || !gPos) return false;

  // BFS to find shortest path from S to G through non-black cells
  const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const prev = Array.from({ length: rows }, () => Array<[number, number] | null>(cols).fill(null));
  dist[sPos[0]][sPos[1]] = 0;
  const pathQueue: [number, number][] = [sPos];

  while (pathQueue.length > 0) {
    const [cr, cc] = pathQueue.shift()!;
    if (cr === gPos[0] && cc === gPos[1]) break;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && dist[nr][nc] === -1 && stateGrid[nr][nc] !== 1) {
        dist[nr][nc] = dist[cr][cc] + 1;
        prev[nr][nc] = [cr, cc];
        pathQueue.push([nr, nc]);
      }
    }
  }

  if (dist[gPos[0]][gPos[1]] === -1) return false;

  // Reconstruct shortest path
  const pathCells = new Set<string>();
  let cur: [number, number] | null = gPos;
  while (cur) {
    pathCells.add(`${cur[0]},${cur[1]}`);
    cur = prev[cur[0]][cur[1]];
  }

  // All circles must be on the path
  for (const ck of circleCells) {
    if (!pathCells.has(ck)) return false;
  }

  // No triangles on the path
  for (const tk of triangleCells) {
    if (pathCells.has(tk)) return false;
  }

  return true;
}

export default function NurimazeBoard({ canon, initialUserValues, onValuesChange, onComplete, readonly }: NurimazeBoardProps) {
  const { cells, grids } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const roomIds = useMemo(() => computeRooms(cells, grids), [cells, grids]);

  const specialRooms = useMemo(() => {
    const set = new Set<number>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c] > 0) set.add(roomIds[r][c]);
      }
    }
    return set;
  }, [cells, roomIds, rows, cols]);

  const initialRoomStates = useMemo(() => {
    if (!initialUserValues || Object.keys(initialUserValues).length === 0) return {};
    const states: Record<number, number> = {};
    for (const [key, val] of Object.entries(initialUserValues)) {
      const [c, r] = key.split(",").map(Number);
      if (r < rows && c < cols) {
        states[roomIds[r][c]] = val;
      }
    }
    return states;
  }, [initialUserValues, roomIds, rows, cols]);

  const [roomStates, setRoomStates] = useState<Record<number, number>>(initialRoomStates);
  const completedRef = useRef(false);

  useEffect(() => {
    const values: Record<string, number> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const state = roomStates[roomIds[r][c]] ?? 0;
        if (state !== 0) {
          values[`${c},${r}`] = state;
        }
      }
    }
    onValuesChange?.(values);
  }, [roomStates, roomIds, rows, cols, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    // Check if all rooms are assigned
    const allRoomIds = new Set<number>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        allRoomIds.add(roomIds[r][c]);
      }
    }
    const allAssigned = Array.from(allRoomIds).every((rid) => (roomStates[rid] ?? 0) !== 0);
    if (!allAssigned) return;

    if (validateSolution(cells, roomIds, roomStates)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [roomStates, cells, roomIds, rows, cols, onComplete]);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      const rid = roomIds[r][c];
      const currentState = roomStates[rid] ?? 0;
      const isSpecial = specialRooms.has(rid);

      let nextState: number;
      if (isSpecial) {
        // Special rooms toggle: white(0) → marked(2) → white(0)
        nextState = currentState === 0 ? 2 : 0;
      } else {
        // Normal rooms toggle: white(0) → black(1) → marked(2) → white(0)
        nextState = (currentState + 1) % 3;
      }

      setRoomStates((prev) => {
        if (nextState === 0) {
          const next = { ...prev };
          delete next[rid];
          return next;
        }
        return { ...prev, [rid]: nextState };
      });
    },
    [roomIds, roomStates, specialRooms]
  );

  // Render grid lines
  const gridLines: JSX.Element[] = [];

  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      const isThick = isBorder || (r > 0 && r < rows && grids.h[r - 1][c] === 1);
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

  // Vertical lines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick = isBorder || (c > 0 && c < cols && grids.v[r][c - 1] === 1);
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

  // Render symbols
  const symbols: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * CELL_SIZE + CELL_SIZE / 2;
      const cy = r * CELL_SIZE + CELL_SIZE / 2;
      const val = cells[r][c];

      if (val === 1) {
        // Circle
        symbols.push(
          <circle
            key={`sym-${r}-${c}`}
            cx={cx}
            cy={cy}
            r={CELL_SIZE * 0.28}
            fill="none"
            stroke="black"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        );
      } else if (val === 2) {
        // Triangle
        const size = CELL_SIZE * 0.3;
        const points = [
          `${cx},${cy - size}`,
          `${cx - size * 0.87},${cy + size * 0.5}`,
          `${cx + size * 0.87},${cy + size * 0.5}`,
        ].join(" ");
        symbols.push(
          <polygon
            key={`sym-${r}-${c}`}
            points={points}
            fill="none"
            stroke="black"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        );
      } else if (val === 3) {
        // S
        symbols.push(
          <text
            key={`sym-${r}-${c}`}
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={CELL_SIZE * 0.5}
            fontFamily="sans-serif"
            fontWeight="bold"
            fill="black"
            pointerEvents="none"
          >
            S
          </text>
        );
      } else if (val === 4) {
        // G
        symbols.push(
          <text
            key={`sym-${r}-${c}`}
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={CELL_SIZE * 0.5}
            fontFamily="sans-serif"
            fontWeight="bold"
            fill="black"
            pointerEvents="none"
          >
            G
          </text>
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
          {/* Cell fills */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const rid = roomIds[r][c];
            const state = roomStates[rid] ?? 0;
            let fill = "white";
            if (state === 1) fill = "#333";
            return (
              <rect
                key={`fill-${r}-${c}`}
                x={c * CELL_SIZE}
                y={r * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill={fill}
              />
            );
          })}

          {/* Marked dots */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const rid = roomIds[r][c];
            const state = roomStates[rid] ?? 0;
            if (state !== 2) return null;
            return (
              <circle
                key={`dot-${r}-${c}`}
                cx={c * CELL_SIZE + CELL_SIZE / 2}
                cy={r * CELL_SIZE + CELL_SIZE / 2}
                r={4}
                fill="black"
                pointerEvents="none"
              />
            );
          })}

          {/* Grid lines */}
          {gridLines}

          {/* Symbols */}
          {symbols}

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
                onClick={() => handleCellClick(r, c)}
              />
            );
          })}
        </g>
      </svg>
    </div>
  );
}
