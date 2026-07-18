import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { NuritwinCanon } from "../types/canon";

interface NuritwinBoardProps {
  canon: NuritwinCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

function computeRooms(cells: number[][], grids: NuritwinCanon["grids"]): number[][] {
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
        if (cr > 0 && roomIds[cr - 1][cc] < 0 && grids.h[cr - 1][cc] === 0) {
          roomIds[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && roomIds[cr + 1][cc] < 0 && grids.h[cr][cc] === 0) {
          roomIds[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        if (cc > 0 && roomIds[cr][cc - 1] < 0 && grids.v[cr][cc - 1] === 0) {
          roomIds[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && roomIds[cr][cc + 1] < 0 && grids.v[cr][cc] === 0) {
          roomIds[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return roomIds;
}

function findConnectedComponents(
  cells: [number, number][],
  cellSet: Set<string>
): [number, number][][] {
  const visited = new Set<string>();
  const components: [number, number][][] = [];
  for (const [r, c] of cells) {
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const comp: [number, number][] = [[r, c]];
    const queue: [number, number][] = [[r, c]];
    while (queue.length > 0) {
      const [cr, cc] = queue.pop()!;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as [number, number][]) {
        const nr = cr + dr;
        const nc = cc + dc;
        const nk = `${nr},${nc}`;
        if (cellSet.has(nk) && !visited.has(nk)) {
          visited.add(nk);
          comp.push([nr, nc]);
          queue.push([nr, nc]);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

function validateSolution(
  canon: NuritwinCanon,
  roomIds: number[][],
  stateGrid: number[][]
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // Rule 4: No 2x2 all-black
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (
        stateGrid[r][c] === 1 &&
        stateGrid[r][c + 1] === 1 &&
        stateGrid[r + 1][c] === 1 &&
        stateGrid[r + 1][c + 1] === 1
      ) {
        return false;
      }
    }
  }

  // Rule 3: All black cells must form one connected component
  const blackCells: [number, number][] = [];
  const blackSet = new Set<string>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (stateGrid[r][c] === 1) {
        blackCells.push([r, c]);
        blackSet.add(`${r},${c}`);
      }
    }
  }
  if (blackCells.length === 0) return false;
  const globalComps = findConnectedComponents(blackCells, blackSet);
  if (globalComps.length !== 1) return false;

  // Rules 1 & 2: Per-room twin constraint
  const roomCells = new Map<number, [number, number][]>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rid = roomIds[r][c];
      if (!roomCells.has(rid)) roomCells.set(rid, []);
      roomCells.get(rid)!.push([r, c]);
    }
  }

  // Find clue for each room
  const roomClue = new Map<number, number>();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] > 0) {
        roomClue.set(roomIds[r][c], canon.cells[r][c]);
      }
    }
  }

  for (const [rid, rCells] of roomCells) {
    const blackInRoom = rCells.filter(([r, c]) => stateGrid[r][c] === 1);
    const blackInRoomSet = new Set(blackInRoom.map(([r, c]) => `${r},${c}`));
    const comps = findConnectedComponents(blackInRoom, blackInRoomSet);

    if (comps.length !== 2) return false;
    if (comps[0].length !== comps[1].length) return false;

    const clue = roomClue.get(rid);
    if (clue !== undefined && comps[0].length !== clue) return false;
  }

  return true;
}

export default function NuritwinBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: NuritwinBoardProps) {
  const { cells, grids } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const roomIds = useMemo(() => computeRooms(cells, grids), [cells, grids]);

  const initialStates = useMemo(() => {
    const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        const [c, r] = key.split(",").map(Number);
        if (r < rows && c < cols) {
          grid[r][c] = val;
        }
      }
    }
    return grid;
  }, [initialUserValues, rows, cols]);

  const [stateGrid, setStateGrid] = useState<number[][]>(initialStates);
  const completedRef = useRef(false);

  useEffect(() => {
    const values: Record<string, number> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const state = stateGrid[r][c];
        if (state !== 0) {
          values[`${c},${r}`] = state;
        }
      }
    }
    onValuesChange?.(values);
  }, [stateGrid, rows, cols, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    // Check if all cells are assigned
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (stateGrid[r][c] === 0) return;
      }
    }
    if (validateSolution(canon, roomIds, stateGrid)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [stateGrid, canon, roomIds, rows, cols, onComplete]);

  const handleCellClick = useCallback(
    (r: number, c: number, reverse: boolean) => {
      if (readonly) return;
      setStateGrid((prev) => {
        const next = prev.map((row) => [...row]);
        const current = prev[r][c];
        if (reverse) {
          // empty(0) → marked(2) → black(1) → empty(0)
          next[r][c] = current === 0 ? 2 : current === 2 ? 1 : 0;
        } else {
          // empty(0) → black(1) → marked(2) → empty(0)
          next[r][c] = (current + 1) % 3;
        }
        return next;
      });
    },
    [readonly]
  );

  const gridLines: JSX.Element[] = [];
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

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Cell fills */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const state = stateGrid[r][c];
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
            if (stateGrid[r][c] !== 2) return null;
            return (
              <circle
                key={`dot-${r}-${c}`}
                cx={c * CELL_SIZE + CELL_SIZE / 2}
                cy={r * CELL_SIZE + CELL_SIZE / 2}
                r={4}
                fill="#666"
                pointerEvents="none"
              />
            );
          })}

          {/* Grid lines */}
          {gridLines}

          {/* Clue numbers */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const val = cells[r][c];
            if (val === 0) return null;
            const isBlack = stateGrid[r][c] === 1;
            return (
              <text
                key={`clue-${r}-${c}`}
                x={c * CELL_SIZE + CELL_SIZE / 2}
                y={r * CELL_SIZE + CELL_SIZE / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={CELL_SIZE * 0.45}
                fontFamily="sans-serif"
                fontWeight="bold"
                fill={isBlack ? "white" : "black"}
                pointerEvents="none"
              >
                {val}
              </text>
            );
          })}

          {/* Click targets */}
          {!readonly &&
            Array.from({ length: rows * cols }, (_, i) => {
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
                  onClick={() => handleCellClick(r, c, false)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    handleCellClick(r, c, true);
                  }}
                />
              );
            })}
        </g>
      </svg>
    </div>
  );
}
