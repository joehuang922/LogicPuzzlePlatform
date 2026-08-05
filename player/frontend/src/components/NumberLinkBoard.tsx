import { useState, useEffect, useCallback, useRef } from "react";
import { NumberLinkCanon, NumberLinkAnswer } from "../types/canon";

interface NumberLinkBoardProps {
  canon: NumberLinkCanon;
  initialAnswer?: NumberLinkAnswer | null;
  onAnswerChange?: (answer: NumberLinkAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;
const TOKEN_RADIUS = 13;
const PATH_COLOR = "#2563eb";

type Cell = { r: number; c: number };

function degreeOf(
  r: number,
  c: number,
  hEdges: number[][],
  vEdges: number[][],
  rows: number,
  cols: number
): number {
  let d = 0;
  if (c > 0 && hEdges[r][c - 1] === 1) d++;
  if (c < cols - 1 && hEdges[r][c] === 1) d++;
  if (r > 0 && vEdges[r - 1][c] === 1) d++;
  if (r < rows - 1 && vEdges[r][c] === 1) d++;
  return d;
}

function neighbors(
  r: number,
  c: number,
  hEdges: number[][],
  vEdges: number[][],
  rows: number,
  cols: number
): Cell[] {
  const ns: Cell[] = [];
  if (c > 0 && hEdges[r][c - 1] === 1) ns.push({ r, c: c - 1 });
  if (c < cols - 1 && hEdges[r][c] === 1) ns.push({ r, c: c + 1 });
  if (r > 0 && vEdges[r - 1][c] === 1) ns.push({ r: r - 1, c });
  if (r < rows - 1 && vEdges[r][c] === 1) ns.push({ r: r + 1, c });
  return ns;
}

function validateSolution(
  cells: number[][],
  hEdges: number[][],
  vEdges: number[][]
): boolean {
  const rows = cells.length;
  const cols = cells[0].length;

  // Degree constraints: endpoint cells (value > 0) must have exactly one
  // segment; every other cell must have exactly two. This simultaneously
  // enforces "no branching", "no crossing", and "every cell filled".
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const deg = degreeOf(r, c, hEdges, vEdges, rows, cols);
      const expected = cells[r][c] > 0 ? 1 : 2;
      if (deg !== expected) return false;
    }
  }

  // Trace each path from an endpoint to its far end; the two endpoints must
  // carry the same number. Also mark every visited cell so we can detect
  // stray cycles of empty cells (which have no endpoint to trace from).
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] === 0 || visited[r][c]) continue;

      const startVal = cells[r][c];
      let prev: Cell | null = null;
      let cur: Cell = { r, c };
      while (true) {
        visited[cur.r][cur.c] = true;
        // Reached a different endpoint — path terminates here.
        if (cells[cur.r][cur.c] > 0 && !(cur.r === r && cur.c === c)) break;
        const ns = neighbors(cur.r, cur.c, hEdges, vEdges, rows, cols).filter(
          (n) => !(prev && n.r === prev.r && n.c === prev.c)
        );
        if (ns.length === 0) break; // dead end (shouldn't happen given degrees)
        prev = cur;
        cur = ns[0];
      }

      // Far end must be a matching endpoint.
      if (cells[cur.r][cur.c] !== startVal) return false;
      if (cur.r === r && cur.c === c) return false; // never left the start
    }
  }

  // Every cell must be part of a traced path (no isolated empty-cell loops).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!visited[r][c]) return false;
    }
  }

  return true;
}

export default function NumberLinkBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: NumberLinkBoardProps) {
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
  const lastCellRef = useRef<Cell | null>(null);

  useEffect(() => {
    const answer: NumberLinkAnswer = { edges: { h: hEdges, v: vEdges } };
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
    (clientX: number, clientY: number): Cell | null => {
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
        // Non-adjacent jump (fast drag): re-anchor without drawing.
        lastCellRef.current = cell;
        return;
      }

      // Locate the shared edge and its current value.
      let edgeVal: number;
      let apply: (val: number) => void;
      if (dc === 1) {
        edgeVal = hEdges[last.r][last.c];
        apply = (val) =>
          setHEdges((prev) => {
            const next = prev.map((row) => [...row]);
            next[last.r][last.c] = val;
            return next;
          });
      } else if (dc === -1) {
        edgeVal = hEdges[last.r][cell.c];
        apply = (val) =>
          setHEdges((prev) => {
            const next = prev.map((row) => [...row]);
            next[last.r][cell.c] = val;
            return next;
          });
      } else if (dr === 1) {
        edgeVal = vEdges[last.r][last.c];
        apply = (val) =>
          setVEdges((prev) => {
            const next = prev.map((row) => [...row]);
            next[last.r][last.c] = val;
            return next;
          });
      } else {
        edgeVal = vEdges[cell.r][last.c];
        apply = (val) =>
          setVEdges((prev) => {
            const next = prev.map((row) => [...row]);
            next[cell.r][last.c] = val;
            return next;
          });
      }

      if (eraseModeRef.current === null) {
        eraseModeRef.current = edgeVal === 1;
      }

      if (eraseModeRef.current) {
        apply(0);
        lastCellRef.current = cell;
        return;
      }

      // Draw mode: only add the segment if both cells have spare capacity
      // (endpoints allow degree 1, other cells degree 2). This blocks the
      // player from creating crossings or branches.
      if (edgeVal === 0) {
        const maxLast = cells[last.r][last.c] > 0 ? 1 : 2;
        const maxCell = cells[cell.r][cell.c] > 0 ? 1 : 2;
        if (
          degreeOf(last.r, last.c, hEdges, vEdges, rows, cols) >= maxLast ||
          degreeOf(cell.r, cell.c, hEdges, vEdges, rows, cols) >= maxCell
        ) {
          // Blocked: do not advance the anchor so a later legal move can retry.
          return;
        }
        apply(1);
      }
      lastCellRef.current = cell;
    },
    [getCellFromPoint, hEdges, vEdges, cells, rows, cols]
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
          {/* Outer border */}
          <rect
            x={0}
            y={0}
            width={cols * CELL_SIZE}
            height={rows * CELL_SIZE}
            fill="none"
            stroke="#222"
            strokeWidth={2}
          />
          {/* Inner grid lines (dashed) */}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line
              key={`grid-h-${i}`}
              x1={0}
              y1={(i + 1) * CELL_SIZE}
              x2={cols * CELL_SIZE}
              y2={(i + 1) * CELL_SIZE}
              stroke="#bbb"
              strokeWidth={0.5}
              strokeDasharray="4 3"
            />
          ))}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line
              key={`grid-v-${i}`}
              x1={(i + 1) * CELL_SIZE}
              y1={0}
              x2={(i + 1) * CELL_SIZE}
              y2={rows * CELL_SIZE}
              stroke="#bbb"
              strokeWidth={0.5}
              strokeDasharray="4 3"
            />
          ))}

          {/* Drawn path segments (under the number tokens) */}
          {hEdges.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`hl-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE}
                  y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 1.5) * CELL_SIZE}
                  y2={(r + 0.5) * CELL_SIZE}
                  stroke={PATH_COLOR}
                  strokeWidth={5}
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
                  stroke={PATH_COLOR}
                  strokeWidth={5}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ) : null
            )
          )}

          {/* Numbered endpoint tokens (on top of paths) */}
          {cells.flatMap((row, r) =>
            row.map((val, c) => {
              if (val === 0) return null;
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              return (
                <g key={`tok-${r}-${c}`} pointerEvents="none">
                  <circle
                    cx={cx}
                    cy={cy}
                    r={TOKEN_RADIUS}
                    fill="#fff"
                    stroke="#222"
                    strokeWidth={2}
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={val >= 10 ? 13 : 16}
                    fontWeight={700}
                    fill="#222"
                  >
                    {val}
                  </text>
                </g>
              );
            })
          )}
        </g>
      </svg>
    </div>
  );
}
