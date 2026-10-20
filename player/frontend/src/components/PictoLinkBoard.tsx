import { useState, useEffect, useCallback, useRef } from "react";
import { PictoLinkCanon, PictoLinkAnswer } from "../types/canon";

interface PictoLinkBoardProps {
  canon: PictoLinkCanon;
  initialAnswer?: PictoLinkAnswer | null;
  onAnswerChange?: (answer: PictoLinkAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;
const TOKEN_RADIUS = 13;
const PATH_COLOR = "#2563eb";
const FILL_COLOR = "#dbeafe";

type Cell = { r: number; c: number };

// Max segments a cell may carry: empty cells pass through (2), clue endpoints
// (value >= 2) touch one path (1), and a 1-clue is a standalone single with no
// segments at all (0).
function maxDegree(v: number): number {
  if (v === 0) return 2;
  if (v === 1) return 0;
  return 1;
}

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
  vEdges: number[][],
  singles: [number, number][]
): boolean {
  const rows = cells.length;
  const cols = cells[0].length;
  const singleSet = new Set(singles.map(([r, c]) => r * cols + c));

  // Degree constraints. Clue endpoints (value >= 2) carry exactly one segment;
  // 1-clues carry none and must be filled as a single; empty cells are either
  // unused (0) or a pass-through / turn (2) — never a dangling end or a branch.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = cells[r][c];
      const deg = degreeOf(r, c, hEdges, vEdges, rows, cols);
      if (v >= 2) {
        if (deg !== 1) return false;
      } else if (v === 1) {
        if (deg !== 0) return false;
        if (!singleSet.has(r * cols + c)) return false;
      } else {
        if (deg !== 0 && deg !== 2) return false;
      }
    }
  }

  // Every single must be an actual 1-clue (no stray fills).
  for (const [r, c] of singles) {
    if (cells[r]?.[c] !== 1) return false;
  }

  // Trace each path from a clue endpoint to its far end: the far end must be a
  // matching clue and the path length (cells, inclusive) must equal the value.
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] < 2 || visited[r][c]) continue;

      const startVal = cells[r][c];
      let prev: Cell | null = null;
      let cur: Cell = { r, c };
      let count = 0;
      while (true) {
        visited[cur.r][cur.c] = true;
        count++;
        if (count > rows * cols) return false; // runaway guard
        // Reached a different clue endpoint — path terminates here.
        if (cells[cur.r][cur.c] >= 2 && !(cur.r === r && cur.c === c)) break;
        const ns = neighbors(cur.r, cur.c, hEdges, vEdges, rows, cols).filter(
          (n) => !(prev && n.r === prev.r && n.c === prev.c)
        );
        if (ns.length === 0) break; // dead end (shouldn't happen given degrees)
        prev = cur;
        cur = ns[0];
      }

      if (cells[cur.r][cur.c] !== startVal) return false; // mismatched partner
      if (cur.r === r && cur.c === c) return false; // never left the start
      if (count !== startVal) return false; // wrong path length
    }
  }

  // No edge may belong to a stray cycle of empty cells (never traced above).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (
        degreeOf(r, c, hEdges, vEdges, rows, cols) > 0 &&
        !visited[r][c]
      )
        return false;
    }
  }

  return true;
}

export default function PictoLinkBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: PictoLinkBoardProps) {
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
  const [singles, setSingles] = useState<[number, number][]>(
    initialAnswer?.singles ?? []
  );
  const completedRef = useRef(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const downCellRef = useRef<Cell | null>(null);
  // null = not yet determined, true = erasing, false = drawing
  const eraseModeRef = useRef<boolean | null>(null);
  const lastCellRef = useRef<Cell | null>(null);

  useEffect(() => {
    const answer: PictoLinkAnswer = {
      edges: { h: hEdges, v: vEdges },
      singles,
    };
    onAnswerChange?.(answer);
  }, [hEdges, vEdges, singles, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    const hasAnyEdge =
      hEdges.some((row) => row.some((v) => v === 1)) ||
      vEdges.some((row) => row.some((v) => v === 1));
    if (!hasAnyEdge && singles.length === 0) return;

    if (validateSolution(cells, hEdges, vEdges, singles)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [hEdges, vEdges, singles, cells, onComplete]);

  const isFilled = useCallback(
    (r: number, c: number): boolean => {
      if (degreeOf(r, c, hEdges, vEdges, rows, cols) > 0) return true;
      return singles.some(([sr, sc]) => sr === r && sc === c);
    },
    [hEdges, vEdges, singles, rows, cols]
  );

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
      movedRef.current = false;
      eraseModeRef.current = null;
      downCellRef.current = cell;
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
      movedRef.current = true;

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

      // Draw mode: only add the segment if both cells have spare capacity. This
      // blocks crossings, branches, drawing onto/through a clue beyond its one
      // endpoint slot, and any segment touching a 1-clue (capacity 0).
      if (edgeVal === 0) {
        const maxLast = maxDegree(cells[last.r][last.c]);
        const maxCell = maxDegree(cells[cell.r][cell.c]);
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
    const down = downCellRef.current;
    lastCellRef.current = null;
    downCellRef.current = null;
    // A tap (no drag) on a 1-clue toggles its standalone filled state.
    if (!movedRef.current && down && cells[down.r][down.c] === 1) {
      setSingles((prev) => {
        const exists = prev.some(([r, c]) => r === down.r && c === down.c);
        return exists
          ? prev.filter(([r, c]) => !(r === down.r && c === down.c))
          : [...prev, [down.r, down.c]];
      });
    }
  }, [cells]);

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
          {/* Shaded fill for every filled cell (the emerging picture) */}
          {cells.flatMap((row, r) =>
            row.map((_, c) =>
              isFilled(r, c) ? (
                <rect
                  key={`fill-${r}-${c}`}
                  x={c * CELL_SIZE}
                  y={r * CELL_SIZE}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill={FILL_COLOR}
                  pointerEvents="none"
                />
              ) : null
            )
          )}

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
          {/* Inner grid lines */}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line
              key={`grid-h-${i}`}
              x1={0}
              y1={(i + 1) * CELL_SIZE}
              x2={cols * CELL_SIZE}
              y2={(i + 1) * CELL_SIZE}
              stroke="#ccc"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line
              key={`grid-v-${i}`}
              x1={(i + 1) * CELL_SIZE}
              y1={0}
              x2={(i + 1) * CELL_SIZE}
              y2={rows * CELL_SIZE}
              stroke="#ccc"
              strokeWidth={1}
            />
          ))}

          {/* Drawn path segments (under the clue tokens) */}
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

          {/* Clue tokens (on top of paths) */}
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
