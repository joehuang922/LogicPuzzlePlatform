import { useState, useMemo, useCallback, useEffect } from "react";
import { ComboSudokuCanon, ComboSudokuSubBoard } from "../types/canon";

interface ComboSudokuEditorProps {
  initialJson: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 40;
const THIN = 1;
const MEDIUM = 2;
const THICK = 3;
const ARROW_SIZE = 28;

function parseCanon(json: string): ComboSudokuCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.subboards && Array.isArray(parsed.subboards)) {
      return parsed as ComboSudokuCanon;
    }
  } catch {}
  return null;
}

function buildGlobalGrid(subboards: ComboSudokuSubBoard[]): Map<string, number> {
  const grid = new Map<string, number>();
  for (const sb of subboards) {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const val = sb.hints[row]?.[col] ?? 0;
        if (val > 0) {
          grid.set(`${3 * sb.x + col},${3 * sb.y + row}`, val);
        }
      }
    }
  }
  return grid;
}

function rebuildHints(sb: ComboSudokuSubBoard, globalGrid: Map<string, number>): number[][] {
  const hints: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const gKey = `${3 * sb.x + col},${3 * sb.y + row}`;
      hints[row][col] = globalGrid.get(gKey) ?? 0;
    }
  }
  return hints;
}

function extinguishOrphans(subboards: ComboSudokuSubBoard[]): ComboSudokuSubBoard[] {
  const coveredCells = new Set<string>();
  for (const sb of subboards) {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        coveredCells.add(`${3 * sb.x + col},${3 * sb.y + row}`);
      }
    }
  }
  return subboards.map((sb) => {
    const newHints = sb.hints.map((r, row) =>
      r.map((val, col) => {
        const gKey = `${3 * sb.x + col},${3 * sb.y + row}`;
        return coveredCells.has(gKey) ? val : 0;
      })
    );
    return { ...sb, hints: newHints };
  });
}

export default function ComboSudokuEditor({ initialJson, onComplete, onCancel }: ComboSudokuEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [focusedBoard, setFocusedBoard] = useState<number | null>(null);

  const totalCols = canon ? Math.max(...canon.subboards.map((sb) => 3 * sb.x + 9), 9) : 9;
  const totalRows = canon ? Math.max(...canon.subboards.map((sb) => 3 * sb.y + 9), 9) : 9;

  const cellsInBoard = useMemo(() => {
    if (!canon) return new Set<string>();
    const set = new Set<string>();
    for (const sb of canon.subboards) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          set.add(`${3 * sb.x + col},${3 * sb.y + row}`);
        }
      }
    }
    return set;
  }, [canon]);

  const updateCanon = useCallback((newCanon: ComboSudokuCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const enterValue = useCallback(
    (digit: number) => {
      if (!activeCell || !canon) return;
      const [globalCol, globalRow] = activeCell.split(",").map(Number);
      const newSubboards = canon.subboards.map((sb) => {
        const localCol = globalCol - 3 * sb.x;
        const localRow = globalRow - 3 * sb.y;
        if (localCol >= 0 && localCol < 9 && localRow >= 0 && localRow < 9) {
          const newHints = sb.hints.map((r) => [...r]);
          newHints[localRow][localCol] = digit;
          return { ...sb, hints: newHints };
        }
        return sb;
      });
      updateCanon({ ...canon, subboards: newSubboards });
      setActiveCell(null);
    },
    [activeCell, canon, updateCanon]
  );

  const clearValue = useCallback(() => {
    if (!activeCell || !canon) return;
    const [globalCol, globalRow] = activeCell.split(",").map(Number);
    const newSubboards = canon.subboards.map((sb) => {
      const localCol = globalCol - 3 * sb.x;
      const localRow = globalRow - 3 * sb.y;
      if (localCol >= 0 && localCol < 9 && localRow >= 0 && localRow < 9) {
        const newHints = sb.hints.map((r) => [...r]);
        newHints[localRow][localCol] = 0;
        return { ...sb, hints: newHints };
      }
      return sb;
    });
    updateCanon({ ...canon, subboards: newSubboards });
    setActiveCell(null);
  }, [activeCell, canon, updateCanon]);

  const moveBoard = useCallback(
    (dx: number, dy: number) => {
      if (focusedBoard === null || !canon) return;
      const sb = canon.subboards[focusedBoard];
      const newX = sb.x + dx;
      const newY = sb.y + dy;
      if (newX < 0 || newY < 0) return;

      const globalGrid = buildGlobalGrid(canon.subboards);
      const movedSb: ComboSudokuSubBoard = { x: newX, y: newY, hints: Array.from({ length: 9 }, () => Array(9).fill(0)) };
      const newSubboards = canon.subboards.map((s, i) => (i === focusedBoard ? movedSb : s));
      const rebuilt = newSubboards.map((s) => ({ ...s, hints: rebuildHints(s, globalGrid) }));
      const cleaned = extinguishOrphans(rebuilt);
      updateCanon({ ...canon, subboards: cleaned });
    },
    [focusedBoard, canon, updateCanon]
  );

  const addSubboard = useCallback(() => {
    if (!canon) return;
    const origins = new Set(canon.subboards.map((sb) => `${sb.x},${sb.y}`));
    let newX = 0;
    let newY = 0;
    while (origins.has(`${newX},${newY}`)) {
      newX++;
      if (newX > 20) { newX = 0; newY++; }
    }
    const newSb: ComboSudokuSubBoard = {
      x: newX,
      y: newY,
      hints: Array.from({ length: 9 }, () => Array(9).fill(0)),
    };
    updateCanon({ ...canon, subboards: [...canon.subboards, newSb] });
    setFocusedBoard(canon.subboards.length);
  }, [canon, updateCanon]);

  const removeSubboard = useCallback(() => {
    if (focusedBoard === null || !canon) return;
    const newSubboards = canon.subboards.filter((_, i) => i !== focusedBoard);
    const cleaned = extinguishOrphans(newSubboards);
    updateCanon({ ...canon, subboards: cleaned });
    setFocusedBoard(null);
  }, [focusedBoard, canon, updateCanon]);

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

  function handleBoardClick(globalCol: number, globalRow: number) {
    if (!canon) return;
    let hitIdx: number | null = null;
    for (let i = 0; i < canon.subboards.length; i++) {
      const sb = canon.subboards[i];
      const localCol = globalCol - 3 * sb.x;
      const localRow = globalRow - 3 * sb.y;
      if (localCol >= 0 && localCol < 9 && localRow >= 0 && localRow < 9) {
        hitIdx = i;
      }
    }
    if (hitIdx !== null) {
      if (focusedBoard === hitIdx) {
        setActiveCell(`${globalCol},${globalRow}`);
      } else {
        setFocusedBoard(hitIdx);
        setActiveCell(null);
      }
    }
  }

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid combo-sudoku JSON. Fix the textarea below, then the board will appear.
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

  const svgWidth = totalCols * CELL_SIZE + PAD * 2;
  const svgHeight = totalRows * CELL_SIZE + PAD * 2;

  const renderedHints = new Set<string>();

  const focusedSb = focusedBoard !== null ? canon.subboards[focusedBoard] : null;

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center" }}>
        <button
          type="button"
          onClick={addSubboard}
          style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem", border: "1px solid #4a90d9", borderRadius: 4, background: "#f0f7ff", color: "#4a90d9", cursor: "pointer" }}
        >
          + Add Subboard
        </button>
        <button
          type="button"
          onClick={removeSubboard}
          disabled={focusedBoard === null}
          style={{
            padding: "0.3rem 0.75rem", fontSize: "0.8rem", borderRadius: 4, cursor: focusedBoard !== null ? "pointer" : "default",
            border: focusedBoard !== null ? "1px solid #d33" : "1px solid #ccc",
            background: focusedBoard !== null ? "#fff0f0" : "#f5f5f5",
            color: focusedBoard !== null ? "#d33" : "#999",
          }}
        >
          − Remove Subboard
        </button>
        <span style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click a subboard to focus it. Click again on cells to edit numbers.
        </span>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg
            width={Math.min(svgWidth, 700)}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
          >
            <g transform={`translate(${PAD},${PAD})`}>
              {/* Focused board highlight */}
              {focusedSb && (
                <rect
                  x={3 * focusedSb.x * CELL_SIZE}
                  y={3 * focusedSb.y * CELL_SIZE}
                  width={9 * CELL_SIZE}
                  height={9 * CELL_SIZE}
                  fill="#fffde7"
                  stroke="#e8c840"
                  strokeWidth={2}
                />
              )}

              {/* Active cell highlight */}
              {activeCell && cellsInBoard.has(activeCell) && (() => {
                const [col, row] = activeCell.split(",").map(Number);
                return (
                  <rect
                    x={col * CELL_SIZE + 1}
                    y={row * CELL_SIZE + 1}
                    width={CELL_SIZE - 2}
                    height={CELL_SIZE - 2}
                    fill="#bbdefb"
                    fillOpacity={0.7}
                  />
                );
              })()}

              {/* Subboard grids and hints */}
              {canon.subboards.map((sb, idx) => {
                const ox = 3 * sb.x * CELL_SIZE;
                const oy = 3 * sb.y * CELL_SIZE;
                const lines: JSX.Element[] = [];
                const hints: JSX.Element[] = [];

                for (let i = 0; i <= 9; i++) {
                  const isBorder = i === 0 || i === 9;
                  const isBox = i % 3 === 0 && !isBorder;
                  const strokeWidth = isBorder ? THICK : isBox ? MEDIUM : THIN;
                  lines.push(
                    <line
                      key={`h-${idx}-${i}`}
                      x1={ox}
                      y1={oy + i * CELL_SIZE}
                      x2={ox + 9 * CELL_SIZE}
                      y2={oy + i * CELL_SIZE}
                      stroke="black"
                      strokeWidth={strokeWidth}
                    />
                  );
                  lines.push(
                    <line
                      key={`v-${idx}-${i}`}
                      x1={ox + i * CELL_SIZE}
                      y1={oy}
                      x2={ox + i * CELL_SIZE}
                      y2={oy + 9 * CELL_SIZE}
                      stroke="black"
                      strokeWidth={strokeWidth}
                    />
                  );
                }

                for (let row = 0; row < 9; row++) {
                  for (let col = 0; col < 9; col++) {
                    const val = sb.hints[row]?.[col] ?? 0;
                    if (val > 0) {
                      const globalCol = 3 * sb.x + col;
                      const globalRow = 3 * sb.y + row;
                      const key = `${globalCol},${globalRow}`;
                      if (!renderedHints.has(key)) {
                        renderedHints.add(key);
                        hints.push(
                          <text
                            key={`t-${idx}-${row}-${col}`}
                            x={ox + col * CELL_SIZE + CELL_SIZE / 2}
                            y={oy + row * CELL_SIZE + CELL_SIZE / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fontSize={18}
                            fontFamily="sans-serif"
                            fill="black"
                            pointerEvents="none"
                          >
                            {val}
                          </text>
                        );
                      }
                    }
                  }
                }

                return (
                  <g key={idx}>
                    {lines}
                    {hints}
                  </g>
                );
              })}

              {/* Click targets */}
              {Array.from(cellsInBoard).map((key) => {
                const [col, row] = key.split(",").map(Number);
                return (
                  <rect
                    key={`click-${key}`}
                    x={col * CELL_SIZE}
                    y={row * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleBoardClick(col, row)}
                  />
                );
              })}

              {/* Directional arrows for focused board */}
              {focusedSb && (() => {
                const ox = 3 * focusedSb.x * CELL_SIZE;
                const oy = 3 * focusedSb.y * CELL_SIZE;
                const bw = 9 * CELL_SIZE;
                const bh = 9 * CELL_SIZE;
                const cx = ox + bw / 2;
                const cy = oy + bh / 2;
                const gap = 6;

                const arrows = [
                  { id: "up", dx: 0, dy: -1, ax: cx, ay: oy - gap - ARROW_SIZE / 2, rotation: 0 },
                  { id: "down", dx: 0, dy: 1, ax: cx, ay: oy + bh + gap + ARROW_SIZE / 2, rotation: 180 },
                  { id: "left", dx: -1, dy: 0, ax: ox - gap - ARROW_SIZE / 2, ay: cy, rotation: -90 },
                  { id: "right", dx: 1, dy: 0, ax: ox + bw + gap + ARROW_SIZE / 2, ay: cy, rotation: 90 },
                ];

                return arrows.map(({ id, dx, dy, ax, ay, rotation }) => {
                  const canMove = (focusedSb.x + dx) >= 0 && (focusedSb.y + dy) >= 0;
                  return (
                    <g
                      key={`arrow-${id}`}
                      style={{ cursor: canMove ? "pointer" : "not-allowed", opacity: canMove ? 1 : 0.3 }}
                      onClick={(e) => { e.stopPropagation(); if (canMove) moveBoard(dx, dy); }}
                    >
                      <circle cx={ax} cy={ay} r={ARROW_SIZE / 2} fill="#fff" stroke="#4a90d9" strokeWidth={1.5} />
                      <polygon
                        points={`${ax},${ay - 7} ${ax - 6},${ay + 4} ${ax + 6},${ay + 4}`}
                        fill="#4a90d9"
                        transform={`rotate(${rotation} ${ax} ${ay})`}
                      />
                    </g>
                  );
                });
              })()}
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
            onChange={(e) => { setJsonText(e.target.value); setFocusedBoard(null); setActiveCell(null); }}
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
