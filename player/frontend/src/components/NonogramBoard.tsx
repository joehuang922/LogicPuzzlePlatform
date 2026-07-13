import { useState, useEffect, useCallback, useRef } from "react";
import { NonogramCanon, NonogramAnswer } from "../types/canon";

interface NonogramBoardProps {
  canon: NonogramCanon;
  initialAnswer?: NonogramAnswer | null;
  onAnswerChange?: (answer: NonogramAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 28;
const PAD = 8;

type CellState = 0 | 1 | 2; // 0=unset, 1=filled, 2=crossed
type DrawMode = "fill" | "cross";

function validateSolution(
  rowClues: number[][],
  colClues: number[][],
  cells: CellState[][]
): boolean {
  const rows = rowClues.length;
  const cols = colClues.length;

  function getGroups(line: CellState[]): number[] {
    const groups: number[] = [];
    let count = 0;
    for (const cell of line) {
      if (cell === 1) {
        count++;
      } else {
        if (count > 0) groups.push(count);
        count = 0;
      }
    }
    if (count > 0) groups.push(count);
    return groups.length === 0 ? [0] : groups;
  }

  function cluesMatch(actual: number[], expected: number[]): boolean {
    if (actual.length !== expected.length) return false;
    return actual.every((v, i) => v === expected[i]);
  }

  for (let r = 0; r < rows; r++) {
    if (!cluesMatch(getGroups(cells[r]), rowClues[r])) return false;
  }

  for (let c = 0; c < cols; c++) {
    const col: CellState[] = [];
    for (let r = 0; r < rows; r++) {
      col.push(cells[r][c]);
    }
    if (!cluesMatch(getGroups(col), colClues[c])) return false;
  }

  return true;
}

function isRowSatisfied(rowClue: number[], row: CellState[]): boolean {
  const groups: number[] = [];
  let count = 0;
  for (const cell of row) {
    if (cell === 1) {
      count++;
    } else {
      if (count > 0) groups.push(count);
      count = 0;
    }
  }
  if (count > 0) groups.push(count);
  const actual = groups.length === 0 ? [0] : groups;
  if (actual.length !== rowClue.length) return false;
  return actual.every((v, i) => v === rowClue[i]);
}

function isColSatisfied(colClue: number[], cells: CellState[][], c: number): boolean {
  const col: CellState[] = [];
  for (let r = 0; r < cells.length; r++) {
    col.push(cells[r][c]);
  }
  return isRowSatisfied(colClue, col);
}

export default function NonogramBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
}: NonogramBoardProps) {
  const { rowClues, colClues } = canon;
  const rows = rowClues.length;
  const cols = colClues.length;

  const maxRowClueLen = Math.max(...rowClues.map((c) => c.length));
  const maxColClueLen = Math.max(...colClues.map((c) => c.length));

  const emptyCells = (): CellState[][] =>
    Array.from({ length: rows }, () => Array(cols).fill(0));

  const [cells, setCells] = useState<CellState[][]>(
    () => (initialAnswer?.cells as CellState[][]) ?? emptyCells()
  );
  const [drawMode, setDrawMode] = useState<DrawMode>("fill");
  const [isDragging, setIsDragging] = useState(false);
  const dragTargetState = useRef<CellState>(1);
  const completedRef = useRef(false);

  useEffect(() => {
    const answer: NonogramAnswer = { cells };
    onAnswerChange?.(answer);
  }, [cells, onAnswerChange]);

  useEffect(() => {
    if (completedRef.current) return;
    const hasAny = cells.some((row) => row.some((v) => v === 1));
    if (!hasAny) return;
    if (validateSolution(rowClues, colClues, cells)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [cells, rowClues, colClues, onComplete]);

  const applyToCell = useCallback(
    (r: number, c: number, isRightButton: boolean) => {
      if (readonly) return;
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        let targetState: CellState;
        if (drawMode === "cross") {
          targetState = 2;
        } else {
          targetState = isRightButton ? 2 : 1;
        }
        if (next[r][c] === targetState) {
          next[r][c] = 0;
        } else {
          next[r][c] = targetState;
        }
        return next;
      });
    },
    [readonly, drawMode]
  );

  const startDrag = useCallback(
    (r: number, c: number, isRightButton: boolean) => {
      if (readonly) return;
      setIsDragging(true);
      let targetState: CellState;
      if (drawMode === "cross") {
        targetState = 2;
      } else {
        targetState = isRightButton ? 2 : 1;
      }
      dragTargetState.current = targetState;
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        if (next[r][c] === targetState) {
          next[r][c] = 0;
          dragTargetState.current = 0;
        } else {
          next[r][c] = targetState;
        }
        return next;
      });
    },
    [readonly, drawMode]
  );

  const continueDrag = useCallback(
    (r: number, c: number) => {
      if (!isDragging || readonly) return;
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = dragTargetState.current;
        return next;
      });
    },
    [isDragging, readonly]
  );

  const endDrag = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleMouseUp = () => endDrag();
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [endDrag]);

  const clueAreaWidth = maxRowClueLen * CELL_SIZE;
  const clueAreaHeight = maxColClueLen * CELL_SIZE;
  const gridWidth = cols * CELL_SIZE;
  const gridHeight = rows * CELL_SIZE;
  const svgWidth = clueAreaWidth + gridWidth + PAD * 2;
  const svgHeight = clueAreaHeight + gridHeight + PAD * 2;

  const gridX = PAD + clueAreaWidth;
  const gridY = PAD + clueAreaHeight;

  const elements: JSX.Element[] = [];

  // Column clues
  for (let c = 0; c < cols; c++) {
    const clue = colClues[c];
    const satisfied = isColSatisfied(colClues[c], cells, c);
    for (let i = 0; i < clue.length; i++) {
      const x = gridX + c * CELL_SIZE + CELL_SIZE / 2;
      const y = gridY - (clue.length - i) * CELL_SIZE + CELL_SIZE / 2;
      elements.push(
        <text
          key={`cc-${c}-${i}`}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={CELL_SIZE * 0.45}
          fontFamily="sans-serif"
          fontWeight="bold"
          fill={satisfied ? "#aaa" : "#333"}
        >
          {clue[i]}
        </text>
      );
    }
  }

  // Row clues
  for (let r = 0; r < rows; r++) {
    const clue = rowClues[r];
    const satisfied = isRowSatisfied(rowClues[r], cells[r]);
    for (let i = 0; i < clue.length; i++) {
      const x = gridX - (clue.length - i) * CELL_SIZE + CELL_SIZE / 2;
      const y = gridY + r * CELL_SIZE + CELL_SIZE / 2;
      elements.push(
        <text
          key={`rc-${r}-${i}`}
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={CELL_SIZE * 0.45}
          fontFamily="sans-serif"
          fontWeight="bold"
          fill={satisfied ? "#aaa" : "#333"}
        >
          {clue[i]}
        </text>
      );
    }
  }

  // Grid lines
  for (let r = 0; r <= rows; r++) {
    elements.push(
      <line
        key={`hg-${r}`}
        x1={gridX}
        y1={gridY + r * CELL_SIZE}
        x2={gridX + gridWidth}
        y2={gridY + r * CELL_SIZE}
        stroke={r % 5 === 0 ? "#333" : "#bbb"}
        strokeWidth={r % 5 === 0 ? 1.5 : 0.5}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    elements.push(
      <line
        key={`vg-${c}`}
        x1={gridX + c * CELL_SIZE}
        y1={gridY}
        x2={gridX + c * CELL_SIZE}
        y2={gridY + gridHeight}
        stroke={c % 5 === 0 ? "#333" : "#bbb"}
        strokeWidth={c % 5 === 0 ? 1.5 : 0.5}
      />
    );
  }

  // Cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gridX + c * CELL_SIZE;
      const y = gridY + r * CELL_SIZE;
      if (cells[r][c] === 1) {
        elements.push(
          <rect
            key={`cf-${r}-${c}`}
            x={x + 1}
            y={y + 1}
            width={CELL_SIZE - 2}
            height={CELL_SIZE - 2}
            fill="#222"
          />
        );
      } else if (cells[r][c] === 2) {
        const cx = x + CELL_SIZE / 2;
        const cy = y + CELL_SIZE / 2;
        const s = CELL_SIZE * 0.25;
        elements.push(
          <g key={`cx-${r}-${c}`}>
            <line x1={cx - s} y1={cy - s} x2={cx + s} y2={cy + s} stroke="#999" strokeWidth={1.5} />
            <line x1={cx + s} y1={cy - s} x2={cx - s} y2={cy + s} stroke="#999" strokeWidth={1.5} />
          </g>
        );
      }
    }
  }

  // Interaction targets
  const targets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = gridX + c * CELL_SIZE;
        const y = gridY + r * CELL_SIZE;
        targets.push(
          <rect
            key={`t-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseDown={(e) => {
              e.preventDefault();
              startDrag(r, c, e.button === 2);
            }}
            onMouseEnter={() => continueDrag(r, c)}
            onContextMenu={(e) => e.preventDefault()}
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
          onContextMenu={(e) => e.preventDefault()}
        >
          {elements}
          {targets}
        </svg>
      </div>
      {!readonly && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setDrawMode("fill")}
            style={{
              width: 36,
              height: 36,
              background: drawMode === "fill" ? "#222" : "#ddd",
              border: drawMode === "fill" ? "3px solid #0066ff" : "2px solid #999",
              borderRadius: 4,
              cursor: "pointer",
            }}
            title="Fill mode (left-drag: fill, right-drag: cross)"
          />
          <button
            onClick={() => setDrawMode("cross")}
            style={{
              width: 36,
              height: 36,
              background: "#fff",
              border: drawMode === "cross" ? "3px solid #0066ff" : "2px solid #999",
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: "bold",
              color: "#999",
            }}
            title="Cross mode (all drag marks crossed)"
          >
            X
          </button>
        </div>
      )}
    </div>
  );
}
