import { useState, useEffect, useCallback, useRef } from "react";
import { SlitherlinkCanon, SlitherlinkAnswer } from "../types/canon";

interface SlitherlinkBoardProps {
  canon: SlitherlinkCanon;
  initialAnswer?: SlitherlinkAnswer | null;
  onAnswerChange?: (answer: SlitherlinkAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 16;
const DOT_RADIUS = 3;
const EDGE_HIT_WIDTH = 12;
const CROSS_SIZE = 6;

function validateSolution(cells: number[][], hEdges: number[][], vEdges: number[][]): boolean {
  const rows = cells.length;
  const cols = cells[0].length;

  // Check number constraints: each numbered cell must have exactly that many connected edges
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] < 0) continue;
      let count = 0;
      // top edge
      if (hEdges[r][c] === 1) count++;
      // bottom edge
      if (hEdges[r + 1][c] === 1) count++;
      // left edge
      if (vEdges[r][c] === 1) count++;
      // right edge
      if (vEdges[r][c + 1] === 1) count++;
      if (count !== cells[r][c]) return false;
    }
  }

  // Build graph of connected edges and verify single loop with no branches
  // Nodes are intersection points (r, c) where r in [0..rows], c in [0..cols]
  const degree: number[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));

  // Count degrees from horizontal edges
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hEdges[r][c] === 1) {
        degree[r][c]++;
        degree[r][c + 1]++;
      }
    }
  }
  // Count degrees from vertical edges
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (vEdges[r][c] === 1) {
        degree[r][c]++;
        degree[r + 1][c]++;
      }
    }
  }

  // Every node must have degree 0 or 2 (loop condition, no branches)
  let edgeNodeCount = 0;
  let startR = -1, startC = -1;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (degree[r][c] !== 0 && degree[r][c] !== 2) return false;
      if (degree[r][c] === 2) {
        edgeNodeCount++;
        if (startR < 0) { startR = r; startC = c; }
      }
    }
  }

  if (edgeNodeCount === 0) return false;

  // BFS/DFS to check connectivity - all nodes with degree 2 must be reachable from start
  const visited: boolean[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(false));
  const queue: [number, number][] = [[startR, startC]];
  visited[startR][startC] = true;
  let visitedCount = 1;

  while (queue.length > 0) {
    const [cr, cc] = queue.pop()!;
    // Check right (horizontal edge from (cr, cc) to (cr, cc+1))
    if (cc < cols && hEdges[cr][cc] === 1 && !visited[cr][cc + 1]) {
      visited[cr][cc + 1] = true;
      visitedCount++;
      queue.push([cr, cc + 1]);
    }
    // Check left
    if (cc > 0 && hEdges[cr][cc - 1] === 1 && !visited[cr][cc - 1]) {
      visited[cr][cc - 1] = true;
      visitedCount++;
      queue.push([cr, cc - 1]);
    }
    // Check down (vertical edge from (cr, cc) to (cr+1, cc))
    if (cr < rows && vEdges[cr][cc] === 1 && !visited[cr + 1][cc]) {
      visited[cr + 1][cc] = true;
      visitedCount++;
      queue.push([cr + 1, cc]);
    }
    // Check up
    if (cr > 0 && vEdges[cr - 1][cc] === 1 && !visited[cr - 1][cc]) {
      visited[cr - 1][cc] = true;
      visitedCount++;
      queue.push([cr - 1, cc]);
    }
  }

  return visitedCount === edgeNodeCount;
}

export default function SlitherlinkBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: SlitherlinkBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const emptyH = () => Array.from({ length: rows + 1 }, () => Array(cols).fill(0));
  const emptyV = () => Array.from({ length: rows }, () => Array(cols + 1).fill(0));

  const [hEdges, setHEdges] = useState<number[][]>(initialAnswer?.edges?.h ?? emptyH());
  const [vEdges, setVEdges] = useState<number[][]>(initialAnswer?.edges?.v ?? emptyV());
  const completedRef = useRef(false);

  useEffect(() => {
    const answer: SlitherlinkAnswer = { edges: { h: hEdges, v: vEdges } };
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
        next[r][c] = (next[r][c] + 1) % 3;
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
        next[r][c] = (next[r][c] + 1) % 3;
        return next;
      });
    },
    [readonly]
  );

  const elements: JSX.Element[] = [];

  // Draw connected edges (lines)
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (hEdges[r][c] === 1) {
        elements.push(
          <line
            key={`hl-${r}-${c}`}
            x1={c * CELL_SIZE}
            y1={r * CELL_SIZE}
            x2={(c + 1) * CELL_SIZE}
            y2={r * CELL_SIZE}
            stroke="#222"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        );
      } else if (hEdges[r][c] === 2) {
        const cx = (c + 0.5) * CELL_SIZE;
        const cy = r * CELL_SIZE;
        elements.push(
          <g key={`hx-${r}-${c}`}>
            <line x1={cx - CROSS_SIZE} y1={cy - CROSS_SIZE} x2={cx + CROSS_SIZE} y2={cy + CROSS_SIZE} stroke="#aaa" strokeWidth={1.5} />
            <line x1={cx + CROSS_SIZE} y1={cy - CROSS_SIZE} x2={cx - CROSS_SIZE} y2={cy + CROSS_SIZE} stroke="#aaa" strokeWidth={1.5} />
          </g>
        );
      }
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (vEdges[r][c] === 1) {
        elements.push(
          <line
            key={`vl-${r}-${c}`}
            x1={c * CELL_SIZE}
            y1={r * CELL_SIZE}
            x2={c * CELL_SIZE}
            y2={(r + 1) * CELL_SIZE}
            stroke="#222"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        );
      } else if (vEdges[r][c] === 2) {
        const cx = c * CELL_SIZE;
        const cy = (r + 0.5) * CELL_SIZE;
        elements.push(
          <g key={`vx-${r}-${c}`}>
            <line x1={cx - CROSS_SIZE} y1={cy - CROSS_SIZE} x2={cx + CROSS_SIZE} y2={cy + CROSS_SIZE} stroke="#aaa" strokeWidth={1.5} />
            <line x1={cx + CROSS_SIZE} y1={cy - CROSS_SIZE} x2={cx - CROSS_SIZE} y2={cy + CROSS_SIZE} stroke="#aaa" strokeWidth={1.5} />
          </g>
        );
      }
    }
  }

  // Draw dots at intersections
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      elements.push(
        <circle
          key={`dot-${r}-${c}`}
          cx={c * CELL_SIZE}
          cy={r * CELL_SIZE}
          r={DOT_RADIUS}
          fill="#333"
        />
      );
    }
  }

  // Draw cell numbers
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] < 0) continue;
      elements.push(
        <text
          key={`num-${r}-${c}`}
          x={(c + 0.5) * CELL_SIZE}
          y={(r + 0.5) * CELL_SIZE}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={CELL_SIZE * 0.5}
          fontFamily="sans-serif"
          fontWeight="bold"
          fill="#333"
          pointerEvents="none"
        >
          {cells[r][c]}
        </text>
      );
    }
  }

  // Edge click targets
  const edgeTargets: JSX.Element[] = [];
  if (!readonly) {
    // Horizontal edge targets
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_SIZE;
        const y = r * CELL_SIZE - EDGE_HIT_WIDTH / 2;
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
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const x = c * CELL_SIZE - EDGE_HIT_WIDTH / 2;
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
          {elements}
          {edgeTargets}
        </g>
      </svg>
    </div>
  );
}
