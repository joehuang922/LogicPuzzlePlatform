import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { RippleEffectCanon } from "../types/canon";

interface RippleEffectBoardProps {
  canon: RippleEffectCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 40;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

// Connected components of cells once thick borders are treated as walls.
function computeRooms(
  rows: number,
  cols: number,
  hEdges: number[][],
  vEdges: number[][]
): number[][] {
  const roomIds: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let nextId = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (roomIds[r][c] >= 0) continue;
      const id = nextId++;
      const queue: [number, number][] = [[r, c]];
      roomIds[r][c] = id;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        if (cr > 0 && roomIds[cr - 1][cc] < 0 && hEdges[cr - 1][cc] === 0) {
          roomIds[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && roomIds[cr + 1][cc] < 0 && hEdges[cr][cc] === 0) {
          roomIds[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        if (cc > 0 && roomIds[cr][cc - 1] < 0 && vEdges[cr][cc - 1] === 0) {
          roomIds[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && roomIds[cr][cc + 1] < 0 && vEdges[cr][cc] === 0) {
          roomIds[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return roomIds;
}

// Cell value: clue if present, else the player-entered value (or undefined).
function cellVal(
  canon: RippleEffectCanon,
  cellValues: Record<string, number>,
  r: number,
  c: number
): number | undefined {
  const clue = canon.cells[r][c];
  if (clue > 0) return clue;
  return cellValues[`${c},${r}`];
}

function validateSolution(
  canon: RippleEffectCanon,
  cellValues: Record<string, number>,
  roomIds: number[][]
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // Grid must be fully filled.
  const grid: number[][] = [];
  for (let r = 0; r < rows; r++) {
    grid.push([]);
    for (let c = 0; c < cols; c++) {
      const v = cellVal(canon, cellValues, r, c);
      if (v == null || v <= 0) return false;
      grid[r].push(v);
    }
  }

  // Each room of size N must contain exactly {1..N}.
  const roomCells: Map<number, [number, number][]> = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rid = roomIds[r][c];
      if (!roomCells.has(rid)) roomCells.set(rid, []);
      roomCells.get(rid)!.push([r, c]);
    }
  }
  for (const [, cellsInRoom] of roomCells) {
    const size = cellsInRoom.length;
    const seen = new Set<number>();
    for (const [r, c] of cellsInRoom) {
      const v = grid[r][c];
      if (v < 1 || v > size || seen.has(v)) return false;
      seen.add(v);
    }
    // seen has exactly `size` distinct values in 1..size => it is {1..size}
  }

  // Ripple: equal values K in a row/column must be >= K+1 cells apart.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = grid[r][c];
      // look ahead within k cells to the right
      for (let d = 1; d <= k && c + d < cols; d++) {
        if (grid[r][c + d] === k) return false;
      }
      // look ahead within k cells downward
      for (let d = 1; d <= k && r + d < rows; d++) {
        if (grid[r + d][c] === k) return false;
      }
    }
  }

  return true;
}

export default function RippleEffectBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: RippleEffectBoardProps) {
  const { cells, edges } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  // Room partition is fixed (given in canon).
  const roomIds = useMemo(
    () => computeRooms(rows, cols, edges.h, edges.v),
    [rows, cols, edges.h, edges.v]
  );

  const initialCv = useMemo(() => {
    const cv: Record<string, number> = {};
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        if (/^\d+,\d+$/.test(key)) cv[key] = val;
      }
    }
    return cv;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cellValues, setCellValues] = useState<Record<string, number>>(initialCv);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [inputBuffer, setInputBuffer] = useState<string>("");
  const completedRef = useRef(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onValuesChange?.(cellValues);
  }, [cellValues, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSolution(canon, cellValues, roomIds)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [cellValues, canon, roomIds, onComplete]);

  const commitBuffer = useCallback(
    (buffer: string) => {
      if (!selectedCell) return;
      const num = parseInt(buffer);
      if (num > 0) {
        setCellValues((prev) => ({ ...prev, [selectedCell]: num }));
      }
    },
    [selectedCell]
  );

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (readonly) return;
      if (canon.cells[r][c] > 0) return; // clue cell
      const key = `${c},${r}`;
      setSelectedCell((prev) => (prev === key ? null : key));
      setInputBuffer("");
      setTimeout(() => hiddenInputRef.current?.focus(), 0);
    },
    [readonly, canon.cells]
  );

  const handleClear = useCallback(() => {
    if (!selectedCell) return;
    setCellValues((prev) => {
      const next = { ...prev };
      delete next[selectedCell];
      return next;
    });
    setInputBuffer("");
  }, [selectedCell]);

  const handleDigitInput = useCallback(
    (digit: string) => {
      if (!selectedCell) return;
      if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
      const newBuffer = inputBuffer + digit;
      setInputBuffer(newBuffer);
      const num = parseInt(newBuffer);
      if (num > 0) {
        setCellValues((prev) => ({ ...prev, [selectedCell]: num }));
      }
      bufferTimeoutRef.current = setTimeout(() => {
        setInputBuffer("");
      }, 1000);
    },
    [selectedCell, inputBuffer]
  );

  // Keyboard support
  useEffect(() => {
    if (readonly || !selectedCell) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const digit = e.key;
      if (/^[0-9]$/.test(digit)) {
        e.preventDefault();
        handleDigitInput(digit);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        handleClear();
      } else if (e.key === "Escape") {
        setSelectedCell(null);
        setInputBuffer("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [readonly, selectedCell, handleDigitInput, handleClear]);

  const handleHiddenInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const val = e.currentTarget.value;
      if (!selectedCell) return;
      const num = parseInt(val);
      if (num > 0) {
        setCellValues((prev) => ({ ...prev, [selectedCell]: num }));
      }
      e.currentTarget.value = "";
    },
    [selectedCell]
  );

  const elements: JSX.Element[] = [];

  // Cell backgrounds
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL_SIZE;
      const y = r * CELL_SIZE;
      const key = `${c},${r}`;
      const isSelected = selectedCell === key;
      const isClue = cells[r][c] > 0;
      elements.push(
        <rect
          key={`bg-${r}-${c}`}
          x={x}
          y={y}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={isSelected ? "#e0e8ff" : isClue ? "#f1f1f1" : "white"}
        />
      );
    }
  }

  // Numbers (clues and player-entered)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL_SIZE + CELL_SIZE / 2;
      const y = r * CELL_SIZE + CELL_SIZE / 2;
      const clue = cells[r][c];
      const key = `${c},${r}`;

      if (clue > 0) {
        elements.push(
          <text
            key={`num-${r}-${c}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={CELL_SIZE * 0.45}
            fontFamily="sans-serif"
            fontWeight="bold"
            fill="#111"
            pointerEvents="none"
          >
            {clue}
          </text>
        );
      } else if (cellValues[key] != null) {
        elements.push(
          <text
            key={`num-${r}-${c}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={CELL_SIZE * 0.45}
            fontFamily="sans-serif"
            fill="#2563eb"
            pointerEvents="none"
          >
            {cellValues[key]}
          </text>
        );
      }
    }
  }

  // Grid lines — thin interior, thick room borders + perimeter
  const gridLines: JSX.Element[] = [];

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      const isThick = isBorder || (r > 0 && r < rows && edges.h[r - 1][c] === 1);
      gridLines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={(c + 1) * CELL_SIZE}
          y2={r * CELL_SIZE}
          stroke={isThick ? "black" : "#bbb"}
          strokeWidth={isThick ? THICK : THIN}
        />
      );
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick = isBorder || (c > 0 && c < cols && edges.v[r][c - 1] === 1);
      gridLines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={c * CELL_SIZE}
          y2={(r + 1) * CELL_SIZE}
          stroke={isThick ? "black" : "#bbb"}
          strokeWidth={isThick ? THICK : THIN}
        />
      );
    }
  }

  // Click targets for cells
  const targets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c] > 0) continue; // clue cells not clickable
        const x = c * CELL_SIZE + EDGE_HIT_WIDTH / 2;
        const y = r * CELL_SIZE + EDGE_HIT_WIDTH / 2;
        targets.push(
          <rect
            key={`click-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE - EDGE_HIT_WIDTH}
            height={CELL_SIZE - EDGE_HIT_WIDTH}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => handleCellClick(r, c)}
          />
        );
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {elements}
            {gridLines}
            {targets}
          </g>
        </svg>
      </div>
      {!readonly && (
        <input
          ref={hiddenInputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          style={{
            position: "absolute",
            opacity: 0,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
          onInput={handleHiddenInput}
          onBlur={() => {
            if (inputBuffer) {
              commitBuffer(inputBuffer);
              setInputBuffer("");
            }
          }}
        />
      )}
    </div>
  );
}
