import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { KakuroCanon, KakuroCell } from "../types/canon";

interface KakuroBoardProps {
  canon: KakuroCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
}

const CELL_SIZE = 40;
const PAD = 12;

function getRuns(cells: KakuroCell[][]): {
  row: number;
  col: number;
  length: number;
  sum: number;
  direction: "h" | "v";
}[] {
  const rows = cells.length;
  const cols = cells[0].length;
  const runs: {
    row: number;
    col: number;
    length: number;
    sum: number;
    direction: "h" | "v";
  }[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      if (cell.type !== "clue") continue;
      if (cell.right != null) {
        let len = 0;
        for (let cc = c + 1; cc < cols && cells[r][cc].type === "empty"; cc++) {
          len++;
        }
        if (len > 0) {
          runs.push({ row: r, col: c + 1, length: len, sum: cell.right, direction: "h" });
        }
      }
      if (cell.down != null) {
        let len = 0;
        for (let rr = r + 1; rr < rows && cells[rr][c].type === "empty"; rr++) {
          len++;
        }
        if (len > 0) {
          runs.push({ row: r + 1, col: c, length: len, sum: cell.down, direction: "v" });
        }
      }
    }
  }
  return runs;
}

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

function getErrors(
  canon: KakuroCanon,
  values: Record<string, number>
): Set<string> {
  const errors = new Set<string>();
  const runs = getRuns(canon.cells);

  for (const run of runs) {
    const digits: { val: number; key: string }[] = [];
    for (let i = 0; i < run.length; i++) {
      const r = run.direction === "h" ? run.row : run.row + i;
      const c = run.direction === "h" ? run.col + i : run.col;
      const key = `${c},${r}`;
      const val = values[key];
      if (val != null) {
        digits.push({ val, key });
      }
    }

    // Check duplicates
    const seen = new Map<number, string[]>();
    for (const d of digits) {
      const arr = seen.get(d.val) || [];
      arr.push(d.key);
      seen.set(d.val, arr);
    }
    for (const [, keys] of seen) {
      if (keys.length > 1) {
        keys.forEach((k) => errors.add(k));
      }
    }

    // Check sum if run is fully filled
    if (digits.length === run.length) {
      const sum = digits.reduce((a, b) => a + b.val, 0);
      if (sum !== run.sum) {
        digits.forEach((d) => errors.add(d.key));
      }
    }
  }
  return errors;
}

export default function KakuroBoard({
  canon,
  initialUserValues,
  onValuesChange,
  onComplete,
  readonly,
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

  const errors = useMemo(() => getErrors(canon, values), [canon, values]);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (readonly) return;
      const key = `${c},${r}`;
      setSelectedCell((prev) => (prev === key ? null : key));
    },
    [readonly]
  );

  const handleNumpad = useCallback(
    (digit: number) => {
      if (!selectedCell) return;
      setValues((prev) => {
        const next = { ...prev };
        if (prev[selectedCell] === digit) {
          delete next[selectedCell];
        } else {
          next[selectedCell] = digit;
        }
        return next;
      });
    },
    [selectedCell]
  );

  const handleClear = useCallback(() => {
    if (!selectedCell) return;
    setValues((prev) => {
      const next = { ...prev };
      delete next[selectedCell];
      return next;
    });
  }, [selectedCell]);

  // Keyboard support
  useEffect(() => {
    if (readonly || !selectedCell) return;
    const handler = (e: KeyboardEvent) => {
      const digit = parseInt(e.key);
      if (digit >= 1 && digit <= 9) {
        handleNumpad(digit);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        handleClear();
      } else if (e.key === "Escape") {
        setSelectedCell(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [readonly, selectedCell, handleNumpad, handleClear]);

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
              fill="white"
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
              fill="white"
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
        <svg
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          {elements}
          {targets}
        </svg>
      </div>
      {!readonly && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <button
              key={d}
              onClick={() => handleNumpad(d)}
              disabled={!selectedCell}
              style={{
                width: 36,
                height: 36,
                fontSize: 16,
                fontWeight: "bold",
                border: "2px solid #999",
                borderRadius: 4,
                background: selectedCell && values[selectedCell] === d ? "#cde" : "#fff",
                cursor: selectedCell ? "pointer" : "default",
                opacity: selectedCell ? 1 : 0.5,
              }}
            >
              {d}
            </button>
          ))}
          <button
            onClick={handleClear}
            disabled={!selectedCell}
            style={{
              width: 36,
              height: 36,
              fontSize: 14,
              border: "2px solid #999",
              borderRadius: 4,
              background: "#fff",
              cursor: selectedCell ? "pointer" : "default",
              opacity: selectedCell ? 1 : 0.5,
            }}
            title="Clear"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
