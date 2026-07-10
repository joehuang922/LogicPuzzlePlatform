import { useState, useEffect, useCallback, useRef } from "react";
import { DoubleChocoCanon, DoubleChocoAnswer } from "../types/canon";

interface DoubleChocoBoardProps {
  canon: DoubleChocoCanon;
  initialAnswer?: DoubleChocoAnswer | null;
  onAnswerChange?: (answer: DoubleChocoAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

function computeRooms(
  rows: number,
  cols: number,
  hGrids: number[][],
  vGrids: number[][]
): number[][] {
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
        if (cr > 0 && roomIds[cr - 1][cc] < 0 && hGrids[cr - 1][cc] === 0) {
          roomIds[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && roomIds[cr + 1][cc] < 0 && hGrids[cr][cc] === 0) {
          roomIds[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        if (cc > 0 && roomIds[cr][cc - 1] < 0 && vGrids[cr][cc - 1] === 0) {
          roomIds[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && roomIds[cr][cc + 1] < 0 && vGrids[cr][cc] === 0) {
          roomIds[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return roomIds;
}

function normalizeShape(coords: [number, number][]): string {
  if (coords.length === 0) return "";
  const minR = Math.min(...coords.map(([r]) => r));
  const minC = Math.min(...coords.map(([, c]) => c));
  const normalized = coords.map(([r, c]) => [r - minR, c - minC] as [number, number]);
  normalized.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return normalized.map(([r, c]) => `${r},${c}`).join("|");
}

function allRotationsAndReflections(shape: string): string[] {
  if (!shape) return [shape];
  const coords = shape.split("|").map((s) => s.split(",").map(Number) as [number, number]);
  const variants: string[] = [];

  let current = coords;
  for (let rot = 0; rot < 4; rot++) {
    variants.push(normalizeShape(current));
    variants.push(normalizeShape(current.map(([r, c]) => [r, -c])));
    current = current.map(([r, c]) => [c, -r]);
  }
  return variants;
}

function validateSolution(
  cells: [number, number][][],
  hGrids: number[][],
  vGrids: number[][]
): boolean {
  const rows = cells.length;
  const cols = cells[0].length;
  const roomIds = computeRooms(rows, cols, hGrids, vGrids);

  const roomCells: Map<number, { whites: [number, number][]; grays: [number, number][] }> = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rid = roomIds[r][c];
      if (!roomCells.has(rid)) roomCells.set(rid, { whites: [], grays: [] });
      const entry = roomCells.get(rid)!;
      if (cells[r][c][0] === 0) entry.whites.push([r, c]);
      else entry.grays.push([r, c]);
    }
  }

  for (const [, { whites, grays }] of roomCells) {
    // Rule 1: equal number of white and gray cells
    if (whites.length !== grays.length) return false;
    if (whites.length === 0) return false;

    // Rule 2: white cells connected, gray cells connected
    if (!isConnected(whites, rows, cols)) return false;
    if (!isConnected(grays, rows, cols)) return false;

    // Rule 3: same shape (allowing rotation and reflection)
    const whiteShape = normalizeShape(whites);
    const grayShape = normalizeShape(grays);
    const grayVariants = allRotationsAndReflections(grayShape);
    if (!grayVariants.includes(whiteShape)) return false;

    // Rule 4: number clues must match chunk size
    const allCells = [...whites, ...grays];
    for (const [r, c] of allCells) {
      const num = cells[r][c][1];
      if (num > 0 && num !== whites.length) return false;
    }
  }

  // Rule 5: no redundant thick edges inside a room
  // (Every thick edge should separate two different rooms)
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (hGrids[r][c] === 1 && roomIds[r][c] === roomIds[r + 1][c]) return false;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (vGrids[r][c] === 1 && roomIds[r][c] === roomIds[r][c + 1]) return false;
    }
  }

  return true;
}

function isConnected(coords: [number, number][], _rows: number, _cols: number): boolean {
  if (coords.length <= 1) return true;
  const set = new Set(coords.map(([r, c]) => `${r},${c}`));
  const visited = new Set<string>();
  const queue: [number, number][] = [coords[0]];
  visited.add(`${coords[0][0]},${coords[0][1]}`);

  while (queue.length > 0) {
    const [cr, cc] = queue.pop()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const key = `${cr + dr},${cc + dc}`;
      if (set.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([cr + dr, cc + dc]);
      }
    }
  }
  return visited.size === coords.length;
}

export default function DoubleChocoBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: DoubleChocoBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const emptyH = () => Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  const emptyV = () => Array.from({ length: rows }, () => Array(cols - 1).fill(0));

  const [hGrids, setHGrids] = useState<number[][]>(initialAnswer?.grids?.h ?? emptyH());
  const [vGrids, setVGrids] = useState<number[][]>(initialAnswer?.grids?.v ?? emptyV());
  const completedRef = useRef(false);

  useEffect(() => {
    const answer: DoubleChocoAnswer = { grids: { h: hGrids, v: vGrids } };
    onAnswerChange?.(answer);
  }, [hGrids, vGrids, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    // Check if any thick edges exist before validating
    const hasAnyThick =
      hGrids.some((row) => row.some((v) => v === 1)) ||
      vGrids.some((row) => row.some((v) => v === 1));
    if (!hasAnyThick) return;

    if (validateSolution(cells, hGrids, vGrids)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [hGrids, vGrids, cells, onComplete]);

  const handleHEdgeClick = useCallback(
    (r: number, c: number) => {
      setHGrids((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 0 ? 1 : 0;
        return next;
      });
    },
    []
  );

  const handleVEdgeClick = useCallback(
    (r: number, c: number) => {
      setVGrids((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 0 ? 1 : 0;
        return next;
      });
    },
    []
  );

  const gridLines: JSX.Element[] = [];

  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      const isThick = isBorder || (r > 0 && r < rows && hGrids[r - 1][c] === 1);
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

  // Vertical lines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick = isBorder || (c > 0 && c < cols && vGrids[r][c - 1] === 1);
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

  // Edge click targets
  const edgeTargets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_SIZE;
        const y = (r + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
        edgeTargets.push(
          <rect
            key={`he-${r}-${c}`}
            x={x}
            y={y}
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
        const x = (c + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
        const y = r * CELL_SIZE;
        edgeTargets.push(
          <rect
            key={`ve-${r}-${c}`}
            x={x}
            y={y}
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
            const [color] = cells[r][c];
            return (
              <rect
                key={`fill-${r}-${c}`}
                x={c * CELL_SIZE}
                y={r * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill={color === 1 ? "#ccc" : "white"}
              />
            );
          })}

          {/* Numbers */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const [, num] = cells[r][c];
            if (num === 0) return null;
            return (
              <text
                key={`num-${r}-${c}`}
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
                {num}
              </text>
            );
          })}

          {gridLines}
          {edgeTargets}
        </g>
      </svg>
    </div>
  );
}
