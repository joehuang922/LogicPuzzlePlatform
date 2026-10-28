import { useState, useEffect, useCallback, useRef } from "react";
import { KuralinCanon, KuralinAnswer, KuralinCircle } from "../types/canon";

interface KuralinBoardProps {
  canon: KuralinCanon;
  initialAnswer?: KuralinAnswer | null;
  onAnswerChange?: (answer: KuralinAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;
const CIRCLE_R = CELL_SIZE * 0.24;
const ERROR_STROKE = "#d32f2f";

// Circle fills by color: 0 = white, 1 = black, 2 = gray.
export const KURALIN_CIRCLE_FILL = ["#fff", "#111", "#aaa"];

// The cells a circle touches: 2 for an edge midpoint, 4 for a corner.
export function kuralinCircleCells({ dr, dc }: KuralinCircle): [number, number][] {
  const rs = dr % 2 === 1 ? [(dr - 1) / 2] : [dr / 2 - 1, dr / 2];
  const cs = dc % 2 === 1 ? [(dc - 1) / 2] : [dc / 2 - 1, dc / 2];
  return rs.flatMap((r) => cs.map((c) => [r, c] as [number, number]));
}

function loopDegrees(rows: number, cols: number, hEdges: number[][], vEdges: number[][]): number[][] {
  const degree = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (hEdges[r][c] === 1) { degree[r][c]++; degree[r][c + 1]++; }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (vEdges[r][c] === 1) { degree[r][c]++; degree[r + 1][c]++; }
    }
  }
  return degree;
}

// Whether a circle's black/white comparison holds, given each touched cell's state.
function circleSatisfied(color: number, black: number, white: number): boolean {
  if (color === 1) return black > white;
  if (color === 0) return white > black;
  return black === white;
}

function validateSolution(
  canon: KuralinCanon,
  blacks: number[][],
  hEdges: number[][],
  vEdges: number[][]
): boolean {
  const { width: cols, height: rows } = canon;
  const degree = loopDegrees(rows, cols, hEdges, vEdges);

  // Every cell is exactly one of: on the loop (degree 2) or black.
  let loopCellCount = 0;
  let startR = -1, startC = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const onLoop = degree[r][c] > 0;
      if (onLoop && degree[r][c] !== 2) return false;
      if (onLoop === (blacks[r][c] === 1)) return false;
      if (onLoop) {
        loopCellCount++;
        if (startR < 0) { startR = r; startC = c; }
      }
    }
  }
  if (loopCellCount === 0) return false;

  // Single connected loop
  const visited = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const stack: [number, number][] = [[startR, startC]];
  visited[startR][startC] = true;
  let visitedCount = 1;
  while (stack.length > 0) {
    const [cr, cc] = stack.pop()!;
    const next: [number, number, boolean][] = [
      [cr, cc + 1, cc < cols - 1 && hEdges[cr][cc] === 1],
      [cr, cc - 1, cc > 0 && hEdges[cr][cc - 1] === 1],
      [cr + 1, cc, cr < rows - 1 && vEdges[cr][cc] === 1],
      [cr - 1, cc, cr > 0 && vEdges[cr - 1][cc] === 1],
    ];
    for (const [nr, nc, linked] of next) {
      if (linked && !visited[nr][nc]) {
        visited[nr][nc] = true;
        visitedCount++;
        stack.push([nr, nc]);
      }
    }
  }
  if (visitedCount !== loopCellCount) return false;

  // Circle clues
  for (const circle of canon.circles) {
    const touched = kuralinCircleCells(circle);
    const black = touched.filter(([r, c]) => blacks[r][c] === 1).length;
    if (!circleSatisfied(circle.color, black, touched.length - black)) return false;
  }

  return true;
}

export default function KuralinBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
  liveValidate,
}: KuralinBoardProps) {
  const { width: cols, height: rows, circles } = canon;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const emptyBlacks = () =>
    Array.from({ length: rows }, () => Array(cols).fill(0));
  const emptyH = () =>
    Array.from({ length: rows }, () => Array(cols - 1).fill(0));
  const emptyV = () =>
    Array.from({ length: rows - 1 }, () => Array(cols).fill(0));

  const [blacks, setBlacks] = useState<number[][]>(
    initialAnswer?.blacks ?? emptyBlacks()
  );
  const [hEdges, setHEdges] = useState<number[][]>(
    initialAnswer?.edges?.h ?? emptyH()
  );
  const [vEdges, setVEdges] = useState<number[][]>(
    initialAnswer?.edges?.v ?? emptyV()
  );
  const completedRef = useRef(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const eraseModeRef = useRef<boolean | null>(null);
  const lastCellRef = useRef<{ r: number; c: number } | null>(null);
  const didDragRef = useRef(false);

  useEffect(() => {
    const answer: KuralinAnswer = { blacks, edges: { h: hEdges, v: vEdges } };
    onAnswerChange?.(answer);
  }, [blacks, hEdges, vEdges, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSolution(canon, blacks, hEdges, vEdges)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [blacks, hEdges, vEdges, canon, onComplete]);

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
      didDragRef.current = false;
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

      didDragRef.current = true;

      let edgeVal: number;
      if (dc === 1) edgeVal = hEdges[last.r][last.c];
      else if (dc === -1) edgeVal = hEdges[last.r][cell.c];
      else if (dr === 1) edgeVal = vEdges[last.r][last.c];
      else edgeVal = vEdges[cell.r][last.c];

      if (eraseModeRef.current === null) {
        eraseModeRef.current = edgeVal === 1;
      }

      const newVal = eraseModeRef.current ? 0 : 1;

      // When drawing a line, it cannot touch blackened cells, and it clears
      // the marked (gray dot) state of any cell it is drawn onto.
      if (newVal === 1) {
        if (blacks[last.r][last.c] === 1 || blacks[cell.r][cell.c] === 1) {
          lastCellRef.current = cell;
          return;
        }
        if (blacks[last.r][last.c] === 2 || blacks[cell.r][cell.c] === 2) {
          setBlacks((prev) => {
            const n = prev.map((row) => [...row]);
            if (n[last.r][last.c] === 2) n[last.r][last.c] = 0;
            if (n[cell.r][cell.c] === 2) n[cell.r][cell.c] = 0;
            return n;
          });
        }
      }

      if (dc === 1) {
        setHEdges((prev) => { const n = prev.map((r) => [...r]); n[last.r][last.c] = newVal; return n; });
      } else if (dc === -1) {
        setHEdges((prev) => { const n = prev.map((r) => [...r]); n[last.r][cell.c] = newVal; return n; });
      } else if (dr === 1) {
        setVEdges((prev) => { const n = prev.map((r) => [...r]); n[last.r][last.c] = newVal; return n; });
      } else {
        setVEdges((prev) => { const n = prev.map((r) => [...r]); n[cell.r][last.c] = newVal; return n; });
      }

      lastCellRef.current = cell;
    },
    [getCellFromPoint, hEdges, vEdges, blacks]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const cell = lastCellRef.current;
      draggingRef.current = false;
      lastCellRef.current = null;

      if (!didDragRef.current && cell && !readonly) {
        const isRightClick = e.button === 2;
        setBlacks((prev) => {
          const n = prev.map((r) => [...r]);
          if (isRightClick) {
            // empty(0) → marked(2) → black(1) → empty(0)
            n[cell.r][cell.c] = n[cell.r][cell.c] === 0 ? 2 : n[cell.r][cell.c] === 2 ? 1 : 0;
          } else {
            // empty(0) → black(1) → marked(2) → empty(0)
            n[cell.r][cell.c] = n[cell.r][cell.c] === 0 ? 1 : n[cell.r][cell.c] === 1 ? 2 : 0;
          }
          return n;
        });
      }
    },
    [readonly]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Live validation: a circle is in error once every cell it touches is decided
  // (black, or on the loop) and its comparison fails.
  const degree = loopDegrees(rows, cols, hEdges, vEdges);
  const circleError = (circle: KuralinCircle): boolean => {
    if (!liveValidate) return false;
    let black = 0, white = 0;
    for (const [r, c] of kuralinCircleCells(circle)) {
      if (blacks[r][c] === 1) black++;
      else if (degree[r][c] > 0) white++;
      else return false;
    }
    return !circleSatisfied(circle.color, black, white);
  };

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
        onContextMenu={handleContextMenu}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Inner grid lines (dashed) */}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line
              key={`gh-${i}`}
              x1={0} y1={(i + 1) * CELL_SIZE}
              x2={cols * CELL_SIZE} y2={(i + 1) * CELL_SIZE}
              stroke="#999" strokeWidth={0.75} strokeDasharray="3,3"
            />
          ))}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line
              key={`gv-${i}`}
              x1={(i + 1) * CELL_SIZE} y1={0}
              x2={(i + 1) * CELL_SIZE} y2={rows * CELL_SIZE}
              stroke="#999" strokeWidth={0.75} strokeDasharray="3,3"
            />
          ))}

          {/* Blackened cells */}
          {blacks.flatMap((row, r) =>
            row.map((val, c) => {
              if (val === 1) {
                return (
                  <rect
                    key={`blk-${r}-${c}`}
                    x={c * CELL_SIZE} y={r * CELL_SIZE}
                    width={CELL_SIZE} height={CELL_SIZE}
                    fill="#333"
                  />
                );
              }
              if (val === 2) {
                const cx = (c + 0.5) * CELL_SIZE;
                const cy = (r + 0.5) * CELL_SIZE;
                return (
                  <circle
                    key={`mrk-${r}-${c}`}
                    cx={cx} cy={cy} r={3}
                    fill="#999"
                  />
                );
              }
              return null;
            })
          )}

          {/* Outer border */}
          <rect
            x={0} y={0}
            width={cols * CELL_SIZE} height={rows * CELL_SIZE}
            fill="none" stroke="#222" strokeWidth={2}
          />

          {/* Loop edges */}
          {hEdges.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`hl-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE} y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 1.5) * CELL_SIZE} y2={(r + 0.5) * CELL_SIZE}
                  stroke="#555" strokeWidth={3} strokeLinecap="round" pointerEvents="none"
                />
              ) : null
            )
          )}
          {vEdges.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`vl-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE} y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 0.5) * CELL_SIZE} y2={(r + 1.5) * CELL_SIZE}
                  stroke="#555" strokeWidth={3} strokeLinecap="round" pointerEvents="none"
                />
              ) : null
            )
          )}

          {/* Circle clues (on top). A white halo keeps the outline visible over black cells. */}
          {circles.map((circle) => {
            const error = circleError(circle);
            return (
              <g key={`cir-${circle.dr}-${circle.dc}`} pointerEvents="none">
                <circle
                  cx={(circle.dc * CELL_SIZE) / 2} cy={(circle.dr * CELL_SIZE) / 2}
                  r={CIRCLE_R + 1.5} fill="#fff"
                />
                <circle
                  cx={(circle.dc * CELL_SIZE) / 2} cy={(circle.dr * CELL_SIZE) / 2}
                  r={CIRCLE_R}
                  fill={KURALIN_CIRCLE_FILL[circle.color]}
                  stroke={error ? ERROR_STROKE : "#222"}
                  strokeWidth={error ? 2.5 : 1.5}
                />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
