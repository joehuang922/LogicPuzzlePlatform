import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { FillominoCanon } from "../types/canon";
import BoardViewport from "./BoardViewport";

interface FillominoBoardProps {
  canon: FillominoCanon;
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

function validateSolution(
  canon: FillominoCanon,
  cellValues: Record<string, number>,
  hEdges: number[][],
  vEdges: number[][]
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // All cells must have a value
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const clue = canon.cells[r][c];
      if (clue > 0) continue;
      if (cellValues[`c:${c},${r}`] == null) return false;
    }
  }

  // At least one edge must exist
  const hasEdge =
    hEdges.some((row) => row.some((v) => v === 1)) ||
    vEdges.some((row) => row.some((v) => v === 1));
  if (!hasEdge) return false;

  const roomIds = computeRooms(rows, cols, hEdges, vEdges);

  // Group cells by room
  const roomCells: Map<number, [number, number][]> = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const rid = roomIds[r][c];
      if (!roomCells.has(rid)) roomCells.set(rid, []);
      roomCells.get(rid)!.push([r, c]);
    }
  }

  // Get cell value (clue or player-entered)
  const getVal = (r: number, c: number): number | undefined => {
    const clue = canon.cells[r][c];
    if (clue > 0) return clue;
    return cellValues[`c:${c},${r}`];
  };

  // Each room: all cells same number N = room size
  const roomNumbers: Map<number, number> = new Map();
  for (const [rid, cells] of roomCells) {
    const size = cells.length;
    for (const [r, c] of cells) {
      const val = getVal(r, c);
      if (val == null || val !== size) return false;
    }
    roomNumbers.set(rid, size);
  }

  // No two adjacent rooms with same number
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (hEdges[r][c] === 1) {
        const rid1 = roomIds[r][c];
        const rid2 = roomIds[r + 1][c];
        if (rid1 !== rid2 && roomNumbers.get(rid1) === roomNumbers.get(rid2)) return false;
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (vEdges[r][c] === 1) {
        const rid1 = roomIds[r][c];
        const rid2 = roomIds[r][c + 1];
        if (rid1 !== rid2 && roomNumbers.get(rid1) === roomNumbers.get(rid2)) return false;
      }
    }
  }

  return true;
}

export default function FillominoBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
}: FillominoBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const emptyH = () => Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  const emptyV = () => Array.from({ length: rows }, () => Array(cols - 1).fill(0));

  // Parse initial user values into cell values and edges
  const initialState = useMemo(() => {
    const cv: Record<string, number> = {};
    const h = emptyH();
    const v = emptyV();
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        if (key.startsWith("c:")) {
          cv[key] = val;
        } else if (key.startsWith("h:")) {
          const [rStr, cStr] = key.slice(2).split(",");
          const r = parseInt(rStr);
          const c = parseInt(cStr);
          if (r >= 0 && r < rows - 1 && c >= 0 && c < cols) h[r][c] = val;
        } else if (key.startsWith("v:")) {
          const [rStr, cStr] = key.slice(2).split(",");
          const r = parseInt(rStr);
          const c = parseInt(cStr);
          if (r >= 0 && r < rows && c >= 0 && c < cols - 1) v[r][c] = val;
        }
      }
    }
    return { cv, h, v };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cellValues, setCellValues] = useState<Record<string, number>>(initialState.cv);
  const [hEdges, setHEdges] = useState<number[][]>(initialState.h);
  const [vEdges, setVEdges] = useState<number[][]>(initialState.v);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [inputBuffer, setInputBuffer] = useState<string>("");
  const completedRef = useRef(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Serialize state to flat user values
  const serializeValues = useCallback((): Record<string, number> => {
    const result: Record<string, number> = { ...cellValues };
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        if (hEdges[r][c] === 1) result[`h:${r},${c}`] = 1;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (vEdges[r][c] === 1) result[`v:${r},${c}`] = 1;
      }
    }
    return result;
  }, [cellValues, hEdges, vEdges, rows, cols]);

  useEffect(() => {
    onValuesChange?.(serializeValues());
  }, [serializeValues, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSolution(canon, cellValues, hEdges, vEdges)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [cellValues, hEdges, vEdges, canon, onComplete]);

  // Commit input buffer to cell
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
      const key = `c:${c},${r}`;
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

  // Move the selection one step in a direction, skipping clue cells.
  const moveSelection = useCallback(
    (dr: number, dc: number) => {
      if (!selectedCell) return;
      const [, cur] = selectedCell.split(":");
      const [cStr, rStr] = cur.split(",");
      let c = parseInt(cStr);
      let r = parseInt(rStr);
      // Step until we land on an editable cell or run off the board.
      while (true) {
        r += dr;
        c += dc;
        if (r < 0 || r >= rows || c < 0 || c >= cols) return;
        if (cells[r][c] === 0) {
          setSelectedCell(`c:${c},${r}`);
          setInputBuffer("");
          return;
        }
      }
    },
    [selectedCell, rows, cols, cells]
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
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveSelection(-1, 0);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(1, 0);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveSelection(0, -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveSelection(0, 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [readonly, selectedCell, handleDigitInput, handleClear, moveSelection]);

  // Hidden input for mobile numeric keyboard
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

  const handleHEdgeClick = useCallback(
    (r: number, c: number) => {
      if (readonly) return;
      setHEdges((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 0 ? 1 : 0;
        return next;
      });
    },
    [readonly]
  );

  const handleVEdgeClick = useCallback(
    (r: number, c: number) => {
      if (readonly) return;
      setVEdges((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = next[r][c] === 0 ? 1 : 0;
        return next;
      });
    },
    [readonly]
  );

  const elements: JSX.Element[] = [];

  // Cell backgrounds
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL_SIZE;
      const y = r * CELL_SIZE;
      const key = `c:${c},${r}`;
      const isSelected = selectedCell === key;
      elements.push(
        <rect
          key={`bg-${r}-${c}`}
          x={x}
          y={y}
          width={CELL_SIZE}
          height={CELL_SIZE}
          fill={isSelected ? "#e0e8ff" : "white"}
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
      const key = `c:${c},${r}`;

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

  // Grid lines
  const gridLines: JSX.Element[] = [];

  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      const isThick = isBorder || (r > 0 && r < rows && hEdges[r - 1][c] === 1);
      gridLines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={(c + 1) * CELL_SIZE}
          y2={r * CELL_SIZE}
          stroke="black"
          strokeWidth={isThick ? THICK : THIN}
          strokeDasharray={isThick ? undefined : "3,3"}
        />
      );
    }
  }

  // Vertical lines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick = isBorder || (c > 0 && c < cols && vEdges[r][c - 1] === 1);
      gridLines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={c * CELL_SIZE}
          y2={(r + 1) * CELL_SIZE}
          stroke="black"
          strokeWidth={isThick ? THICK : THIN}
          strokeDasharray={isThick ? undefined : "3,3"}
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

  // Edge click targets
  const edgeTargets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_SIZE;
        const y = (r + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
        edgeTargets.push(
          <rect
            key={`he-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={EDGE_HIT_WIDTH}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => handleHEdgeClick(r, c)}
          />
        );
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const x = (c + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
        const y = r * CELL_SIZE;
        edgeTargets.push(
          <rect
            key={`ve-${r}-${c}`}
            x={x}
            y={y}
            width={EDGE_HIT_WIDTH}
            height={CELL_SIZE}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onClick={() => handleVEdgeClick(r, c)}
          />
        );
      }
    }
  }

  // Keep the selected cell scrolled into view during keyboard navigation.
  let focusPoint: { x: number; y: number } | null = null;
  if (selectedCell) {
    const [cStr, rStr] = selectedCell.slice(2).split(",");
    const c = parseInt(cStr);
    const r = parseInt(rStr);
    focusPoint = {
      x: PAD + c * CELL_SIZE + CELL_SIZE / 2,
      y: PAD + r * CELL_SIZE + CELL_SIZE / 2,
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
      <BoardViewport width={svgWidth} height={svgHeight} cellSize={CELL_SIZE} focusPoint={focusPoint}>
        <g transform={`translate(${PAD},${PAD})`}>
          {elements}
          {gridLines}
          {targets}
          {edgeTargets}
        </g>
      </BoardViewport>
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
