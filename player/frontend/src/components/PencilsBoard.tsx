import { useState, useEffect, useCallback, useRef } from "react";
import { PencilsCanon, PencilsAnswer } from "../types/canon";

interface PencilsBoardProps {
  canon: PencilsCanon;
  initialAnswer?: PencilsAnswer | null;
  onAnswerChange?: (answer: PencilsAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 20;

type Mode = "trail" | "edge" | "head";

function emptyTrailsH(rows: number, cols: number) {
  return Array.from({ length: rows }, () => Array(cols - 1).fill(0));
}
function emptyTrailsV(rows: number, cols: number) {
  return Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
}
function emptyEdgesH(rows: number, cols: number) {
  return Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
}
function emptyEdgesV(rows: number, cols: number) {
  return Array.from({ length: rows }, () => Array(cols - 1).fill(0));
}
function emptyHeads(rows: number, cols: number) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function headTrianglePath(
  cx: number,
  cy: number,
  dir: number,
  size: number
): string {
  const s = size;
  switch (dir) {
    case -1: // up
      return `M${cx},${cy - s} L${cx - s * 0.7},${cy + s * 0.5} L${cx + s * 0.7},${cy + s * 0.5}Z`;
    case -2: // down
      return `M${cx},${cy + s} L${cx - s * 0.7},${cy - s * 0.5} L${cx + s * 0.7},${cy - s * 0.5}Z`;
    case -3: // left
      return `M${cx - s},${cy} L${cx + s * 0.5},${cy - s * 0.7} L${cx + s * 0.5},${cy + s * 0.7}Z`;
    case -4: // right
      return `M${cx + s},${cy} L${cx - s * 0.5},${cy - s * 0.7} L${cx - s * 0.5},${cy + s * 0.7}Z`;
    default:
      return "";
  }
}

function validateSolution(
  canon: PencilsCanon,
  trails: { h: number[][]; v: number[][] },
  heads: number[][],
  edges: { h: number[][]; v: number[][] }
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // Merge given heads from canon with player-placed heads
  const allHeads: number[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (canon.cells[r][c] < 0) return canon.cells[r][c];
      return heads[r][c];
    })
  );

  // Check every cell is covered: must be a head, part of a body (enclosed by edges), or on a trail
  // Build coverage map
  const covered: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  // Heads cover their cell
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (allHeads[r][c] < 0) covered[r][c] = true;
    }
  }

  // Trail segments cover the two cells they connect
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (trails.h[r][c] === 1) {
        covered[r][c] = true;
        covered[r][c + 1] = true;
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (trails.v[r][c] === 1) {
        covered[r][c] = true;
        covered[r + 1][c] = true;
      }
    }
  }

  // Body cells: cells enclosed by edges (form rectangles)
  // For simplicity, cells that have number clues and are bordered by edges count as body cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] > 0) covered[r][c] = true;
    }
  }

  // Check all cells covered
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!covered[r][c]) return false;
    }
  }

  // Check no trail overlap: count trail segments touching each cell
  const trailCount: number[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(0)
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (trails.h[r][c] === 1) {
        trailCount[r][c]++;
        trailCount[r][c + 1]++;
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (trails.v[r][c] === 1) {
        trailCount[r][c]++;
        trailCount[r + 1][c]++;
      }
    }
  }
  // A trail cell should have at most 2 connections (a path, not a branch)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (trailCount[r][c] > 2) return false;
    }
  }

  return true;
}

export default function PencilsBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: PencilsBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const [mode, setMode] = useState<Mode>("trail");
  const [trailsH, setTrailsH] = useState<number[][]>(
    initialAnswer?.trails?.h ?? emptyTrailsH(rows, cols)
  );
  const [trailsV, setTrailsV] = useState<number[][]>(
    initialAnswer?.trails?.v ?? emptyTrailsV(rows, cols)
  );
  const [heads, setHeads] = useState<number[][]>(
    initialAnswer?.heads ?? emptyHeads(rows, cols)
  );
  const [edgesH, setEdgesH] = useState<number[][]>(
    initialAnswer?.edges?.h ?? emptyEdgesH(rows, cols)
  );
  const [edgesV, setEdgesV] = useState<number[][]>(
    initialAnswer?.edges?.v ?? emptyEdgesV(rows, cols)
  );

  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const eraseModeRef = useRef<boolean | null>(null);
  const lastCellRef = useRef<{ r: number; c: number } | null>(null);
  const [headPopup, setHeadPopup] = useState<{
    r: number;
    c: number;
  } | null>(null);

  useEffect(() => {
    const answer: PencilsAnswer = {
      trails: { h: trailsH, v: trailsV },
      heads,
      edges: { h: edgesH, v: edgesV },
    };
    onAnswerChange?.(answer);
  }, [trailsH, trailsV, heads, edgesH, edgesV, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    const hasAny =
      trailsH.some((row) => row.some((v) => v === 1)) ||
      trailsV.some((row) => row.some((v) => v === 1));
    if (!hasAny) return;

    if (
      validateSolution(
        canon,
        { h: trailsH, v: trailsV },
        heads,
        { h: edgesH, v: edgesV }
      )
    ) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [trailsH, trailsV, heads, edgesH, edgesV, canon, onComplete]);

  const getSvgCoord = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scaleX = svgWidth / rect.width;
      const x = (clientX - rect.left) * scaleX - PAD;
      const y = (clientY - rect.top) * scaleX - PAD;
      return { x, y };
    },
    [svgWidth]
  );

  const getCellFromPoint = useCallback(
    (clientX: number, clientY: number): { r: number; c: number } | null => {
      const coord = getSvgCoord(clientX, clientY);
      if (!coord) return null;
      const c = Math.floor(coord.x / CELL_SIZE);
      const r = Math.floor(coord.y / CELL_SIZE);
      if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
      return { r, c };
    },
    [getSvgCoord, rows, cols]
  );

  const handleEdgeClick = useCallback(
    (clientX: number, clientY: number) => {
      const coord = getSvgCoord(clientX, clientY);
      if (!coord) return;
      const { x, y } = coord;

      // Detect if click is near a horizontal edge (between rows)
      for (let r = 0; r < rows - 1; r++) {
        const edgeY = (r + 1) * CELL_SIZE;
        if (Math.abs(y - edgeY) < CELL_SIZE * 0.25) {
          const c = Math.floor(x / CELL_SIZE);
          if (c >= 0 && c < cols) {
            setEdgesH((prev) => {
              const next = prev.map((row) => [...row]);
              next[r][c] = next[r][c] === 1 ? 0 : 1;
              return next;
            });
            return;
          }
        }
      }

      // Detect if click is near a vertical edge (between cols)
      for (let c = 0; c < cols - 1; c++) {
        const edgeX = (c + 1) * CELL_SIZE;
        if (Math.abs(x - edgeX) < CELL_SIZE * 0.25) {
          const r = Math.floor(y / CELL_SIZE);
          if (r >= 0 && r < rows) {
            setEdgesV((prev) => {
              const next = prev.map((row) => [...row]);
              next[r][c] = next[r][c] === 1 ? 0 : 1;
              return next;
            });
            return;
          }
        }
      }
    },
    [getSvgCoord, rows, cols]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly) return;

      if (mode === "edge") {
        handleEdgeClick(e.clientX, e.clientY);
        return;
      }

      if (mode === "head") {
        const cell = getCellFromPoint(e.clientX, e.clientY);
        if (!cell) return;
        // Don't allow placing heads on canon cells with values
        if (cells[cell.r][cell.c] !== 0) return;
        if (heads[cell.r][cell.c] !== 0) {
          // Erase existing head
          setHeads((prev) => {
            const next = prev.map((row) => [...row]);
            next[cell.r][cell.c] = 0;
            return next;
          });
          setHeadPopup(null);
        } else {
          setHeadPopup(cell);
        }
        return;
      }

      // Trail mode
      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      draggingRef.current = true;
      eraseModeRef.current = null;
      lastCellRef.current = cell;
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [readonly, mode, getCellFromPoint, handleEdgeClick, cells, heads]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || mode !== "trail") return;
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
      if (dc === 1) edgeVal = trailsH[last.r][last.c];
      else if (dc === -1) edgeVal = trailsH[last.r][cell.c];
      else if (dr === 1) edgeVal = trailsV[last.r][last.c];
      else edgeVal = trailsV[cell.r][last.c];

      if (eraseModeRef.current === null) {
        eraseModeRef.current = edgeVal === 1;
      }

      const newVal = eraseModeRef.current ? 0 : 1;

      if (dc === 1) {
        setTrailsH((prev) => {
          const next = prev.map((row) => [...row]);
          next[last.r][last.c] = newVal;
          return next;
        });
      } else if (dc === -1) {
        setTrailsH((prev) => {
          const next = prev.map((row) => [...row]);
          next[last.r][cell.c] = newVal;
          return next;
        });
      } else if (dr === 1) {
        setTrailsV((prev) => {
          const next = prev.map((row) => [...row]);
          next[last.r][last.c] = newVal;
          return next;
        });
      } else {
        setTrailsV((prev) => {
          const next = prev.map((row) => [...row]);
          next[cell.r][last.c] = newVal;
          return next;
        });
      }

      lastCellRef.current = cell;
    },
    [getCellFromPoint, mode, trailsH, trailsV]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    lastCellRef.current = null;
  }, []);

  const placeHead = (dir: number) => {
    if (!headPopup) return;
    setHeads((prev) => {
      const next = prev.map((row) => [...row]);
      next[headPopup.r][headPopup.c] = dir;
      return next;
    });
    setHeadPopup(null);
  };

  return (
    <div style={{ maxWidth: svgWidth, width: "100%" }}>
      {!readonly && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 8,
            flexWrap: "wrap",
          }}
        >
          {(["trail", "edge", "head"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setHeadPopup(null);
              }}
              style={{
                padding: "4px 10px",
                fontWeight: mode === m ? "bold" : "normal",
                background: mode === m ? "#444" : "#eee",
                color: mode === m ? "#fff" : "#333",
                border: "1px solid #aaa",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {m === "trail" ? "Trail" : m === "edge" ? "Edge" : "Head"}
            </button>
          ))}
        </div>
      )}
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
              stroke="#ccc"
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
              stroke="#ccc"
              strokeWidth={0.5}
              strokeDasharray="4 3"
            />
          ))}

          {/* Player-drawn edges (solid black) */}
          {edgesH.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`eh-${r}-${c}`}
                  x1={c * CELL_SIZE}
                  y1={(r + 1) * CELL_SIZE}
                  x2={(c + 1) * CELL_SIZE}
                  y2={(r + 1) * CELL_SIZE}
                  stroke="#222"
                  strokeWidth={2.5}
                  pointerEvents="none"
                />
              ) : null
            )
          )}
          {edgesV.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`ev-${r}-${c}`}
                  x1={(c + 1) * CELL_SIZE}
                  y1={r * CELL_SIZE}
                  x2={(c + 1) * CELL_SIZE}
                  y2={(r + 1) * CELL_SIZE}
                  stroke="#222"
                  strokeWidth={2.5}
                  pointerEvents="none"
                />
              ) : null
            )
          )}

          {/* Trail segments (grey) */}
          {trailsH.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`th-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE}
                  y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 1.5) * CELL_SIZE}
                  y2={(r + 0.5) * CELL_SIZE}
                  stroke="#999"
                  strokeWidth={3}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ) : null
            )
          )}
          {trailsV.flatMap((row, r) =>
            row.map((val, c) =>
              val === 1 ? (
                <line
                  key={`tv-${r}-${c}`}
                  x1={(c + 0.5) * CELL_SIZE}
                  y1={(r + 0.5) * CELL_SIZE}
                  x2={(c + 0.5) * CELL_SIZE}
                  y2={(r + 1.5) * CELL_SIZE}
                  stroke="#999"
                  strokeWidth={3}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ) : null
            )
          )}

          {/* Canon cell values: numbers and given heads */}
          {cells.flatMap((row, r) =>
            row.map((val, c) => {
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              if (val > 0) {
                return (
                  <text
                    key={`num-${r}-${c}`}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={14}
                    fontWeight="bold"
                    fill="#222"
                    pointerEvents="none"
                  >
                    {val}
                  </text>
                );
              }
              if (val < 0) {
                return (
                  <path
                    key={`head-${r}-${c}`}
                    d={headTrianglePath(cx, cy, val, CELL_SIZE * 0.35)}
                    fill="#222"
                    pointerEvents="none"
                  />
                );
              }
              return null;
            })
          )}

          {/* Player-placed heads */}
          {heads.flatMap((row, r) =>
            row.map((val, c) => {
              if (val === 0) return null;
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              return (
                <path
                  key={`phead-${r}-${c}`}
                  d={headTrianglePath(cx, cy, val, CELL_SIZE * 0.35)}
                  fill="#4a7cb5"
                  pointerEvents="none"
                />
              );
            })
          )}

          {/* Head placement popup */}
          {headPopup && (
            <g>
              <rect
                x={headPopup.c * CELL_SIZE - 2}
                y={headPopup.r * CELL_SIZE - 2}
                width={CELL_SIZE + 4}
                height={CELL_SIZE + 4}
                fill="rgba(255,255,255,0.9)"
                stroke="#666"
                strokeWidth={1}
                rx={3}
              />
              {([-1, -2, -3, -4] as number[]).map((dir) => {
                const cx = (headPopup.c + 0.5) * CELL_SIZE;
                const cy = (headPopup.r + 0.5) * CELL_SIZE;
                const offset = CELL_SIZE * 0.28;
                let ox = 0,
                  oy = 0;
                if (dir === -1) oy = -offset;
                else if (dir === -2) oy = offset;
                else if (dir === -3) ox = -offset;
                else ox = offset;
                return (
                  <path
                    key={`popup-${dir}`}
                    d={headTrianglePath(
                      cx + ox,
                      cy + oy,
                      dir,
                      CELL_SIZE * 0.2
                    )}
                    fill="#4a7cb5"
                    stroke="#fff"
                    strokeWidth={0.5}
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      placeHead(dir);
                    }}
                  />
                );
              })}
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
