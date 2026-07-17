import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
const BORDER_WIDTH = 2;

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

type HeadEdge =
  | { type: "h"; r: number; c: number }
  | { type: "v"; r: number; c: number }
  | null;

function getHeadEdge(r: number, c: number, dir: number, rows: number, cols: number): HeadEdge {
  switch (dir) {
    case -1: // up: flat base at bottom
      return r < rows - 1 ? { type: "h", r, c } : null;
    case -2: // down: flat base at top
      return r > 0 ? { type: "h", r: r - 1, c } : null;
    case -3: // left: flat base at right
      return c < cols - 1 ? { type: "v", r, c } : null;
    case -4: // right: flat base at left
      return c > 0 ? { type: "v", r, c: c - 1 } : null;
    default:
      return null;
  }
}

function PencilHead({
  cx,
  cy,
  dir,
  size,
  tipFill,
}: {
  cx: number;
  cy: number;
  dir: number;
  size: number;
  tipFill: string;
}) {
  let angle = 0;
  switch (dir) {
    case -1: angle = 180; break;
    case -2: angle = 0; break;
    case -3: angle = 90; break;
    case -4: angle = -90; break;
  }

  const x0 = cx - size / 2;
  const y0 = cy - size / 2;
  const outerPts = `${x0},${y0} ${x0 + size},${y0} ${x0 + size * 0.5},${y0 + size * 0.5}`;
  const innerPts = `${x0 + size * 0.3},${y0 + size * 0.3} ${x0 + size * 0.7},${y0 + size * 0.3} ${x0 + size * 0.5},${y0 + size * 0.5}`;

  return (
    <g transform={`rotate(${angle}, ${cx}, ${cy})`} pointerEvents="none">
      <polygon points={outerPts} fill="white" stroke={tipFill} strokeWidth={BORDER_WIDTH} />
      <polygon points={innerPts} fill={tipFill} />
    </g>
  );
}

function validateSolution(
  canon: PencilsCanon,
  trails: { h: number[][]; v: number[][] },
  heads: number[][],
  edges: { h: number[][]; v: number[][] }
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // Merge canon heads + player heads
  const allHeads: number[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (canon.cells[r][c] < 0) return canon.cells[r][c];
      return heads[r][c];
    })
  );

  // Build full edge map including head-implied edges and grid boundary.
  // edgeH[r][c] = 1 means there's a wall between (r,c) and (r+1,c)
  // edgeV[r][c] = 1 means there's a wall between (r,c) and (r,c+1)
  const wallH: boolean[][] = Array.from({ length: rows + 1 }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      if (r === 0 || r === rows) return true; // grid boundary
      return edges.h[r - 1][c] === 1;
    })
  );
  const wallV: boolean[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols + 1 }, (_, c) => {
      if (c === 0 || c === cols) return true; // grid boundary
      return edges.v[r][c - 1] === 1;
    })
  );

  // Add head-implied walls
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dir = allHeads[r][c];
      if (dir >= 0) continue;
      switch (dir) {
        case -1: wallH[r + 1][c] = true; break; // up: base at bottom
        case -2: wallH[r][c] = true; break;     // down: base at top
        case -3: wallV[r][c + 1] = true; break; // left: base at right
        case -4: wallV[r][c] = true; break;     // right: base at left
      }
    }
  }

  // Build trail adjacency: for each cell, which neighbors are connected by trail
  const trailAdj: number[][][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => [])
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (trails.h[r][c] === 1) {
        trailAdj[r][c].push(r * cols + c + 1);
        trailAdj[r][c + 1].push(r * cols + c);
      }
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (trails.v[r][c] === 1) {
        trailAdj[r][c].push((r + 1) * cols + c);
        trailAdj[r + 1][c].push(r * cols + c);
      }
    }
  }

  // Note: trails ARE allowed to cross walls — the head's base wall separates
  // body from trail, but the trail passes through the head cell and can cross
  // that wall. Overlap/correctness is enforced by per-pencil checks below.

  // Flood-fill to find connected regions (ignoring walls) to check coverage
  // But the real structure is: each pencil = head + body (rectangle) + trail (path).
  // Head is separated from body by the head's base wall, so they're in different
  // wall-bounded regions. We validate per-head instead.

  // Collect all head positions
  const allHeadPositions: { r: number; c: number; dir: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (allHeads[r][c] < 0) {
        allHeadPositions.push({ r, c, dir: allHeads[r][c] });
      }
    }
  }

  // Track which cells are claimed by a pencil
  const claimed: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (const head of allHeadPositions) {
    // 1. Find the body: flood-fill from the cell on the base side of the head,
    //    bounded by walls (edges + boundary + head-implied walls).
    let baseR = head.r, baseC = head.c;
    switch (head.dir) {
      case -1: baseR++; break; // up: body below
      case -2: baseR--; break; // down: body above
      case -3: baseC++; break; // left: body to right
      case -4: baseC--; break; // right: body to left
    }

    if (baseR < 0 || baseR >= rows || baseC < 0 || baseC >= cols) return false;

    // Flood-fill body from baseR, baseC using walls
    const bodyVisited = new Set<number>();
    const bodyQueue: [number, number][] = [[baseR, baseC]];
    bodyVisited.add(baseR * cols + baseC);
    const bodyCells: { r: number; c: number }[] = [];

    while (bodyQueue.length > 0) {
      const [cr, cc] = bodyQueue.pop()!;
      bodyCells.push({ r: cr, c: cc });
      // up
      if (cr > 0 && !wallH[cr][cc] && !bodyVisited.has((cr - 1) * cols + cc)) {
        bodyVisited.add((cr - 1) * cols + cc);
        bodyQueue.push([cr - 1, cc]);
      }
      // down
      if (cr < rows - 1 && !wallH[cr + 1][cc] && !bodyVisited.has((cr + 1) * cols + cc)) {
        bodyVisited.add((cr + 1) * cols + cc);
        bodyQueue.push([cr + 1, cc]);
      }
      // left
      if (cc > 0 && !wallV[cr][cc] && !bodyVisited.has(cr * cols + cc - 1)) {
        bodyVisited.add(cr * cols + cc - 1);
        bodyQueue.push([cr, cc - 1]);
      }
      // right
      if (cc < cols - 1 && !wallV[cr][cc + 1] && !bodyVisited.has(cr * cols + cc + 1)) {
        bodyVisited.add(cr * cols + cc + 1);
        bodyQueue.push([cr, cc + 1]);
      }
    }

    // Body must form a rectangle
    if (bodyCells.length === 0) return false;
    const minR = Math.min(...bodyCells.map((c) => c.r));
    const maxR = Math.max(...bodyCells.map((c) => c.r));
    const minC = Math.min(...bodyCells.map((c) => c.c));
    const maxC = Math.max(...bodyCells.map((c) => c.c));
    if (bodyCells.length !== (maxR - minR + 1) * (maxC - minC + 1)) return false;

    // Collect number clues in body; body must not contain heads
    const numCells: { val: number }[] = [];
    for (const bc of bodyCells) {
      const cv = canon.cells[bc.r][bc.c];
      if (cv > 0) numCells.push({ val: cv });
      if (allHeads[bc.r][bc.c] < 0) return false;
    }

    // 2. Walk the trail from the head cell.
    //    The trail is a non-branching path that includes the head cell.
    //    Head can be at one end or in the middle of the trail (max 2 connections).
    const headIdx = head.r * cols + head.c;
    const headNeighbors = trailAdj[head.r][head.c];
    if (headNeighbors.length === 0 || headNeighbors.length > 2) return false;

    // Walk in both directions from the head to find the full trail path
    const trailCells = new Set<number>();
    trailCells.add(headIdx);

    for (const startNbr of headNeighbors) {
      let cur = startNbr;
      const visited = new Set<number>();
      visited.add(headIdx);
      while (true) {
        if (trailCells.has(cur) && cur !== headIdx) break; // rejoining (shouldn't happen)
        visited.add(cur);
        trailCells.add(cur);
        const tr = Math.floor(cur / cols);
        const tc = cur % cols;
        const nbrs = trailAdj[tr][tc].filter((n: number) => !visited.has(n));
        if (nbrs.length > 1) return false; // branching
        if (nbrs.length === 0) break;
        cur = nbrs[0];
      }
    }

    // Trail length = total trail cells minus the head cell
    const trailLength = trailCells.size - 1;

    // Trail length must equal body cell count
    if (trailLength !== bodyCells.length) return false;

    // Any number clues in the body must also match trail length
    for (const nc of numCells) {
      if (nc.val !== trailLength) return false;
    }

    // 3. Trail must not pass through body cells
    for (const idx of trailCells) {
      if (idx !== headIdx && bodyVisited.has(idx)) return false;
    }

    // 4. Claim all cells (head + trail + body)
    for (const idx of trailCells) {
      const cr = Math.floor(idx / cols);
      const cc = idx % cols;
      if (claimed[cr][cc]) return false; // overlap with another pencil
      claimed[cr][cc] = true;
    }
    for (const bc of bodyCells) {
      if (claimed[bc.r][bc.c]) return false; // overlap
      claimed[bc.r][bc.c] = true;
    }
  }

  // Every cell must be claimed
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!claimed[r][c]) return false;
    }
  }

  return true;
}

const EDGE_ZONE = 0.22;

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

  // Edges implied by canon heads (computed once, never change)
  const canonLockedEdges = useMemo(() => {
    const locked = { h: new Set<string>(), v: new Set<string>() };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c] < 0) {
          const edge = getHeadEdge(r, c, cells[r][c], rows, cols);
          if (edge) locked[edge.type].add(`${edge.r},${edge.c}`);
        }
      }
    }
    return locked;
  }, [cells, rows, cols]);

  // Edges implied by player heads (recomputed when heads change)
  const playerLockedEdges = useMemo(() => {
    const locked = { h: new Set<string>(), v: new Set<string>() };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (heads[r][c] !== 0) {
          const edge = getHeadEdge(r, c, heads[r][c], rows, cols);
          if (edge) locked[edge.type].add(`${edge.r},${edge.c}`);
        }
      }
    }
    return locked;
  }, [heads, rows, cols]);

  const isEdgeLocked = useCallback(
    (type: "h" | "v", r: number, c: number): boolean => {
      const key = `${r},${c}`;
      return canonLockedEdges[type].has(key) || playerLockedEdges[type].has(key);
    },
    [canonLockedEdges, playerLockedEdges]
  );

  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const eraseModeRef = useRef<boolean | null>(null);
  const lastCellRef = useRef<{ r: number; c: number } | null>(null);
  const didDragRef = useRef(false);
  const [pendingHead, setPendingHead] = useState<{ r: number; c: number } | null>(null);

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

  const tryToggleEdge = useCallback(
    (clientX: number, clientY: number): boolean => {
      const coord = getSvgCoord(clientX, clientY);
      if (!coord) return false;
      const { x, y } = coord;
      const threshold = CELL_SIZE * EDGE_ZONE;

      for (let r = 0; r < rows - 1; r++) {
        const edgeY = (r + 1) * CELL_SIZE;
        if (Math.abs(y - edgeY) < threshold) {
          const c = Math.floor(x / CELL_SIZE);
          if (c >= 0 && c < cols) {
            if (isEdgeLocked("h", r, c)) return true; // consumed click but don't toggle
            setEdgesH((prev) => {
              const next = prev.map((row) => [...row]);
              next[r][c] = next[r][c] === 1 ? 0 : 1;
              return next;
            });
            return true;
          }
        }
      }

      for (let c = 0; c < cols - 1; c++) {
        const edgeX = (c + 1) * CELL_SIZE;
        if (Math.abs(x - edgeX) < threshold) {
          const r = Math.floor(y / CELL_SIZE);
          if (r >= 0 && r < rows) {
            if (isEdgeLocked("v", r, c)) return true;
            setEdgesV((prev) => {
              const next = prev.map((row) => [...row]);
              next[r][c] = next[r][c] === 1 ? 0 : 1;
              return next;
            });
            return true;
          }
        }
      }

      return false;
    },
    [getSvgCoord, rows, cols, isEdgeLocked]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readonly) return;

      if (tryToggleEdge(e.clientX, e.clientY)) {
        return;
      }

      const cell = getCellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      draggingRef.current = true;
      didDragRef.current = false;
      eraseModeRef.current = null;
      lastCellRef.current = cell;
      (e.target as Element).setPointerCapture(e.pointerId);
    },
    [readonly, getCellFromPoint, tryToggleEdge]
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
    [getCellFromPoint, trailsH, trailsV]
  );

  const handlePointerUp = useCallback(() => {
    const wasDrag = didDragRef.current;
    const cell = lastCellRef.current;
    draggingRef.current = false;
    lastCellRef.current = null;

    if (!wasDrag && cell) {
      if (cells[cell.r][cell.c] !== 0) return;
      if (heads[cell.r][cell.c] !== 0) {
        // Remove head and its implied edge
        const dir = heads[cell.r][cell.c];
        const edge = getHeadEdge(cell.r, cell.c, dir, rows, cols);
        setHeads((prev) => {
          const next = prev.map((row) => [...row]);
          next[cell.r][cell.c] = 0;
          return next;
        });
        if (edge) {
          if (edge.type === "h") {
            setEdgesH((prev) => {
              const next = prev.map((row) => [...row]);
              next[edge.r][edge.c] = 0;
              return next;
            });
          } else {
            setEdgesV((prev) => {
              const next = prev.map((row) => [...row]);
              next[edge.r][edge.c] = 0;
              return next;
            });
          }
        }
        setPendingHead(null);
      } else {
        setPendingHead(cell);
      }
    }
  }, [cells, heads, rows, cols]);

  const placeHead = (dir: number) => {
    if (!pendingHead) return;
    const { r, c } = pendingHead;
    setHeads((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = dir;
      return next;
    });
    // Auto-set the implied edge
    const edge = getHeadEdge(r, c, dir, rows, cols);
    if (edge) {
      if (edge.type === "h") {
        setEdgesH((prev) => {
          const next = prev.map((row) => [...row]);
          next[edge.r][edge.c] = 1;
          return next;
        });
      } else {
        setEdgesV((prev) => {
          const next = prev.map((row) => [...row]);
          next[edge.r][edge.c] = 1;
          return next;
        });
      }
    }
    setPendingHead(null);
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
            strokeWidth={BORDER_WIDTH}
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

          {/* Player-drawn edges + canon-head-implied edges (solid black, same weight as border) */}
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
                  strokeWidth={BORDER_WIDTH}
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
                  strokeWidth={BORDER_WIDTH}
                  pointerEvents="none"
                />
              ) : null
            )
          )}
          {/* Canon-head-implied edges (not in player state) */}
          {Array.from(canonLockedEdges.h).map((key) => {
            const [r, c] = key.split(",").map(Number);
            return (
              <line
                key={`ceh-${key}`}
                x1={c * CELL_SIZE}
                y1={(r + 1) * CELL_SIZE}
                x2={(c + 1) * CELL_SIZE}
                y2={(r + 1) * CELL_SIZE}
                stroke="#222"
                strokeWidth={BORDER_WIDTH}
                pointerEvents="none"
              />
            );
          })}
          {Array.from(canonLockedEdges.v).map((key) => {
            const [r, c] = key.split(",").map(Number);
            return (
              <line
                key={`cev-${key}`}
                x1={(c + 1) * CELL_SIZE}
                y1={r * CELL_SIZE}
                x2={(c + 1) * CELL_SIZE}
                y2={(r + 1) * CELL_SIZE}
                stroke="#222"
                strokeWidth={BORDER_WIDTH}
                pointerEvents="none"
              />
            );
          })}

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
                  <PencilHead
                    key={`head-${r}-${c}`}
                    cx={cx}
                    cy={cy}
                    dir={val}
                    size={CELL_SIZE}
                    tipFill="#222"
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
                <PencilHead
                  key={`phead-${r}-${c}`}
                  cx={cx}
                  cy={cy}
                  dir={val}
                  size={CELL_SIZE}
                  tipFill="#4a7cb5"
                />
              );
            })
          )}

          {/* Highlight pending head cell */}
          {pendingHead && (
            <rect
              x={pendingHead.c * CELL_SIZE}
              y={pendingHead.r * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill="rgba(74, 124, 181, 0.15)"
              stroke="#4a7cb5"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {/* Direction picker below the board */}
      {!readonly && pendingHead && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 8,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: "#666" }}>Direction:</span>
          {(
            [
              { dir: -1, label: "Up" },
              { dir: -2, label: "Down" },
              { dir: -3, label: "Left" },
              { dir: -4, label: "Right" },
            ] as const
          ).map(({ dir, label }) => (
            <svg
              key={dir}
              width={CELL_SIZE}
              height={CELL_SIZE}
              viewBox={`0 0 ${CELL_SIZE} ${CELL_SIZE}`}
              style={{
                cursor: "pointer",
                border: "1px solid #aaa",
                borderRadius: 4,
                background: "#fafafa",
              }}
              onClick={() => placeHead(dir)}
              aria-label={label}
            >
              <PencilHead
                cx={CELL_SIZE / 2}
                cy={CELL_SIZE / 2}
                dir={dir}
                size={CELL_SIZE}
                tipFill="#4a7cb5"
              />
            </svg>
          ))}
          <button
            onClick={() => setPendingHead(null)}
            style={{
              marginLeft: 4,
              padding: "2px 8px",
              fontSize: 12,
              border: "1px solid #aaa",
              borderRadius: 4,
              background: "#eee",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
