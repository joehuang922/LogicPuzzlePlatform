import { useState, useEffect, useCallback, useRef } from "react";
import { LRingCanon, LRingAnswer } from "../types/canon";
import { arrowState, isArrow, validateLRing } from "./lRingRules";
import { LRingArrow } from "./lRingArrow";

interface LRingBoardProps {
  canon: LRingCanon;
  initialAnswer?: LRingAnswer | null;
  onAnswerChange?: (answer: LRingAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;
const ERROR_COLOR = "#d33";

/**
 * L-Ring (type 33). Drawing is Masyu's: drag through neighbouring cells; if the first
 * edge crossed was drawn the drag erases, otherwise it draws. With live validation on,
 * an arrow whose L can no longer work is drawn red.
 */
export default function LRingBoard({ canon, initialAnswer, onAnswerChange, onComplete, readonly, liveValidate }: LRingBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const [hEdges, setHEdges] = useState<number[][]>(
    initialAnswer?.edges?.h ?? Array.from({ length: rows }, () => Array(cols - 1).fill(0))
  );
  const [vEdges, setVEdges] = useState<number[][]>(
    initialAnswer?.edges?.v ?? Array.from({ length: rows - 1 }, () => Array(cols).fill(0))
  );
  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  // null = not yet decided, true = erasing, false = drawing
  const eraseModeRef = useRef<boolean | null>(null);
  const lastCellRef = useRef<{ r: number; c: number } | null>(null);

  useEffect(() => {
    onAnswerChange?.({ edges: { h: hEdges, v: vEdges } });
  }, [hEdges, vEdges, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateLRing(cells, { h: hEdges, v: vEdges })) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [hEdges, vEdges, cells, onComplete]);

  const getCellFromPoint = useCallback(
    (clientX: number, clientY: number): { r: number; c: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = svgWidth / rect.width;
      const c = Math.floor(((clientX - rect.left) * scale - PAD) / CELL_SIZE);
      const r = Math.floor(((clientY - rect.top) * scale - PAD) / CELL_SIZE);
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
      const last = lastCellRef.current;
      if (!cell || !last || (cell.r === last.r && cell.c === last.c)) return;
      const dr = cell.r - last.r;
      const dc = cell.c - last.c;
      if (Math.abs(dr) + Math.abs(dc) !== 1) {
        lastCellRef.current = cell;
        return;
      }
      const horizontal = dr === 0;
      const er = horizontal ? last.r : Math.min(last.r, cell.r);
      const ec = horizontal ? Math.min(last.c, cell.c) : last.c;
      const current = horizontal ? hEdges[er][ec] : vEdges[er][ec];
      if (eraseModeRef.current === null) eraseModeRef.current = current === 1;
      const value = eraseModeRef.current ? 0 : 1;
      const set = horizontal ? setHEdges : setVEdges;
      set((prev) => {
        const next = prev.map((row) => [...row]);
        next[er][ec] = value;
        return next;
      });
      lastCellRef.current = cell;
    },
    [getCellFromPoint, hEdges, vEdges]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    lastCellRef.current = null;
  }, []);

  const edges = { h: hEdges, v: vEdges };

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ userSelect: "none", display: "block", touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <rect x={0} y={0} width={cols * CELL_SIZE} height={rows * CELL_SIZE} fill="white" />
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line key={`gh-${i}`} x1={0} y1={(i + 1) * CELL_SIZE} x2={cols * CELL_SIZE} y2={(i + 1) * CELL_SIZE}
              stroke="#bbb" strokeWidth={0.5} strokeDasharray="4 3" />
          ))}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line key={`gv-${i}`} x1={(i + 1) * CELL_SIZE} y1={0} x2={(i + 1) * CELL_SIZE} y2={rows * CELL_SIZE}
              stroke="#bbb" strokeWidth={0.5} strokeDasharray="4 3" />
          ))}

          {/* Arrows, under the loop */}
          {cells.flatMap((row, r) =>
            row.map((v, c) =>
              isArrow(v) ? (
                <LRingArrow
                  key={`a-${r}-${c}`}
                  dir={v}
                  cx={(c + 0.5) * CELL_SIZE}
                  cy={(r + 0.5) * CELL_SIZE}
                  size={CELL_SIZE * 0.72}
                  fill={liveValidate && arrowState(cells, edges, r, c) === "bad" ? ERROR_COLOR : "#222"}
                />
              ) : null
            )
          )}

          {hEdges.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line key={`hl-${r}-${c}`} x1={(c + 0.5) * CELL_SIZE} y1={(r + 0.5) * CELL_SIZE} x2={(c + 1.5) * CELL_SIZE} y2={(r + 0.5) * CELL_SIZE}
                  stroke="#888" strokeOpacity={0.9} strokeWidth={4} strokeLinecap="round" pointerEvents="none" />
              ) : null
            )
          )}
          {vEdges.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line key={`vl-${r}-${c}`} x1={(c + 0.5) * CELL_SIZE} y1={(r + 0.5) * CELL_SIZE} x2={(c + 0.5) * CELL_SIZE} y2={(r + 1.5) * CELL_SIZE}
                  stroke="#888" strokeOpacity={0.9} strokeWidth={4} strokeLinecap="round" pointerEvents="none" />
              ) : null
            )
          )}

          <rect x={0} y={0} width={cols * CELL_SIZE} height={rows * CELL_SIZE} fill="none" stroke="#222" strokeWidth={2} pointerEvents="none" />
        </g>
      </svg>
    </div>
  );
}
