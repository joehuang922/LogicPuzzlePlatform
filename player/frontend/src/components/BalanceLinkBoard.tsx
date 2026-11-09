import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { BalanceLinkCanon, BalanceLinkAnswer } from "../types/canon";
import { BLACK, isSymbol, traceLines, validateBalanceLink } from "./balanceLinkRules";
import { BalanceSymbol } from "./balanceLinkSymbols";

interface BalanceLinkBoardProps {
  canon: BalanceLinkCanon;
  initialAnswer?: BalanceLinkAnswer | null;
  onAnswerChange?: (answer: BalanceLinkAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;
const PATH_COLOR = "#2563eb";
// A line joining two matching symbols that isn't symmetric.
const UNBALANCED_COLOR = "#dc2626";
const BLACK_FILL = "#333";
const SYMBOL_R = CELL_SIZE * 0.3;

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

export default function BalanceLinkBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: BalanceLinkBoardProps) {
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
  // The cell a press started on, until the pointer moves to another cell (a tap).
  const tapCellRef = useRef<Cell | null>(null);

  useEffect(() => {
    const answer: BalanceLinkAnswer = { edges: { h: hEdges, v: vEdges } };
    onAnswerChange?.(answer);
  }, [hEdges, vEdges, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    const hasAnyEdge =
      hEdges.some((row) => row.some((v) => v === 1)) ||
      vEdges.some((row) => row.some((v) => v === 1));
    if (!hasAnyEdge) return;

    if (validateBalanceLink(cells, { h: hEdges, v: vEdges })) {
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
      tapCellRef.current = cell;
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
      tapCellRef.current = null;

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
        const cap = (v: number) => (v === BLACK ? 0 : isSymbol(v) ? 1 : 2);
        const maxLast = cap(cells[last.r][last.c]);
        const maxCell = cap(cells[cell.r][cell.c]);
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
    // A tap (no move to another cell) on a line clears the segments touching it.
    const tap = tapCellRef.current;
    if (draggingRef.current && tap) {
      const { r, c } = tap;
      if (c > 0 && hEdges[r][c - 1] === 1) setHEdges((p) => p.map((row, i) => (i === r ? row.map((x, j) => (j === c - 1 ? 0 : x)) : row)));
      if (c < cols - 1 && hEdges[r][c] === 1) setHEdges((p) => p.map((row, i) => (i === r ? row.map((x, j) => (j === c ? 0 : x)) : row)));
      if (r > 0 && vEdges[r - 1][c] === 1) setVEdges((p) => p.map((row, i) => (i === r - 1 ? row.map((x, j) => (j === c ? 0 : x)) : row)));
      if (r < rows - 1 && vEdges[r][c] === 1) setVEdges((p) => p.map((row, i) => (i === r ? row.map((x, j) => (j === c ? 0 : x)) : row)));
    }
    draggingRef.current = false;
    lastCellRef.current = null;
    tapCellRef.current = null;
  }, [hEdges, vEdges, rows, cols]);

  // Segments of lines that join matching symbols but aren't symmetric: drawn red.
  const unbalanced = useMemo(() => {
    const keys = new Set<string>();
    for (const line of traceLines(cells, { h: hEdges, v: vEdges })) {
      if (!line.matched || line.balanced) continue;
      for (let i = 1; i < line.points.length; i++) {
        const [r0, c0] = line.points[i - 1];
        const [r1, c1] = line.points[i];
        keys.add(r0 === r1 ? `h-${r0}-${Math.min(c0, c1)}` : `v-${Math.min(r0, r1)}-${c0}`);
      }
    }
    return keys;
  }, [cells, hEdges, vEdges]);

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
          {/* Black cells */}
          {cells.flatMap((row, r) =>
            row.map((val, c) =>
              val === BLACK ? (
                <rect
                  key={`blk-${r}-${c}`}
                  x={c * CELL_SIZE}
                  y={r * CELL_SIZE}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill={BLACK_FILL}
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
                  stroke={unbalanced.has(`h-${r}-${c}`) ? UNBALANCED_COLOR : PATH_COLOR}
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
                  stroke={unbalanced.has(`v-${r}-${c}`) ? UNBALANCED_COLOR : PATH_COLOR}
                  strokeWidth={5}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ) : null
            )
          )}

          {/* Symbols (on top of lines) */}
          {cells.flatMap((row, r) =>
            row.map((val, c) =>
              isSymbol(val) ? (
                <BalanceSymbol
                  key={`sym-${r}-${c}`}
                  code={val}
                  cx={(c + 0.5) * CELL_SIZE}
                  cy={(r + 0.5) * CELL_SIZE}
                  r={SYMBOL_R}
                />
              ) : null
            )
          )}
        </g>
      </svg>
    </div>
  );
}
