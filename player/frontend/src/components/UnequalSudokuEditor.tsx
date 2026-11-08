import { useState, useMemo, useCallback, useEffect } from "react";
import { UnequalSudokuCanon } from "../types/canon";
import {
  GAP,
  GAP_CELL,
  GAP_BOARD,
  BoxPlates,
  InequalitySign,
  cellX,
  cellY,
  cellCx,
  cellCy,
  rightGapCenter,
  downGapCenter,
} from "./gapGrid";
import { unequalSudokuConflicts } from "./UnequalSudokuBoard";

interface UnequalSudokuEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const PAD = 12;
const RED = "#d32f2f";

const isGrid = (v: unknown, rows: number, cols: number) =>
  Array.isArray(v) && v.length === rows && v.every((r) => Array.isArray(r) && r.length === cols);

function parseCanon(json: string): UnequalSudokuCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (isGrid(parsed.hints, 9, 9) && isGrid(parsed.right, 9, 8) && isGrid(parsed.down, 8, 9)) {
      return parsed as UnequalSudokuCanon;
    }
  } catch {}
  return null;
}

function emptyCanon(): UnequalSudokuCanon {
  return {
    hints: Array.from({ length: 9 }, () => Array(9).fill(0)),
    right: Array.from({ length: 9 }, () => Array(8).fill(0)),
    down: Array.from({ length: 8 }, () => Array(9).fill(0)),
  };
}

// Compact JSON: one array row per line keeps the 9x9 grids readable.
function formatCanon(canon: UnequalSudokuCanon): string {
  const block = (rows: number[][]) => rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n");
  return `{\n  "hints": [\n${block(canon.hints)}\n  ],\n  "right": [\n${block(canon.right)}\n  ],\n  "down": [\n${block(canon.down)}\n  ]\n}`;
}

export default function UnequalSudokuEditor({ initialJson, onChange }: UnequalSudokuEditorProps) {
  const [jsonText, setJsonText] = useState(() =>
    initialJson.trim() ? initialJson : formatCanon(emptyCanon())
  );
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const [activeCell, setActiveCell] = useState<string | null>(null);

  const updateJson = useCallback((next: UnequalSudokuCanon) => setJsonText(formatCanon(next)), []);

  const setHint = useCallback(
    (digit: number) => {
      if (!activeCell || !canon) return;
      const [col, row] = activeCell.split(",").map(Number);
      const hints = canon.hints.map((r) => [...r]);
      hints[row][col] = digit;
      updateJson({ ...canon, hints });
      setActiveCell(null);
    },
    [activeCell, canon, updateJson]
  );

  const cycleSign = useCallback(
    (kind: "right" | "down", row: number, col: number) => {
      if (!canon) return;
      const arr = canon[kind].map((r) => [...r]);
      arr[row][col] = ((arr[row][col] ?? 0) + 1) % 3;
      updateJson({ ...canon, [kind]: arr });
    },
    [canon, updateJson]
  );

  useEffect(() => {
    if (!activeCell) return;
    function handleKey(e: KeyboardEvent) {
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) setHint(digit);
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") setHint(0);
      else if (e.key === "Escape") setActiveCell(null);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeCell, setHint]);

  // Givens that already repeat a digit or break a sign: almost always a misread.
  const conflicts = useMemo(
    () => (canon ? unequalSudokuConflicts(canon.hints, canon) : null),
    [canon]
  );

  if (!canon || !conflicts) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid unequal sudoku JSON (needs hints 9x9, right 9x8, down 8x9). Fix the textarea below or start
          an empty board.
        </p>
        <div style={{ marginBottom: "1rem" }}>
          <button onClick={() => updateJson(emptyCanon())}>Create empty board</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const size = GAP_BOARD + PAD * 2;
  const conflictCount = conflicts.cells.size + conflicts.signs.size;

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: "0.75rem" }}>
        Click a cell then type 1–9 to set a given (Backspace/0 clears). Click a gap between two cells to cycle
        its sign: none → &lt; → &gt; (∧ → ∨ for vertical gaps).
      </div>
      {conflictCount > 0 && (
        <div style={{ fontSize: "0.8rem", color: RED, marginBottom: "0.5rem" }}>
          Givens marked red repeat a digit or break a sign — check for a misread.
        </div>
      )}

      <svg
        width={Math.min(size, 520)}
        viewBox={`0 0 ${size} ${size}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <BoxPlates />

          {Array.from({ length: 81 }, (_, i) => {
            const col = i % 9;
            const row = Math.floor(i / 9);
            const key = `${col},${row}`;
            return (
              <rect
                key={`cell-${key}`}
                x={cellX(col)}
                y={cellY(row)}
                width={GAP_CELL}
                height={GAP_CELL}
                fill={activeCell === key ? "#bbdefb" : "white"}
                stroke="#3a2430"
                strokeWidth={1.2}
                style={{ cursor: "pointer" }}
                onClick={() => setActiveCell((prev) => (prev === key ? null : key))}
              />
            );
          })}

          {canon.hints.map((rowArr, row) =>
            rowArr.map((val, col) =>
              val > 0 ? (
                <text
                  key={`hint-${row}-${col}`}
                  x={cellCx(col)}
                  y={cellCy(row)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={22}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                  fill={conflicts.cells.has(`${col},${row}`) ? RED : "black"}
                  pointerEvents="none"
                >
                  {val}
                </text>
              ) : null
            )
          )}

          {/* Gaps: sign plus a click target covering the whole gap. */}
          {Array.from({ length: 9 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => {
              const { x, y } = rightGapCenter(r, c);
              return (
                <g key={`r-${r}-${c}`}>
                  <InequalitySign
                    cx={x}
                    cy={y}
                    horizontal
                    sign={canon.right[r][c]}
                    color={conflicts.signs.has(`r:${r},${c}`) ? RED : undefined}
                  />
                  <rect
                    x={x - GAP / 2}
                    y={cellY(r)}
                    width={GAP}
                    height={GAP_CELL}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => cycleSign("right", r, c)}
                  />
                </g>
              );
            })
          )}
          {Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => {
              const { x, y } = downGapCenter(r, c);
              return (
                <g key={`d-${r}-${c}`}>
                  <InequalitySign
                    cx={x}
                    cy={y}
                    horizontal={false}
                    sign={canon.down[r][c]}
                    color={conflicts.signs.has(`d:${r},${c}`) ? RED : undefined}
                  />
                  <rect
                    x={cellX(c)}
                    y={y - GAP / 2}
                    width={GAP_CELL}
                    height={GAP}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => cycleSign("down", r, c)}
                  />
                </g>
              );
            })
          )}
        </g>
      </svg>
    </div>
  );
}
