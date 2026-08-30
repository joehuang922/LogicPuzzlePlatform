import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { KakuroCanon } from "../types/canon";
import { getRuns, analyzeKakuro } from "../liveValidators/kakuro";
import RadialInput from "./RadialInput";

interface KakuroBoardProps {
  canon: KakuroCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

const CELL_SIZE = 40;
const PAD = 12;

function validateSolution(
  canon: KakuroCanon,
  values: Record<string, number>
): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0].length;

  // Check all empty cells are filled
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c].type === "empty" && values[`${c},${r}`] == null) {
        return false;
      }
    }
  }

  const runs = getRuns(canon.cells);
  for (const run of runs) {
    const digits: number[] = [];
    for (let i = 0; i < run.length; i++) {
      const r = run.direction === "h" ? run.row : run.row + i;
      const c = run.direction === "h" ? run.col + i : run.col;
      const val = values[`${c},${r}`];
      if (val == null) return false;
      digits.push(val);
    }
    // Check sum
    const sum = digits.reduce((a, b) => a + b, 0);
    if (sum !== run.sum) return false;
    // Check uniqueness
    if (new Set(digits).size !== digits.length) return false;
  }
  return true;
}

export default function KakuroBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
  liveValidate,
}: KakuroBoardProps) {
  const { cells } = canon;
  const rows = cells.length;
  const cols = cells[0].length;
  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  const initialValues = useMemo(() => {
    const v: Record<string, number> = {};
    if (initialUserValues) {
      for (const [key, val] of Object.entries(initialUserValues)) {
        if (val >= 1 && val <= 9) v[key] = val;
      }
    }
    return v;
  }, [initialUserValues]);

  const [values, setValues] = useState<Record<string, number>>(initialValues);
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    onValuesChange?.(values);
  }, [values, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;
    if (validateSolution(canon, values)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [values, canon, onComplete]);

  // Live-validation annotations, only computed when the toggle is on:
  //   cellErrors — empty cells whose value participates in a sum/duplicate violation.
  //   clueErrors — clue hints ("c,r:right" / "c,r:down") whose sum is violated.
  const { errors, clueErrors } = useMemo(() => {
    if (!liveValidate) return { errors: new Set<string>(), clueErrors: new Set<string>() };
    const a = analyzeKakuro(canon, values);
    return { errors: a.cellErrors, clueErrors: a.clueErrors };
  }, [canon, values, liveValidate]);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (readonly) return;
      const key = `${c},${r}`;
      setSelectedCell((prev) => (prev === key ? null : key));
    },
    [readonly]
  );

  // Entering a value (via dial or keyboard) also dismisses the picker, matching
  // the Sudoku boards' radial-input UX.
  const enterValue = useCallback(
    (digit: number) => {
      if (!selectedCell) return;
      setValues((prev) => ({ ...prev, [selectedCell]: digit }));
      setSelectedCell(null);
    },
    [selectedCell]
  );

  const clearValue = useCallback(() => {
    if (!selectedCell) return;
    setValues((prev) => {
      const next = { ...prev };
      delete next[selectedCell];
      return next;
    });
    setSelectedCell(null);
  }, [selectedCell]);

  // Keyboard support
  useEffect(() => {
    if (readonly || !selectedCell) return;
    const handler = (e: KeyboardEvent) => {
      const digit = parseInt(e.key);
      if (digit >= 1 && digit <= 9) {
        enterValue(digit);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        clearValue();
      } else if (e.key === "Escape") {
        setSelectedCell(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [readonly, selectedCell, enterValue, clearValue]);

  const elements: JSX.Element[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = PAD + c * CELL_SIZE;
      const y = PAD + r * CELL_SIZE;
      const cell = cells[r][c];
      const key = `${c},${r}`;

      if (cell.type === "clue") {
        // Dark background
        elements.push(
          <rect key={`bg-${r}-${c}`} x={x} y={y} width={CELL_SIZE} height={CELL_SIZE} fill="#333" />
        );
        // Diagonal line
        elements.push(
          <line
            key={`diag-${r}-${c}`}
            x1={x}
            y1={y}
            x2={x + CELL_SIZE}
            y2={y + CELL_SIZE}
            stroke="#555"
            strokeWidth={1}
          />
        );
        // Right clue (lower-right triangle area)
        if (cell.right != null) {
          elements.push(
            <text
              key={`right-${r}-${c}`}
              x={x + CELL_SIZE * 0.72}
              y={y + CELL_SIZE * 0.35}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={CELL_SIZE * 0.3}
              fontFamily="sans-serif"
              fontWeight="bold"
              fill={clueErrors.has(`${key}:right`) ? "#ff6b6b" : "white"}
              pointerEvents="none"
            >
              {cell.right}
            </text>
          );
        }
        // Down clue (lower-left triangle area)
        if (cell.down != null) {
          elements.push(
            <text
              key={`down-${r}-${c}`}
              x={x + CELL_SIZE * 0.28}
              y={y + CELL_SIZE * 0.7}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={CELL_SIZE * 0.3}
              fontFamily="sans-serif"
              fontWeight="bold"
              fill={clueErrors.has(`${key}:down`) ? "#ff6b6b" : "white"}
              pointerEvents="none"
            >
              {cell.down}
            </text>
          );
        }
      } else {
        // Empty cell
        const isSelected = selectedCell === key;
        const hasError = errors.has(key);
        let fill = "white";
        if (isSelected) fill = "#e0e8ff";
        else if (hasError) fill = "#ffe0e0";

        elements.push(
          <rect key={`bg-${r}-${c}`} x={x} y={y} width={CELL_SIZE} height={CELL_SIZE} fill={fill} />
        );

        const val = values[key];
        if (val != null) {
          elements.push(
            <text
              key={`val-${r}-${c}`}
              x={x + CELL_SIZE / 2}
              y={y + CELL_SIZE / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={CELL_SIZE * 0.5}
              fontFamily="sans-serif"
              fontWeight="bold"
              fill={hasError ? "#c00" : "#222"}
              pointerEvents="none"
            >
              {val}
            </text>
          );
        }
      }
    }
  }

  // Grid lines
  for (let r = 0; r <= rows; r++) {
    elements.push(
      <line
        key={`hline-${r}`}
        x1={PAD}
        y1={PAD + r * CELL_SIZE}
        x2={PAD + cols * CELL_SIZE}
        y2={PAD + r * CELL_SIZE}
        stroke="#333"
        strokeWidth={r === 0 || r === rows ? 2 : 0.5}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    elements.push(
      <line
        key={`vline-${c}`}
        x1={PAD + c * CELL_SIZE}
        y1={PAD}
        x2={PAD + c * CELL_SIZE}
        y2={PAD + rows * CELL_SIZE}
        stroke="#333"
        strokeWidth={c === 0 || c === cols ? 2 : 0.5}
      />
    );
  }

  // Click targets
  const targets: JSX.Element[] = [];
  if (!readonly) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r][c].type !== "empty") continue;
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
            onClick={() => handleCellClick(r, c)}
          />
        );
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        {/* overflow visible so a dial popped at an edge cell isn't clipped */}
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block", overflow: "visible" }}
        >
          {elements}
          {targets}
          {/* Radial digit picker, on both desktop and mobile */}
          {selectedCell && !readonly && (() => {
            const [col, row] = selectedCell.split(",").map(Number);
            return (
              <RadialInput
                cx={PAD + col * CELL_SIZE + CELL_SIZE / 2}
                cy={PAD + row * CELL_SIZE + CELL_SIZE / 2}
                backdrop={{ x: 0, y: 0, width: svgWidth, height: svgHeight }}
                onDigit={enterValue}
                onErase={clearValue}
                onDismiss={() => setSelectedCell(null)}
              />
            );
          })()}
        </svg>
      </div>
    </div>
  );
}
