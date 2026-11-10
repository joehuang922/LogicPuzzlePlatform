import { useState, useMemo, useCallback, useEffect } from "react";
import { SudokuCanon } from "../types/canon";
import { SUDOKU_SIZES, conflictCells, sudokuSize } from "./sudokuRules";
import { useTypedNumber } from "../hooks/useTypedNumber";

interface SudokuEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
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

function emptyHints(n = 9): number[][] {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

export default function SudokuEditor({ initialJson, onChange }: SudokuEditorProps) {
  const [jsonText, setJsonText] = useState(() => {
    if (!initialJson.trim()) {
      return JSON.stringify({ hints: emptyHints() }, null, 2);
    }
    return initialJson;
  });
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const [activeCell, setActiveCell] = useState<string | null>(null);
  const dims = useMemo(() => sudokuSize(canon ?? {}), [canon]);
  const n = dims.size;
  const big = n > 9;

  const updateJson = useCallback((newCanon: SudokuCanon) => {
    // A 9x9 canon leaves the room size out, exactly as before sizes existed.
    const { room_width, room_height, ...rest } = newCanon;
    const out = (room_width ?? 3) === 3 && (room_height ?? 3) === 3 ? rest : { room_width, room_height, ...rest };
    setJsonText(JSON.stringify(out, null, 2));
  }, []);

  const changeSize = useCallback(
    (roomWidth: number, roomHeight: number) => {
      if (!canon) return;
      const size = roomWidth * roomHeight;
      if (canon.hints.some((row) => row.some((v) => v > 0)) && !window.confirm(`Switch to ${size}x${size}? This clears every given.`)) return;
      setActiveCell(null);
      updateJson({ room_width: roomWidth, room_height: roomHeight, hints: emptyHints(size) });
    },
    [canon, updateJson]
  );

  const conflicts = useMemo(() => (canon ? conflictCells(dims, canon.hints) : new Set<string>()), [canon, dims]);

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
      if (digit < 1 || digit > n) return;
      const newHints = canon.hints.map((r) => [...r]);
      newHints[row][col] = digit;
      updateJson({ ...canon, hints: newHints });
      setActiveCell(null);
    },
    [activeCell, canon, n, updateJson]
  );

  const clearValue = useCallback(() => {
    if (!activeCell || !canon) return;
    const [col, row] = activeCell.split(",").map(Number);
    const newHints = canon.hints.map((r) => [...r]);
    newHints[row][col] = 0;
    updateJson({ ...canon, hints: newHints });
    setActiveCell(null);
  }, [activeCell, canon, updateJson]);

  // Above 9x9 a number takes one or two keys ("1", "2" -> 12), and 0 is part of 10/20/30.
  const { pending, key: typeKey, reset: resetTyped } = useTypedNumber(n, enterValue);
  useEffect(() => resetTyped(), [activeCell, resetTyped]);

  useEffect(() => {
    if (!activeCell) return;
    function handleKey(e: KeyboardEvent) {
      const digit = parseInt(e.key, 10);
      if (big && /^[0-9]$/.test(e.key)) {
        typeKey(e.key);
      } else if (digit >= 1 && digit <= 9) {
        enterValue(digit);
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        clearValue();
      } else if (e.key === "Escape") {
        setActiveCell(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeCell, big, typeKey, enterValue, clearValue]);

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
      </div>
    );
  }

  const svgWidth = n * CELL_SIZE + PAD * 2;
  const svgHeight = n * CELL_SIZE + PAD * 2;

  const stroke = (i: number, room: number) => (i === 0 || i === n ? THICK : i % room === 0 ? MEDIUM : THIN);
  const gridLines: JSX.Element[] = [];
  for (let i = 0; i <= n; i++) {
    gridLines.push(
      <line
        key={`h-${i}`}
        x1={0}
        y1={i * CELL_SIZE}
        x2={n * CELL_SIZE}
        y2={i * CELL_SIZE}
        stroke="black"
        strokeWidth={stroke(i, dims.roomHeight)}
      />
    );
    gridLines.push(
      <line
        key={`v-${i}`}
        x1={i * CELL_SIZE}
        y1={0}
        x2={i * CELL_SIZE}
        y2={n * CELL_SIZE}
        stroke="black"
        strokeWidth={stroke(i, dims.roomWidth)}
      />
    );
  }
  const sizeIndex = SUDOKU_SIZES.findIndex((o) => o.roomWidth === dims.roomWidth && o.roomHeight === dims.roomHeight);

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
        <label htmlFor="sudoku-size">Size</label>
        <select
          id="sudoku-size"
          value={sizeIndex}
          onChange={(e) => {
            const o = SUDOKU_SIZES[Number(e.target.value)];
            if (o) changeSize(o.roomWidth, o.roomHeight);
          }}
        >
          {sizeIndex < 0 && <option value={-1}>{`${n}x${n} (${dims.roomWidth}x${dims.roomHeight} rooms)`}</option>}
          {SUDOKU_SIZES.map((o, i) => (
            <option key={o.label} value={i}>{o.label}</option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: "0.75rem" }}>
        {big
          ? `Click a cell then type 1–${n} (two digits for 10 and up) to set a hint, or Backspace to clear.`
          : "Click a cell then type 1–9 to set a hint, or Backspace/0 to clear."}
      </div>
      {conflicts.size > 0 && (
        <div style={{ fontSize: "0.8rem", color: "#c62828", marginBottom: "0.5rem" }}>
          {conflicts.size} givens repeat a number in a row, column or room (shown in red) — likely misreads.
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg
            width={Math.min(svgWidth, big ? 760 : 500)}
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
                      fill={conflicts.has(`${colIdx},${rowIdx}`) ? "#c62828" : "black"}
                      pointerEvents="none"
                    >
                      {val}
                    </text>
                  );
                })
              )}

              {/* Digits typed so far, while waiting for a second key */}
              {activeCell && pending && (() => {
                const [col, row] = activeCell.split(",").map(Number);
                return (
                  <text
                    x={col * CELL_SIZE + CELL_SIZE / 2}
                    y={row * CELL_SIZE + CELL_SIZE / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={20}
                    fontFamily="sans-serif"
                    fill="#1976d2"
                    pointerEvents="none"
                  >
                    {pending}
                  </text>
                );
              })()}

              {/* Click targets */}
              {Array.from({ length: n * n }, (_, i) => {
                const col = i % n;
                const row = Math.floor(i / n);
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


      </div>

    </div>
  );
}
