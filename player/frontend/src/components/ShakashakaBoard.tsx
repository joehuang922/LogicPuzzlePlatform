import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ShakashakaCanon } from "../types/canon";

interface ShakashakaBoardProps {
  canon: ShakashakaCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;

type CellValue = 0 | 1 | 2 | 3 | 4 | 5;
// 0=unset, 1=◤, 2=◥, 3=◣, 4=◢, 5=dot mark

type DrawMode = "triangle" | "mark";

function getTrianglePoints(
  x: number,
  y: number,
  size: number,
  orientation: 1 | 2 | 3 | 4
): string {
  const x0 = x;
  const y0 = y;
  const x1 = x + size;
  const y1 = y + size;
  switch (orientation) {
    case 1: // ◤ top-left right angle
      return `${x0},${y0} ${x1},${y0} ${x0},${y1}`;
    case 2: // ◥ top-right right angle
      return `${x0},${y0} ${x1},${y0} ${x1},${y1}`;
    case 3: // ◣ bottom-left right angle
      return `${x0},${y0} ${x0},${y1} ${x1},${y1}`;
    case 4: // ◢ bottom-right right angle
      return `${x1},${y0} ${x0},${y1} ${x1},${y1}`;
  }
}

function getQuadrant(
  clickX: number,
  clickY: number,
  cellX: number,
  cellY: number,
  cellSize: number
): 1 | 2 | 3 | 4 {
  const relX = clickX - cellX;
  const relY = clickY - cellY;
  const midX = cellSize / 2;
  const midY = cellSize / 2;
  if (relX < midX && relY < midY) return 1; // top-left
  if (relX >= midX && relY < midY) return 2; // top-right
  if (relX < midX && relY >= midY) return 3; // bottom-left
  return 4; // bottom-right
}

function isWhite(
  r: number,
  c: number,
  canon: ShakashakaCanon,
  stateGrid: CellValue[][]
): boolean {
  if (r < 0 || r >= canon.cells.length || c < 0 || c >= canon.cells[0].length)
    return false;
  if (canon.cells[r][c] !== -1) return false;
  const s = stateGrid[r][c];
  return s === 0 || s === 5;
}

function isTriangle(
  r: number,
  c: number,
  canon: ShakashakaCanon,
  stateGrid: CellValue[][],
  expected: CellValue
): boolean {
  if (r < 0 || r >= canon.cells.length || c < 0 || c >= canon.cells[0].length)
    return false;
  if (canon.cells[r][c] !== -1) return false;
  return stateGrid[r][c] === expected;
}

function validateSolution(
  canon: ShakashakaCanon,
  stateGrid: CellValue[][]
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // Check numbered constraints
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = canon.cells[r][c];
      if (cell >= 0 && cell <= 4) {
        let count = 0;
        const neighbors: [number, number][] = [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const val = stateGrid[nr][nc];
            if (val >= 1 && val <= 4) count++;
          }
        }
        if (count !== cell) return false;
      }
    }
  }

  // Validate white regions form rectangles (type A or type B).
  // visited tracks cells already accounted for by a validated rectangle.
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r][c]) continue;
      if (canon.cells[r][c] !== -1) continue;
      const state = stateGrid[r][c];

      if (state === 0 || state === 5) {
        // Type A: axis-aligned rectangle of white/marked cells
        // Flood-fill adjacent white/marked cells, verify rectangle shape
        const queue: [number, number][] = [[r, c]];
        visited[r][c] = true;
        let minR = r, maxR = r, minC = c, maxC = c;
        let count = 0;
        while (queue.length > 0) {
          const [cr, cc] = queue.pop()!;
          count++;
          minR = Math.min(minR, cr);
          maxR = Math.max(maxR, cr);
          minC = Math.min(minC, cc);
          maxC = Math.max(maxC, cc);
          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                !visited[nr][nc] && isWhite(nr, nc, canon, stateGrid)) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }
        const expectedArea = (maxR - minR + 1) * (maxC - minC + 1);
        if (count !== expectedArea) return false;
        // Verify no triangle cells inside the bounding box
        for (let rr = minR; rr <= maxR; rr++) {
          for (let cc = minC; cc <= maxC; cc++) {
            if (!isWhite(rr, cc, canon, stateGrid)) return false;
          }
        }
      } else if (state === 1) {
        // Type B: diagonal rectangle starting from ◤
        // Trace the contour: UL edge → UR edge → LR edge → LL edge → close
        const contour: [number, number][] = [[r, c]];
        visited[r][c] = true;

        let cr = r, cc = c;
        type Phase = "UL" | "UR" | "LR" | "LL" | "UL_CLOSE";
        let phase: Phase = "UL";

        // Trace UL edge (going up-right diagonally)
        while (phase === "UL") {
          if (isTriangle(cr, cc + 1, canon, stateGrid, 2)) {
            // Corner: switch to UR edge
            cr = cr; cc = cc + 1;
            contour.push([cr, cc]);
            visited[cr][cc] = true;
            phase = "UR";
          } else if (isWhite(cr, cc + 1, canon, stateGrid) &&
                     isTriangle(cr - 1, cc + 1, canon, stateGrid, 1)) {
            cr = cr - 1; cc = cc + 1;
            contour.push([cr, cc]);
            visited[cr][cc] = true;
          } else {
            return false;
          }
        }

        // Trace UR edge (going down-right diagonally)
        while (phase === "UR") {
          if (isTriangle(cr + 1, cc, canon, stateGrid, 4)) {
            // Corner: switch to LR edge
            cr = cr + 1; cc = cc;
            contour.push([cr, cc]);
            visited[cr][cc] = true;
            phase = "LR";
          } else if (isWhite(cr + 1, cc, canon, stateGrid) &&
                     isTriangle(cr + 1, cc + 1, canon, stateGrid, 2)) {
            cr = cr + 1; cc = cc + 1;
            contour.push([cr, cc]);
            visited[cr][cc] = true;
          } else {
            return false;
          }
        }

        // Trace LR edge (going down-left diagonally)
        while (phase === "LR") {
          if (isTriangle(cr, cc - 1, canon, stateGrid, 3)) {
            // Corner: switch to LL edge
            cr = cr; cc = cc - 1;
            contour.push([cr, cc]);
            visited[cr][cc] = true;
            phase = "LL";
          } else if (isWhite(cr, cc - 1, canon, stateGrid) &&
                     isTriangle(cr + 1, cc - 1, canon, stateGrid, 4)) {
            cr = cr + 1; cc = cc - 1;
            contour.push([cr, cc]);
            visited[cr][cc] = true;
          } else {
            return false;
          }
        }

        // Trace LL edge (going up-left diagonally)
        while (phase === "LL") {
          if (isTriangle(cr - 1, cc, canon, stateGrid, 1)) {
            // Corner: switch to UL close
            cr = cr - 1; cc = cc;
            if (cr === r && cc === c) {
              phase = "UL_CLOSE";
              break;
            }
            contour.push([cr, cc]);
            visited[cr][cc] = true;
            phase = "UL_CLOSE";
          } else if (isWhite(cr - 1, cc, canon, stateGrid) &&
                     isTriangle(cr - 1, cc - 1, canon, stateGrid, 3)) {
            cr = cr - 1; cc = cc - 1;
            contour.push([cr, cc]);
            visited[cr][cc] = true;
          } else {
            return false;
          }
        }

        // Close back to origin along UL edge
        while (phase === "UL_CLOSE") {
          if (cr === r && cc === c) {
            break;
          }
          if (isWhite(cr, cc + 1, canon, stateGrid) &&
              isTriangle(cr - 1, cc + 1, canon, stateGrid, 1)) {
            cr = cr - 1; cc = cc + 1;
            if (cr === r && cc === c) break;
            contour.push([cr, cc]);
            visited[cr][cc] = true;
          } else {
            return false;
          }
        }

        // Mark interior white cells as visited and verify they are all white
        // Interior = cells adjacent to contour cells that are white and not on contour
        // For a diagonal rectangle, interior cells are those "inside" the parallelogram.
        // We collect all white cells reachable from contour neighbors that aren't on contour.
        const contourSet = new Set(contour.map(([rr, cc]) => `${rr},${cc}`));
        for (const [cr, cc] of contour) {
          // Check the white cell that sits between diagonal contour steps
          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
            const nr = cr + dr;
            const nc = cc + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
                !visited[nr][nc] && isWhite(nr, nc, canon, stateGrid) &&
                !contourSet.has(`${nr},${nc}`)) {
              // BFS to find connected interior white region
              const intQueue: [number, number][] = [[nr, nc]];
              visited[nr][nc] = true;
              while (intQueue.length > 0) {
                const [ir, ic] = intQueue.pop()!;
                for (const [dr2, dc2] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
                  const ir2 = ir + dr2;
                  const ic2 = ic + dc2;
                  if (ir2 >= 0 && ir2 < rows && ic2 >= 0 && ic2 < cols &&
                      !visited[ir2][ic2] && isWhite(ir2, ic2, canon, stateGrid)) {
                    visited[ir2][ic2] = true;
                    intQueue.push([ir2, ic2]);
                  }
                }
              }
            }
          }
        }
      } else {
        // Triangle cells 2,3,4 encountered before being part of a traced contour = invalid
        // (scanning left-to-right, top-to-bottom, ◤ is always the first triangle of a diagonal rect)
        return false;
      }
    }
  }

  return true;
}

export default function ShakashakaBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: ShakashakaBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const initialStates = useMemo(() => {
    const grid: CellValue[][] = Array.from({ length: rows }, () =>
      Array(cols).fill(0) as CellValue[]
    );
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        const [c, r] = key.split(",").map(Number);
        if (r < rows && c < cols && val >= 0 && val <= 5) {
          grid[r][c] = val as CellValue;
        }
      }
    }
    return grid;
  }, [initialUserValues, rows, cols]);

  const [stateGrid, setStateGrid] = useState<CellValue[][]>(initialStates);
  const [drawMode, setDrawMode] = useState<DrawMode>("triangle");
  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const values: Record<string, number> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c] !== -1) continue;
        const state = stateGrid[r][c];
        if (state !== 0) {
          values[`${c},${r}`] = state;
        }
      }
    }
    onValuesChange?.(values);
  }, [stateGrid, rows, cols, cells, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    console.log("[shaka] validateSolution running, stateGrid:", JSON.stringify(stateGrid));
    try {
      const result = validateSolution(canon, stateGrid);
      console.log("[shaka] validateSolution result:", result);
      if (result) {
        completedRef.current = true;
        onComplete?.();
      }
    } catch (e) {
      console.error("[shaka] validateSolution threw:", e);
    }
  }, [stateGrid, canon, cells, rows, cols, onComplete]);

  const handleCellClick = useCallback(
    (r: number, c: number, e: React.MouseEvent) => {
      if (readonly) return;
      if (cells[r][c] !== -1) return;

      if (drawMode === "mark") {
        setStateGrid((prev) => {
          const next = prev.map((row) => [...row]);
          next[r][c] = prev[r][c] === 5 ? 0 : 5;
          return next;
        });
        return;
      }

      // Triangle mode: determine quadrant from click position
      const svg = svgRef.current;
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
      const cellX = PAD + c * CELL_SIZE;
      const cellY = PAD + r * CELL_SIZE;
      const quadrant = getQuadrant(svgPt.x, svgPt.y, cellX, cellY, CELL_SIZE);

      setStateGrid((prev) => {
        const next = prev.map((row) => [...row]);
        if (prev[r][c] === quadrant) {
          next[r][c] = 0;
        } else {
          next[r][c] = quadrant;
        }
        return next;
      });
    },
    [readonly, cells, drawMode]
  );

  const elements: JSX.Element[] = [];

  // Cell backgrounds
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PAD + c * CELL_SIZE;
      const y = PAD + r * CELL_SIZE;
      const cellVal = cells[r][c];
      if (cellVal !== -1) {
        // Black cell
        elements.push(
          <rect
            key={`bg-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="#222"
          />
        );
        // Number on black cell
        if (cellVal >= 0 && cellVal <= 4) {
          elements.push(
            <text
              key={`num-${r}-${c}`}
              x={x + CELL_SIZE / 2}
              y={y + CELL_SIZE / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={CELL_SIZE * 0.5}
              fontFamily="sans-serif"
              fontWeight="bold"
              fill="white"
              pointerEvents="none"
            >
              {cellVal}
            </text>
          );
        }
      } else {
        // White cell background
        elements.push(
          <rect
            key={`bg-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="white"
          />
        );
        // Draw player state
        const state = stateGrid[r][c];
        if (state >= 1 && state <= 4) {
          elements.push(
            <polygon
              key={`tri-${r}-${c}`}
              points={getTrianglePoints(x, y, CELL_SIZE, state as 1 | 2 | 3 | 4)}
              fill="#222"
              pointerEvents="none"
            />
          );
        } else if (state === 5) {
          elements.push(
            <circle
              key={`dot-${r}-${c}`}
              cx={x + CELL_SIZE / 2}
              cy={y + CELL_SIZE / 2}
              r={4}
              fill="#666"
              pointerEvents="none"
            />
          );
        }
      }
    }
  }

  // Grid lines (dashed for inner, solid for border)
  for (let r = 0; r <= rows; r++) {
    const isBorder = r === 0 || r === rows;
    elements.push(
      <line
        key={`hline-${r}`}
        x1={PAD}
        y1={PAD + r * CELL_SIZE}
        x2={PAD + cols * CELL_SIZE}
        y2={PAD + r * CELL_SIZE}
        stroke="#333"
        strokeWidth={isBorder ? 2 : 0.5}
        strokeDasharray={isBorder ? undefined : "3,3"}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    const isBorder = c === 0 || c === cols;
    elements.push(
      <line
        key={`vline-${c}`}
        x1={PAD + c * CELL_SIZE}
        y1={PAD}
        x2={PAD + c * CELL_SIZE}
        y2={PAD + rows * CELL_SIZE}
        stroke="#333"
        strokeWidth={isBorder ? 2 : 0.5}
        strokeDasharray={isBorder ? undefined : "3,3"}
      />
    );
  }

  // Click targets
  const targets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c] !== -1) continue;
        const x = PAD + c * CELL_SIZE;
        const y = PAD + r * CELL_SIZE;
        targets.push(
          <rect
            key={`click-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={(e) => handleCellClick(r, c, e)}
            onContextMenu={(e) => e.preventDefault()}
          />
        );
      }
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            border: "1px solid #ccc",
            userSelect: "none",
            display: "block",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {elements}
          {targets}
        </svg>
      </div>
      {!readonly && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setDrawMode("triangle")}
            style={{
              width: 36,
              height: 36,
              background: drawMode === "triangle" ? "#222" : "#fff",
              border:
                drawMode === "triangle"
                  ? "3px solid #0066ff"
                  : "2px solid #999",
              borderRadius: 4,
              cursor: "pointer",
              position: "relative",
            }}
            title="Triangle mode"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            >
              <polygon
                points="2,2 18,2 2,18"
                fill={drawMode === "triangle" ? "white" : "#222"}
              />
            </svg>
          </button>
          <button
            onClick={() => setDrawMode("mark")}
            style={{
              width: 36,
              height: 36,
              background: "#fff",
              border:
                drawMode === "mark" ? "3px solid #0066ff" : "2px solid #999",
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Mark mode (dot)"
          >
            <svg width="20" height="20" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="4" fill="#666" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
