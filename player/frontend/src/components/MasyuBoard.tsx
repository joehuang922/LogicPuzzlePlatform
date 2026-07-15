import { useState, useEffect, useCallback, useRef } from "react";
import { MasyuCanon, MasyuAnswer } from "../types/canon";

interface MasyuBoardProps {
  canon: MasyuCanon;
  initialAnswer?: MasyuAnswer | null;
  onAnswerChange?: (answer: MasyuAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;
const CIRCLE_RADIUS = 11;

type Direction = "up" | "down" | "left" | "right";

function getCellConnections(
  r: number,
  c: number,
  hEdges: number[][],
  vEdges: number[][],
  rows: number,
  cols: number
): Direction[] {
  const dirs: Direction[] = [];
  if (c > 0 && hEdges[r][c - 1] === 1) dirs.push("left");
  if (c < cols - 1 && hEdges[r][c] === 1) dirs.push("right");
  if (r > 0 && vEdges[r - 1][c] === 1) dirs.push("up");
  if (r < rows - 1 && vEdges[r][c] === 1) dirs.push("down");
  return dirs;
}

function isStraight(dirs: Direction[]): boolean {
  if (dirs.length !== 2) return false;
  return (
    (dirs.includes("left") && dirs.includes("right")) ||
    (dirs.includes("up") && dirs.includes("down"))
  );
}

function isTurn(dirs: Direction[]): boolean {
  if (dirs.length !== 2) return false;
  return !isStraight(dirs);
}

function validateSolution(
  cells: number[][],
  hEdges: number[][],
  vEdges: number[][]
): boolean {
  const rows = cells.length;
  const cols = cells[0].length;

  const degree: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(0)
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (hEdges[r][c] === 1) {
        degree[r][c]++;
        degree[r][c + 1]++;
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (vEdges[r][c] === 1) {
        degree[r][c]++;
        degree[r + 1][c]++;
      }
    }
  }

  let loopCellCount = 0;
  let startR = -1,
    startC = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (degree[r][c] !== 0 && degree[r][c] !== 2) return false;
      if (degree[r][c] === 2) {
        loopCellCount++;
        if (startR < 0) {
          startR = r;
          startC = c;
        }
      }
    }
  }
  if (loopCellCount === 0) return false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] !== 0 && degree[r][c] !== 2) return false;
    }
  }

  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );
  const queue: [number, number][] = [[startR, startC]];
  visited[startR][startC] = true;
  let visitedCount = 1;

  while (queue.length > 0) {
    const [cr, cc] = queue.pop()!;
    if (cc < cols - 1 && hEdges[cr][cc] === 1 && !visited[cr][cc + 1]) {
      visited[cr][cc + 1] = true;
      visitedCount++;
      queue.push([cr, cc + 1]);
    }
    if (cc > 0 && hEdges[cr][cc - 1] === 1 && !visited[cr][cc - 1]) {
      visited[cr][cc - 1] = true;
      visitedCount++;
      queue.push([cr, cc - 1]);
    }
    if (cr < rows - 1 && vEdges[cr][cc] === 1 && !visited[cr + 1][cc]) {
      visited[cr + 1][cc] = true;
      visitedCount++;
      queue.push([cr + 1, cc]);
    }
    if (cr > 0 && vEdges[cr - 1][cc] === 1 && !visited[cr - 1][cc]) {
      visited[cr - 1][cc] = true;
      visitedCount++;
      queue.push([cr - 1, cc]);
    }
  }

  if (visitedCount !== loopCellCount) return false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] === 0) continue;
      const dirs = getCellConnections(r, c, hEdges, vEdges, rows, cols);
      if (dirs.length !== 2) return false;

      if (cells[r][c] === 1) {
        if (!isStraight(dirs)) return false;
        let neighborTurns = false;
        if (dirs.includes("left") && dirs.includes("right")) {
          const leftDirs = getCellConnections(r, c - 1, hEdges, vEdges, rows, cols);
          const rightDirs = getCellConnections(r, c + 1, hEdges, vEdges, rows, cols);
          if (isTurn(leftDirs) || isTurn(rightDirs)) neighborTurns = true;
        } else {
          const upDirs = getCellConnections(r - 1, c, hEdges, vEdges, rows, cols);
          const downDirs = getCellConnections(r + 1, c, hEdges, vEdges, rows, cols);
          if (isTurn(upDirs) || isTurn(downDirs)) neighborTurns = true;
        }
        if (!neighborTurns) return false;
      } else if (cells[r][c] === 2) {
        if (!isTurn(dirs)) return false;
        for (const d of dirs) {
          let nr = r,
            nc = c;
          if (d === "up") nr--;
          else if (d === "down") nr++;
          else if (d === "left") nc--;
          else nc++;
          const nDirs = getCellConnections(nr, nc, hEdges, vEdges, rows, cols);
          if (!isStraight(nDirs)) return false;
        }
      }
    }
  }

  return true;
}

export default function MasyuBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: MasyuBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const emptyH = () =>
    Array.from({ length: rows }, () => Array(cols - 1).fill(0));
  const emptyV = () =>
    Array.from({ length: rows - 1 }, () => Array(cols).fill(0));

  const [hEdges, setHEdges] = useState<number[][]>(
    initialAnswer?.edges?.h ?? emptyH()
  );
  const [vEdges, setVEdges] = useState<number[][]>(
    initialAnswer?.edges?.v ?? emptyV()
  );
  const completedRef = useRef(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  // null = not yet determined, true = erasing, false = drawing
  const eraseModeRef = useRef<boolean | null>(null);
  const lastCellRef = useRef<{ r: number; c: number } | null>(null);

  useEffect(() => {
    const answer: MasyuAnswer = { edges: { h: hEdges, v: vEdges } };
    onAnswerChange?.(answer);
  }, [hEdges, vEdges, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    const hasAnyEdge =
      hEdges.some((row) => row.some((v) => v === 1)) ||
      vEdges.some((row) => row.some((v) => v === 1));
    if (!hasAnyEdge) return;

    if (validateSolution(cells, hEdges, vEdges)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [hEdges, vEdges, cells, onComplete]);

  const getCellFromPoint = useCallback(
    (clientX: number, clientY: number): { r: number; c: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scaleX = svgWidth / rect.width;
      const x = (clientX - rect.left) * scaleX - PAD;
      const y = (clientY - rect.top) * scaleX - PAD;
      const c = Math.floor(x / CELL_SIZE);
      const r = Math.floor(y / CELL_SIZE);
      if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
      return { r, c };
    },
    [rows, cols, svgWidth]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly) return;
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      draggingRef.current = true;
      eraseModeRef.current = null;
      lastCellRef.current = cell;
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [readonly, getCellFromPoint]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      const last = lastCellRef.current;
      if (!last) return;
      if (cell.r === last.r && cell.c === last.c) return;

      const dr = cell.r - last.r;
      const dc = cell.c - last.c;
      if (Math.abs(dr) + Math.abs(dc) !== 1) {
        lastCellRef.current = cell;
        return;
      }

      let edgeVal: number;
      if (dc === 1) {
        edgeVal = hEdges[last.r][last.c];
      } else if (dc === -1) {
        edgeVal = hEdges[last.r][cell.c];
      } else if (dr === 1) {
        edgeVal = vEdges[last.r][last.c];
      } else {
        edgeVal = vEdges[cell.r][last.c];
      }

      if (eraseModeRef.current === null) {
        eraseModeRef.current = edgeVal === 1;
      }

      const newVal = eraseModeRef.current ? 0 : 1;

      if (dc === 1) {
        setHEdges((prev) => {
          const next = prev.map((row) => [...row]);
          next[last.r][last.c] = newVal;
          return next;
        });
      } else if (dc === -1) {
        setHEdges((prev) => {
          const next = prev.map((row) => [...row]);
          next[last.r][cell.c] = newVal;
          return next;
        });
      } else if (dr === 1) {
        setVEdges((prev) => {
          const next = prev.map((row) => [...row]);
          next[last.r][last.c] = newVal;
          return next;
        });
      } else {
        setVEdges((prev) => {
          const next = prev.map((row) => [...row]);
          next[cell.r][last.c] = newVal;
          return next;
        });
      }

      lastCellRef.current = cell;
    },
    [getCellFromPoint, hEdges, vEdges]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    lastCellRef.current = null;
  }, []);

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{
          border: "1px solid #ccc",
          userSelect: "none",
          display: "block",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Grid lines */}
          {Array.from({ length: rows + 1 }, (_, r) => (
            <line
              key={`grid-h-${r}`}
              x1={0}
              y1={r * CELL_SIZE}
              x2={cols * CELL_SIZE}
              y2={r * CELL_SIZE}
              stroke="#ddd"
              strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: cols + 1 }, (_, c) => (
            <line
              key={`grid-v-${c}`}
              x1={c * CELL_SIZE}
              y1={0}
              x2={c * CELL_SIZE}
              y2={rows * CELL_SIZE}
              stroke="#ddd"
              strokeWidth={0.5}
            />
          ))}

          {/* Circles */}
          {cells.flatMap((row, r) =>
            row.map((val, c) => {
              if (val === 0) return null;
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              if (val === 1) {
                return (
                  <circle
                    key={`wc-${r}-${c}`}
                    cx={cx}
                    cy={cy}
                    r={CIRCLE_RADIUS}
                    fill="#fff"
                    stroke="#222"
                    strokeWidth={2}
                  />
                );
              }
              return (
                <circle
                  key={`bc-${r}-${c}`}
                  cx={cx}
                  cy={cy}
                  r={CIRCLE_RADIUS}
                  fill="#222"
                  stroke="#222"
                  strokeWidth={2}
                />
              );
            })
          )}

          {/* Drawn edges (on top of circles) */}
          {hEdges.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`hl-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE}
                  y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 1.5) * CELL_SIZE}
                  y2={(r + 0.5) * CELL_SIZE}
                  stroke="#222"
                  strokeWidth={3}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ) : null
            )
          )}
          {vEdges.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`vl-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE}
                  y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 0.5) * CELL_SIZE}
                  y2={(r + 1.5) * CELL_SIZE}
                  stroke="#222"
                  strokeWidth={3}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ) : null
            )
          )}
        </g>
      </svg>
    </div>
  );
}
