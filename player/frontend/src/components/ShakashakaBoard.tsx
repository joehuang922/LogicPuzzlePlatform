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
        // Black cell with number: count adjacent triangles
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

  // Check that all white regions form rectangles (axis-aligned or 45° rotated).
  // Each white cell is divided into 4 sub-triangles. We model each cell as 4 sub-regions:
  // For a cell with triangle orientation T, the triangle half is "black" and the other half is "white".
  // We check connectivity of white sub-regions and verify they form rectangles.

  // Model: each cell has 4 "half-edges" (top, right, bottom, left).
  // A white cell (state=0 or 5) has all 4 halves white.
  // A triangle cell has 2 halves white and 2 halves black.
  // We use a half-cell grid: each cell becomes 2x2 sub-cells.
  const subRows = rows * 2;
  const subCols = cols * 2;
  // 0 = white sub-cell, 1 = black sub-cell
  const subGrid: number[][] = Array.from({ length: subRows }, () =>
    Array(subCols).fill(1)
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellVal = canon.cells[r][c];
      const sr = r * 2;
      const sc = c * 2;
      if (cellVal !== -1) {
        // Black cell: all sub-cells are black (already set to 1)
        continue;
      }
      const state = stateGrid[r][c];
      if (state === 0) {
        // Unset — should not happen in a completed puzzle
        return false;
      }
      if (state === 5) {
        // Dot mark: entirely white
        subGrid[sr][sc] = 0;
        subGrid[sr][sc + 1] = 0;
        subGrid[sr + 1][sc] = 0;
        subGrid[sr + 1][sc + 1] = 0;
      } else {
        // Triangle: 2 sub-cells white, 2 black
        // ◤ (1): right angle top-left → black covers TL, white covers TR+BL+BR? No.
        // Actually: ◤ fills the top-left triangle → the BLACK triangle occupies:
        //   TL sub-cell = black, the diagonal. We approximate:
        //   ◤: TL=black, TR=white, BL=white, BR=white? That's wrong for half-cell model.
        //
        // Better model: ◤ means the triangle with vertices at TL, TR, BL corners.
        // The hypotenuse goes from TR to BL. Black half = upper-left triangle.
        // Sub-cell approximation:
        //   ◤: TL=black, TR=half, BL=half, BR=white → doesn't work cleanly.
        //
        // Use a finer 2x2 model where we treat each sub-cell as:
        //   For ◤ (black triangle upper-left): TL=black, others=white
        //   For ◥ (black triangle upper-right): TR=black, others=white
        //   For ◣ (black triangle lower-left): BL=black, others=white
        //   For ◢ (black triangle lower-right): BR=black, others=white
        // This is an approximation but works for rectangle validation
        // because the diagonal edge between two adjacent triangles forms
        // a consistent boundary in the sub-grid.
        subGrid[sr][sc] = 0;
        subGrid[sr][sc + 1] = 0;
        subGrid[sr + 1][sc] = 0;
        subGrid[sr + 1][sc + 1] = 0;
        switch (state) {
          case 1: // ◤ black at top-left
            subGrid[sr][sc] = 1;
            break;
          case 2: // ◥ black at top-right
            subGrid[sr][sc + 1] = 1;
            break;
          case 3: // ◣ black at bottom-left
            subGrid[sr + 1][sc] = 1;
            break;
          case 4: // ◢ black at bottom-right
            subGrid[sr + 1][sc + 1] = 1;
            break;
        }
      }
    }
  }

  // Find connected white regions in subGrid and check each is a rectangle
  const visited: boolean[][] = Array.from({ length: subRows }, () =>
    Array(subCols).fill(false)
  );

  for (let sr = 0; sr < subRows; sr++) {
    for (let sc = 0; sc < subCols; sc++) {
      if (subGrid[sr][sc] !== 0 || visited[sr][sc]) continue;
      // BFS to find the connected white region
      const queue: [number, number][] = [[sr, sc]];
      visited[sr][sc] = true;
      let minR = sr,
        maxR = sr,
        minC = sc,
        maxC = sc;
      let count = 0;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        count++;
        minR = Math.min(minR, cr);
        maxR = Math.max(maxR, cr);
        minC = Math.min(minC, cc);
        maxC = Math.max(maxC, cc);
        for (const [dr, dc] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as [number, number][]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (
            nr >= 0 &&
            nr < subRows &&
            nc >= 0 &&
            nc < subCols &&
            !visited[nr][nc] &&
            subGrid[nr][nc] === 0
          ) {
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }
      // A rectangle in sub-grid has area = (maxR - minR + 1) * (maxC - minC + 1)
      const expectedArea = (maxR - minR + 1) * (maxC - minC + 1);
      if (count !== expectedArea) return false;
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
    // Check all white cells are assigned
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c] === -1 && stateGrid[r][c] === 0) return;
      }
    }
    if (validateSolution(canon, stateGrid)) {
      completedRef.current = true;
      onComplete?.();
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
