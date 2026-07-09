import { useState, useMemo, useCallback, useEffect } from "react";
import { SudokuCanon } from "../types/canon";

interface SudokuEditorProps {
  initialJson: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 40;
const PAD = 12;
const THIN = 1;
const MEDIUM = 2;
const THICK = 3;

function parseCanon(json: string): SudokuCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.hints && Array.isArray(parsed.hints)) {
      return parsed as SudokuCanon;
    }
  } catch {}
  return null;
}

function emptyHints(): number[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0));
}

export default function SudokuEditor({ initialJson, onComplete, onCancel }: SudokuEditorProps) {
  const [jsonText, setJsonText] = useState(() => {
    if (!initialJson.trim()) {
      return JSON.stringify({ hints: emptyHints() }, null, 2);
    }
    return initialJson;
  });
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  const [activeCell, setActiveCell] = useState<string | null>(null);

  const updateJson = useCallback((newCanon: SudokuCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      setActiveCell(`${col},${row}`);
    },
    []
  );

  const enterValue = useCallback(
    (digit: number) => {
      if (!activeCell || !canon) return;
      const [col, row] = activeCell.split(",").map(Number);
      const newHints = canon.hints.map((r) => [...r]);
      newHints[row][col] = digit;
      updateJson({ ...canon, hints: newHints });
      setActiveCell(null);
    },
    [activeCell, canon, updateJson]
  );

  const clearValue = useCallback(() => {
    if (!activeCell || !canon) return;
    const [col, row] = activeCell.split(",").map(Number);
    const newHints = canon.hints.map((r) => [...r]);
    newHints[row][col] = 0;
    updateJson({ ...canon, hints: newHints });
    setActiveCell(null);
  }, [activeCell, canon, updateJson]);

  useEffect(() => {
    if (!activeCell) return;
    function handleKey(e: KeyboardEvent) {
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) {
        enterValue(digit);
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        clearValue();
      } else if (e.key === "Escape") {
        setActiveCell(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeCell, enterValue, clearValue]);

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid sudoku JSON. Fix the textarea below, then the board will appear.
        </p>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  const svgWidth = 9 * CELL_SIZE + PAD * 2;
  const svgHeight = 9 * CELL_SIZE + PAD * 2;

  const gridLines: JSX.Element[] = [];
  for (let i = 0; i <= 9; i++) {
    const isBorder = i === 0 || i === 9;
    const isBox = i % 3 === 0 && !isBorder;
    const strokeWidth = isBorder ? THICK : isBox ? MEDIUM : THIN;
    gridLines.push(
      <line
        key={`h-${i}`}
        x1={0}
        y1={i * CELL_SIZE}
        x2={9 * CELL_SIZE}
        y2={i * CELL_SIZE}
        stroke="black"
        strokeWidth={strokeWidth}
      />
    );
    gridLines.push(
      <line
        key={`v-${i}`}
        x1={i * CELL_SIZE}
        y1={0}
        x2={i * CELL_SIZE}
        y2={9 * CELL_SIZE}
        stroke="black"
        strokeWidth={strokeWidth}
      />
    );
  }

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: "0.75rem" }}>
        Click a cell then type 1–9 to set a hint, or Backspace/0 to clear.
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg
            width={Math.min(svgWidth, 500)}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
          >
            <g transform={`translate(${PAD},${PAD})`}>
              {/* Active cell highlight */}
              {activeCell && (() => {
                const [col, row] = activeCell.split(",").map(Number);
                return (
                  <rect
                    x={col * CELL_SIZE + 1}
                    y={row * CELL_SIZE + 1}
                    width={CELL_SIZE - 2}
                    height={CELL_SIZE - 2}
                    fill="#bbdefb"
                    fillOpacity={0.6}
                  />
                );
              })()}

              {gridLines}

              {/* Hint values */}
              {canon.hints.map((row, rowIdx) =>
                row.map((val, colIdx) => {
                  if (val <= 0) return null;
                  return (
                    <text
                      key={`hint-${rowIdx}-${colIdx}`}
                      x={colIdx * CELL_SIZE + CELL_SIZE / 2}
                      y={rowIdx * CELL_SIZE + CELL_SIZE / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={20}
                      fontFamily="sans-serif"
                      fill="black"
                      pointerEvents="none"
                    >
                      {val}
                    </text>
                  );
                })
              )}

              {/* Click targets */}
              {Array.from({ length: 81 }, (_, i) => {
                const col = i % 9;
                const row = Math.floor(i / 9);
                return (
                  <rect
                    key={`click-${col}-${row}`}
                    x={col * CELL_SIZE}
                    y={row * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleCellClick(row, col)}
                  />
                );
              })}
            </g>
          </svg>
        </div>

        {/* JSON textarea */}
        <div style={{ flex: 1, minWidth: 250, display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
            Canon JSON (source of truth)
          </label>
          <textarea
            style={{
              flex: 1,
              minHeight: 300,
              fontFamily: "monospace",
              fontSize: "0.75rem",
              padding: "0.5rem",
              border: "1px solid #ccc",
              borderRadius: 4,
              resize: "vertical",
            }}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => onComplete(jsonText)}
          style={{ padding: "0.5rem 1.25rem", background: "#4a90d9", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}
        >
          Complete
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "0.5rem 1rem", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
