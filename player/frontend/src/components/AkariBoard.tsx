import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AkariCanon } from "../types/canon";

interface AkariBoardProps {
  canon: AkariCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

const CELL_SIZE = 36;
const PAD = 12;

type CellValue = 0 | 1 | 2;
// 0 = empty, 1 = bulb, 2 = dot/no-bulb mark

function isBlack(cell: number): boolean {
  return cell !== -1;
}

// Compute, for the current bulb placement:
//  - lit: which white cells are illuminated
//  - conflict: which bulb cells illuminate another bulb
function computeIllumination(
  canon: AkariCanon,
  stateGrid: CellValue[][]
): { lit: boolean[][]; conflict: boolean[][] } {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  const lit: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );
  const conflict: boolean[][] = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  const dirs: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBlack(canon.cells[r][c]) || stateGrid[r][c] !== 1) continue;
      // Bulb at (r, c)
      lit[r][c] = true;
      for (const [dr, dc] of dirs) {
        let nr = r + dr;
        let nc = c + dc;
        while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          if (isBlack(canon.cells[nr][nc])) break; // wall blocks light
          lit[nr][nc] = true;
          if (stateGrid[nr][nc] === 1) {
            // Two bulbs see each other
            conflict[r][c] = true;
            conflict[nr][nc] = true;
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
    }
  }

  return { lit, conflict };
}

function validateSolution(
  canon: AkariCanon,
  stateGrid: CellValue[][]
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;
  const { lit, conflict } = computeIllumination(canon, stateGrid);

  // No bulb may illuminate another.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (conflict[r][c]) return false;
    }
  }

  // Every white cell must be illuminated.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBlack(canon.cells[r][c])) continue;
      if (!lit[r][c]) return false;
    }
  }

  // Each numbered black cell must have exactly that many adjacent bulbs.
  const dirs: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = canon.cells[r][c];
      if (cell >= 0 && cell <= 4) {
        let count = 0;
        for (const [dr, dc] of dirs) {
          const nr = r + dr;
          const nc = c + dc;
          if (
            nr >= 0 &&
            nr < rows &&
            nc >= 0 &&
            nc < cols &&
            !isBlack(canon.cells[nr][nc]) &&
            stateGrid[nr][nc] === 1
          ) {
            count++;
          }
        }
        if (count !== cell) return false;
      }
    }
  }

  return true;
}

export default function AkariBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: AkariBoardProps) {
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
        if (r < rows && c < cols && val >= 0 && val <= 2) {
          grid[r][c] = val as CellValue;
        }
      }
    }
    return grid;
  }, [initialUserValues, rows, cols]);

  const [stateGrid, setStateGrid] = useState<CellValue[][]>(initialStates);
  const completedRef = useRef(false);

  const { lit, conflict } = useMemo(
    () => computeIllumination(canon, stateGrid),
    [canon, stateGrid]
  );

  useEffect(() => {
    const values: Record<string, number> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isBlack(cells[r][c])) continue;
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
    if (validateSolution(canon, stateGrid)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [stateGrid, canon, onComplete]);

  const cycleCell = useCallback(
    (r: number, c: number, forward: boolean) => {
      if (readonly) return;
      if (isBlack(cells[r][c])) return;
      setStateGrid((prev) => {
        const next = prev.map((row) => [...row]);
        const cur = prev[r][c];
        // forward:  0 -> 1 -> 2 -> 0   (empty -> bulb -> dot -> empty)
        // backward: 0 -> 2 -> 1 -> 0
        next[r][c] = (
          forward ? ((cur + 1) % 3) : ((cur + 2) % 3)
        ) as CellValue;
        return next;
      });
    },
    [readonly, cells]
  );

  const elements: JSX.Element[] = [];

  // Cell backgrounds
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PAD + c * CELL_SIZE;
      const y = PAD + r * CELL_SIZE;
      const cellVal = cells[r][c];
      if (isBlack(cellVal)) {
        // Black cell (wall)
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
        // White cell background — tint if illuminated
        elements.push(
          <rect
            key={`bg-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={lit[r][c] ? "#fff6c2" : "white"}
          />
        );
        const state = stateGrid[r][c];
        if (state === 1) {
          // Bulb (red if it illuminates another bulb, when live validation is on)
          const showConflict = liveValidate && conflict[r][c];
          elements.push(
            <circle
              key={`bulb-${r}-${c}`}
              cx={x + CELL_SIZE / 2}
              cy={y + CELL_SIZE / 2}
              r={CELL_SIZE * 0.3}
              fill={showConflict ? "#e02424" : "#f5b301"}
              stroke={showConflict ? "#7a0000" : "#8a6400"}
              strokeWidth={1.5}
              pointerEvents="none"
            />
          );
        } else if (state === 2) {
          // Dot / no-bulb mark
          elements.push(
            <circle
              key={`dot-${r}-${c}`}
              cx={x + CELL_SIZE / 2}
              cy={y + CELL_SIZE / 2}
              r={3.5}
              fill="#888"
              pointerEvents="none"
            />
          );
        }
      }
    }
  }

  // Grid lines (solid)
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
        strokeWidth={isBorder ? 2 : 0.75}
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
        strokeWidth={isBorder ? 2 : 0.75}
      />
    );
  }

  // Click targets (left-click forward, right-click backward)
  const targets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isBlack(cells[r][c])) continue;
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
            onClick={() => cycleCell(r, c, true)}
            onContextMenu={(e) => {
              e.preventDefault();
              cycleCell(r, c, false);
            }}
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
    </div>
  );
}
