import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { HeyawakeCanon } from "../types/canon";

interface HeyawakeBoardProps {
  canon: HeyawakeCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

// Base board color for unset cells. Light grey so deliberate white marks
// (rendered with a dot) and black fills both read clearly.
const BOARD_BG = "#eee";
const BLACK_FILL = "#333";

// Build a height x width array of room ids (index into canon.rooms) for each
// cell. Cells not covered by any room get -1.
function computeRoomIds(canon: HeyawakeCanon): number[][] {
  const ids = Array.from({ length: canon.height }, () =>
    Array(canon.width).fill(-1)
  );
  canon.rooms.forEach((room, id) => {
    for (let r = room.r; r < room.r + room.h; r++) {
      for (let c = room.c; c < room.c + room.w; c++) {
        if (r >= 0 && r < canon.height && c >= 0 && c < canon.width) {
          ids[r][c] = id;
        }
      }
    }
  });
  return ids;
}

// Count distinct rooms crossed by each maximal run of white (non-black) cells
// along rows and columns. Returns true if no run crosses 3+ rooms.
function whiteLinesOk(
  states: number[][],
  roomIds: number[][],
  rows: number,
  cols: number
): boolean {
  const isWhite = (r: number, c: number) => states[r][c] !== 1;

  // Horizontal runs.
  for (let r = 0; r < rows; r++) {
    let runRooms = new Set<number>();
    for (let c = 0; c <= cols; c++) {
      if (c < cols && isWhite(r, c)) {
        runRooms.add(roomIds[r][c]);
      } else {
        if (runRooms.size > 2) return false;
        runRooms = new Set<number>();
      }
    }
  }
  // Vertical runs.
  for (let c = 0; c < cols; c++) {
    let runRooms = new Set<number>();
    for (let r = 0; r <= rows; r++) {
      if (r < rows && isWhite(r, c)) {
        runRooms.add(roomIds[r][c]);
      } else {
        if (runRooms.size > 2) return false;
        runRooms = new Set<number>();
      }
    }
  }
  return true;
}

function validateSolution(
  canon: HeyawakeCanon,
  states: number[][],
  roomIds: number[][]
): boolean {
  const rows = canon.height;
  const cols = canon.width;

  // 1. Each clued room contains exactly its clue count of black cells.
  const blackPerRoom = new Array(canon.rooms.length).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (states[r][c] === 1) {
        const rid = roomIds[r][c];
        if (rid >= 0) blackPerRoom[rid]++;
      }
    }
  }
  for (let i = 0; i < canon.rooms.length; i++) {
    const clue = canon.rooms[i].clue;
    if (clue !== null && clue !== undefined && blackPerRoom[i] !== clue) {
      return false;
    }
  }

  // 2. No two black cells orthogonally adjacent.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (states[r][c] !== 1) continue;
      if (c + 1 < cols && states[r][c + 1] === 1) return false;
      if (r + 1 < rows && states[r + 1][c] === 1) return false;
    }
  }

  // 3. All white (non-black) cells form a single connected region.
  const whiteCells: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (states[r][c] !== 1) whiteCells.push([r, c]);
    }
  }
  if (whiteCells.length === 0) return false;
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const queue: [number, number][] = [whiteCells[0]];
  visited[whiteCells[0][0]][whiteCells[0][1]] = true;
  let seen = 0;
  while (queue.length > 0) {
    const [cr, cc] = queue.pop()!;
    seen++;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (
        nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
        !visited[nr][nc] && states[nr][nc] !== 1
      ) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }
  if (seen !== whiteCells.length) return false;

  // 4. No straight white run crosses 3+ rooms.
  if (!whiteLinesOk(states, roomIds, rows, cols)) return false;

  return true;
}

export default function HeyawakeBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: HeyawakeBoardProps) {
  const rows = canon.height;
  const cols = canon.width;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const roomIds = useMemo(() => computeRoomIds(canon), [canon]);

  const initialStates = useMemo(() => {
    const states = Array.from({ length: rows }, () => Array(cols).fill(0));
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        const [c, r] = key.split(",").map(Number);
        if (r >= 0 && r < rows && c >= 0 && c < cols) states[r][c] = val;
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
    if (validateSolution(canon, states, roomIds)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [states, canon, roomIds, onComplete]);

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

  // Clue lookup keyed by top-left cell "r,c".
  const clueAt = useMemo(() => {
    const map = new Map<string, number>();
    for (const room of canon.rooms) {
      if (room.clue !== null && room.clue !== undefined) {
        map.set(`${room.r},${room.c}`, room.clue);
      }
    }
    return map;
  }, [canon]);

  const cellFill = (r: number, c: number) => {
    const s = states[r][c];
    if (s === 1) return BLACK_FILL;
    return BOARD_BG;
  };

  const gridLines: JSX.Element[] = [];
  // Horizontal lines: thick where cells above/below differ (room boundary) or border.
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      const isThick =
        isBorder || roomIds[r - 1][c] !== roomIds[r][c];
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
  // Vertical lines.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick =
        isBorder || roomIds[r][c - 1] !== roomIds[r][c];
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

          {/* Clue numbers (top-left cell of clued rooms) */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const clue = clueAt.get(`${r},${c}`);
            if (clue === undefined) return null;
            const onBlack = states[r][c] === 1;
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
                fill={onBlack ? "white" : "black"}
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
