import { useState, useEffect, useCallback, useRef } from "react";
import { YajilinCanon, YajilinAnswer } from "../types/canon";

interface YajilinBoardProps {
  canon: YajilinCanon;
  initialAnswer?: YajilinAnswer | null;
  onAnswerChange?: (answer: YajilinAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;

const ARROW_MAP: Record<string, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

function validateSolution(
  canon: YajilinCanon,
  blacks: number[][],
  hEdges: number[][],
  vEdges: number[][]
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // Check no black on clue cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] !== null && blacks[r][c] === 1) return false;
    }
  }

  // Check no adjacent blacks
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (blacks[r][c] !== 1) continue;
      if (c < cols - 1 && blacks[r][c + 1] === 1) return false;
      if (r < rows - 1 && blacks[r + 1][c] === 1) return false;
    }
  }

  // Compute degree for loop validation
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

  // Every loop cell must have degree 2, no edges on clue/black cells
  let loopCellCount = 0;
  let startR = -1, startC = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (degree[r][c] > 0) {
        if (degree[r][c] !== 2) return false;
        if (canon.cells[r][c] !== null) return false;
        if (blacks[r][c] === 1) return false;
        loopCellCount++;
        if (startR < 0) { startR = r; startC = c; }
      }
    }
  }
  if (loopCellCount === 0) return false;

  // Every empty non-clue cell must be either black or on the loop
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] !== null) continue;
      if (blacks[r][c] !== 1 && degree[r][c] !== 2) return false;
    }
  }

  // Check single connected loop
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );
  const queue: [number, number][] = [[startR, startC]];
  visited[startR][startC] = true;
  let visitedCount = 1;
  while (queue.length > 0) {
    const [cr, cc] = queue.pop()!;
    if (cc < cols - 1 && hEdges[cr][cc] === 1 && !visited[cr][cc + 1]) {
      visited[cr][cc + 1] = true; visitedCount++; queue.push([cr, cc + 1]);
    }
    if (cc > 0 && hEdges[cr][cc - 1] === 1 && !visited[cr][cc - 1]) {
      visited[cr][cc - 1] = true; visitedCount++; queue.push([cr, cc - 1]);
    }
    if (cr < rows - 1 && vEdges[cr][cc] === 1 && !visited[cr + 1][cc]) {
      visited[cr + 1][cc] = true; visitedCount++; queue.push([cr + 1, cc]);
    }
    if (cr > 0 && vEdges[cr - 1][cc] === 1 && !visited[cr - 1][cc]) {
      visited[cr - 1][cc] = true; visitedCount++; queue.push([cr - 1, cc]);
    }
  }
  if (visitedCount !== loopCellCount) return false;

  // Check directional clues
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = canon.cells[r][c];
      if (clue === null) continue;
      let count = 0;
      if (clue.dir === "up") {
        for (let i = r - 1; i >= 0; i--) if (blacks[i][c] === 1) count++;
      } else if (clue.dir === "down") {
        for (let i = r + 1; i < rows; i++) if (blacks[i][c] === 1) count++;
      } else if (clue.dir === "left") {
        for (let i = c - 1; i >= 0; i--) if (blacks[r][i] === 1) count++;
      } else {
        for (let i = c + 1; i < cols; i++) if (blacks[r][i] === 1) count++;
      }
      if (count !== clue.num) return false;
    }
  }

  return true;
}

export default function YajilinBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: YajilinBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
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
    const answer: YajilinAnswer = { blacks, edges: { h: hEdges, v: vEdges } };
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
        if (cells[cell.r][cell.c] !== null) return;
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
    [readonly, cells]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const fs = CELL_SIZE * 0.3;

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
          {/* Outer border */}
          <rect
            x={0} y={0}
            width={cols * CELL_SIZE} height={rows * CELL_SIZE}
            fill="none" stroke="#222" strokeWidth={2}
          />
          {/* Inner grid lines (solid) */}
          {Array.from({ length: rows - 1 }, (_, i) => (
            <line
              key={`gh-${i}`}
              x1={0} y1={(i + 1) * CELL_SIZE}
              x2={cols * CELL_SIZE} y2={(i + 1) * CELL_SIZE}
              stroke="#bbb" strokeWidth={0.5}
            />
          ))}
          {Array.from({ length: cols - 1 }, (_, i) => (
            <line
              key={`gv-${i}`}
              x1={(i + 1) * CELL_SIZE} y1={0}
              x2={(i + 1) * CELL_SIZE} y2={rows * CELL_SIZE}
              stroke="#bbb" strokeWidth={0.5}
            />
          ))}

          {/* Blackened cells */}
          {blacks.flatMap((row, r) =>
            row.map((val, c) => {
              if (val === 1) {
                return (
                  <rect
                    key={`blk-${r}-${c}`}
                    x={c * CELL_SIZE + 1} y={r * CELL_SIZE + 1}
                    width={CELL_SIZE - 2} height={CELL_SIZE - 2}
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

          {/* Clue cells (directed integers) */}
          {cells.flatMap((row, r) =>
            row.map((clue, c) => {
              if (clue === null) return null;
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              const arrow = ARROW_MAP[clue.dir];
              if (clue.dir === "left" || clue.dir === "right") {
                // Stacked: arrow on top, number below
                return (
                  <g key={`clue-${r}-${c}`} pointerEvents="none">
                    <text x={cx} y={cy - fs * 0.45} textAnchor="middle" dominantBaseline="central"
                      fontSize={fs} fill="#222">{arrow}</text>
                    <text x={cx} y={cy + fs * 0.55} textAnchor="middle" dominantBaseline="central"
                      fontSize={fs} fontWeight="bold" fill="#222">{clue.num}</text>
                  </g>
                );
              } else {
                // Side by side: number left, arrow right
                return (
                  <g key={`clue-${r}-${c}`} pointerEvents="none">
                    <text x={cx - fs * 0.45} y={cy} textAnchor="middle" dominantBaseline="central"
                      fontSize={fs} fontWeight="bold" fill="#222">{clue.num}</text>
                    <text x={cx + fs * 0.45} y={cy} textAnchor="middle" dominantBaseline="central"
                      fontSize={fs} fill="#222">{arrow}</text>
                  </g>
                );
              }
            })
          )}

          {/* Loop edges (on top) */}
          {hEdges.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`hl-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE} y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 1.5) * CELL_SIZE} y2={(r + 0.5) * CELL_SIZE}
                  stroke="#888" strokeWidth={3} strokeLinecap="round" pointerEvents="none"
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
                  stroke="#888" strokeWidth={3} strokeLinecap="round" pointerEvents="none"
                />
              ) : null
            )
          )}
        </g>
      </svg>
    </div>
  );
}
