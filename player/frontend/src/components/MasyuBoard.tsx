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
const DOT_RADIUS = 3;
const CIRCLE_RADIUS = 11;
const EDGE_HIT_WIDTH = 14;

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

  // Compute degree per cell
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

  // Every cell on the loop must have degree 2, others 0
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

  // All circles must be on the loop
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] !== 0 && degree[r][c] !== 2) return false;
    }
  }

  // Connectivity check — BFS from start cell through edges
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );
  const queue: [number, number][] = [[startR, startC]];
  visited[startR][startC] = true;
  let visitedCount = 1;

  while (queue.length > 0) {
    const [cr, cc] = queue.pop()!;
    // right
    if (cc < cols - 1 && hEdges[cr][cc] === 1 && !visited[cr][cc + 1]) {
      visited[cr][cc + 1] = true;
      visitedCount++;
      queue.push([cr, cc + 1]);
    }
    // left
    if (cc > 0 && hEdges[cr][cc - 1] === 1 && !visited[cr][cc - 1]) {
      visited[cr][cc - 1] = true;
      visitedCount++;
      queue.push([cr, cc - 1]);
    }
    // down
    if (cr < rows - 1 && vEdges[cr][cc] === 1 && !visited[cr + 1][cc]) {
      visited[cr + 1][cc] = true;
      visitedCount++;
      queue.push([cr + 1, cc]);
    }
    // up
    if (cr > 0 && vEdges[cr - 1][cc] === 1 && !visited[cr - 1][cc]) {
      visited[cr - 1][cc] = true;
      visitedCount++;
      queue.push([cr - 1, cc]);
    }
  }

  if (visitedCount !== loopCellCount) return false;

  // Circle constraints
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] === 0) continue;
      const dirs = getCellConnections(r, c, hEdges, vEdges, rows, cols);
      if (dirs.length !== 2) return false;

      if (cells[r][c] === 1) {
        // White circle: must go straight, at least one neighbor must turn
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
        // Black circle: must turn, both immediate neighbors along incoming directions must go straight
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

  const handleHEdgeClick = useCallback(
    (r: number, c: number) => {
      if (readonly) return;
      setHEdges((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 1 ? 0 : 1;
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
        next[r][c] = next[r][c] === 1 ? 0 : 1;
        return next;
      });
    },
    [readonly]
  );

  const elements: JSX.Element[] = [];

  // Draw grid lines (light)
  for (let r = 0; r <= rows; r++) {
    elements.push(
      <line
        key={`grid-h-${r}`}
        x1={0}
        y1={r * CELL_SIZE}
        x2={cols * CELL_SIZE}
        y2={r * CELL_SIZE}
        stroke="#ddd"
        strokeWidth={0.5}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    elements.push(
      <line
        key={`grid-v-${c}`}
        x1={c * CELL_SIZE}
        y1={0}
        x2={c * CELL_SIZE}
        y2={rows * CELL_SIZE}
        stroke="#ddd"
        strokeWidth={0.5}
      />
    );
  }

  // Draw connected edges (lines between cell centers)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (hEdges[r][c] === 1) {
        elements.push(
          <line
            key={`hl-${r}-${c}`}
            x1={(c + 0.5) * CELL_SIZE}
            y1={(r + 0.5) * CELL_SIZE}
            x2={(c + 1.5) * CELL_SIZE}
            y2={(r + 0.5) * CELL_SIZE}
            stroke="#222"
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (vEdges[r][c] === 1) {
        elements.push(
          <line
            key={`vl-${r}-${c}`}
            x1={(c + 0.5) * CELL_SIZE}
            y1={(r + 0.5) * CELL_SIZE}
            x2={(c + 0.5) * CELL_SIZE}
            y2={(r + 1.5) * CELL_SIZE}
            stroke="#222"
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      }
    }
  }

  // Draw dots at cell centers
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] === 0) {
        elements.push(
          <circle
            key={`dot-${r}-${c}`}
            cx={(c + 0.5) * CELL_SIZE}
            cy={(r + 0.5) * CELL_SIZE}
            r={DOT_RADIUS}
            fill="#999"
          />
        );
      }
    }
  }

  // Draw circles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * CELL_SIZE;
      const cy = (r + 0.5) * CELL_SIZE;
      if (cells[r][c] === 1) {
        // White circle
        elements.push(
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
      } else if (cells[r][c] === 2) {
        // Black circle
        elements.push(
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
      }
    }
  }

  // Edge click targets
  const edgeTargets: JSX.Element[] = [];
  if (!readonly) {
    // Horizontal edge targets (between adjacent cell centers)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const x = (c + 0.5) * CELL_SIZE;
        const y = (r + 0.5) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
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
    // Vertical edge targets
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
        const y = (r + 0.5) * CELL_SIZE;
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
        style={{
          border: "1px solid #ccc",
          userSelect: "none",
          display: "block",
        }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {elements}
          {edgeTargets}
        </g>
      </svg>
    </div>
  );
}
