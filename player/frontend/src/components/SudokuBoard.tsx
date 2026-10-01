import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import DigitBar from "./DigitBar";
import RadialInput from "./RadialInput";
import { nextHint, cellLabel, Step } from "@puzzle/solver";

interface SudokuBoardProps {
  hints: number[][];
  initialUserValues?: Record<string, number>;
  // Pencil-mark candidates keyed by "col,row"; each an ascending digit list.
  initialNotes?: Record<string, number[]>;
  // The gate-computed solution grid, when stored. Backs the "reveal" hint fallback
  // for boards where no logical next step is found. See docs/auto-solve.
  solution?: number[][] | null;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  liveValidate?: boolean;
}

// The hint affordance's view model: a logical step, a revealed cell, or a plain message.
type HintView =
  | { kind: "step"; step: Step }
  | { kind: "reveal"; cellId: number; value: number }
  | { kind: "message"; text: string };

const idToKey = (id: number) => `${id % 9},${Math.floor(id / 9)}`;

// Title-case a technique slug, e.g. "naked-single" -> "Naked single".
function techniqueLabel(name: string): string {
  const spaced = name.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const CELL_SIZE = 40;
const PAD = CELL_SIZE;
const THIN = 1;
const MEDIUM = 2;
const THICK = 3;
function notesFromInitial(initial?: Record<string, number[]>): Record<string, Set<number>> {
  const map: Record<string, Set<number>> = {};
  if (initial) {
    for (const [key, digits] of Object.entries(initial)) {
      const set = new Set(digits.filter((d) => d >= 1 && d <= 9));
      if (set.size > 0) map[key] = set;
    }
  }
  return map;
}

export default function SudokuBoard({ hints, initialUserValues, initialNotes, solution, onValuesChange, onComplete, liveValidate }: SudokuBoardProps) {
  const isMobile = useIsMobile();
  const width = 9 * CELL_SIZE + PAD * 2;
  const height = 9 * CELL_SIZE + PAD * 2;

  const [userValues, setUserValues] = useState<Record<string, number>>(initialUserValues ?? {});
  const [notes, setNotes] = useState<Record<string, Set<number>>>(() => notesFromInitial(initialNotes));
  const [noteMode, setNoteMode] = useState(false);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Emit a single flat map: committed answers under "col,row" and note flags
  // under "n:col,row:digit" -> 1. The extractor/progress split them back apart.
  useEffect(() => {
    const flat: Record<string, number> = { ...userValues };
    for (const [key, set] of Object.entries(notes)) {
      // Notes on an answered cell are dropped (answer overwrites notes).
      if (userValues[key] != null && userValues[key] > 0) continue;
      for (const digit of set) flat[`n:${key}:${digit}`] = 1;
    }
    onValuesChange?.(flat);
  }, [userValues, notes, onValuesChange]);

  const hintCells = useMemo(() => {
    const set = new Set<string>();
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (hints[row]?.[col] > 0) {
          set.add(`${col},${row}`);
        }
      }
    }
    return set;
  }, [hints]);

  const peerMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const key = `${col},${row}`;
        const peers = new Set<string>();
        for (let c = 0; c < 9; c++) {
          if (c !== col) peers.add(`${c},${row}`);
        }
        for (let r = 0; r < 9; r++) {
          if (r !== row) peers.add(`${col},${r}`);
        }
        const boxStartCol = Math.floor(col / 3) * 3;
        const boxStartRow = Math.floor(row / 3) * 3;
        for (let r = boxStartRow; r < boxStartRow + 3; r++) {
          for (let c = boxStartCol; c < boxStartCol + 3; c++) {
            if (r !== row || c !== col) peers.add(`${c},${r}`);
          }
        }
        map.set(key, peers);
      }
    }
    return map;
  }, []);

  const conflictCells = useMemo(() => {
    const conflicts = new Set<string>();
    const fullGrid: number[][] = Array.from({ length: 9 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) => {
        const hint = hints[row]?.[col] ?? 0;
        if (hint > 0) return hint;
        return userValues[`${col},${row}`] ?? 0;
      })
    );

    for (let row = 0; row < 9; row++) {
      const seen = new Map<number, number[]>();
      for (let col = 0; col < 9; col++) {
        const val = fullGrid[row][col];
        if (val === 0) continue;
        if (!seen.has(val)) seen.set(val, []);
        seen.get(val)!.push(col);
      }
      for (const [, cols] of seen) {
        if (cols.length > 1) cols.forEach((c) => conflicts.add(`${c},${row}`));
      }
    }

    for (let col = 0; col < 9; col++) {
      const seen = new Map<number, number[]>();
      for (let row = 0; row < 9; row++) {
        const val = fullGrid[row][col];
        if (val === 0) continue;
        if (!seen.has(val)) seen.set(val, []);
        seen.get(val)!.push(row);
      }
      for (const [, rows] of seen) {
        if (rows.length > 1) rows.forEach((r) => conflicts.add(`${col},${r}`));
      }
    }

    for (let boxRow = 0; boxRow < 3; boxRow++) {
      for (let boxCol = 0; boxCol < 3; boxCol++) {
        const seen = new Map<number, string[]>();
        for (let r = boxRow * 3; r < boxRow * 3 + 3; r++) {
          for (let c = boxCol * 3; c < boxCol * 3 + 3; c++) {
            const val = fullGrid[r][c];
            if (val === 0) continue;
            if (!seen.has(val)) seen.set(val, []);
            seen.get(val)!.push(`${c},${r}`);
          }
        }
        for (const [, keys] of seen) {
          if (keys.length > 1) keys.forEach((k) => conflicts.add(k));
        }
      }
    }

    return conflicts;
  }, [hints, userValues]);

  const completedRef = useRef(false);

  useEffect(() => {
    if (completedRef.current) return;
    const totalHints = hints.flat().filter((v) => v > 0).length;
    const totalFilled = totalHints + Object.keys(userValues).length;
    if (totalFilled === 81 && conflictCells.size === 0) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [userValues, conflictCells, hints, onComplete]);

  const highlightSource = activeCell ?? hoveredCell;
  const highlightedCells = useMemo(() => {
    if (!highlightSource) return new Set<string>();
    return peerMap.get(highlightSource) ?? new Set<string>();
  }, [highlightSource, peerMap]);

  // --- Hint affordance (docs/auto-solve, Phase 4) -------------------------------
  // Runs the client-side solver on the committed board to surface the shallowest
  // logical next step; falls back to revealing one cell from the stored solution.
  const [hint, setHint] = useState<HintView | null>(null);

  const requestHint = useCallback(() => {
    // Hints reason from committed entries as if they're correct, so a contradiction
    // makes the candidate analysis unsound — steer the player to fix conflicts first.
    if (conflictCells.size > 0) {
      setHint({ kind: "message", text: "Fix the conflicting cells first — hints assume your entries are correct." });
      return;
    }
    const canon = { hints };
    const step = nextHint(1, canon, userValues);
    if (step) {
      setHint({ kind: "step", step });
      return;
    }
    // No logical step the ladder knows: reveal the first unfilled cell, if we have
    // a stored solution to draw from.
    if (solution) {
      for (let id = 0; id < 81; id++) {
        const r = Math.floor(id / 9);
        const c = id % 9;
        const filled = (hints[r]?.[c] ?? 0) > 0 || (userValues[`${c},${r}`] ?? 0) > 0;
        const sol = solution[r]?.[c] ?? 0;
        if (!filled && sol > 0) {
          setHint({ kind: "reveal", cellId: id, value: sol });
          return;
        }
      }
      setHint({ kind: "message", text: "The board is already complete." });
      return;
    }
    setHint({ kind: "message", text: "No further hints are available for this puzzle." });
  }, [conflictCells, hints, userValues, solution]);

  // Commit the hinted cell (placement step or reveal). Elimination hints have no
  // placement to apply — they're informational and only dismissed.
  const applyHint = useCallback(() => {
    const placement =
      hint?.kind === "reveal"
        ? { cell: hint.cellId, value: hint.value }
        : hint?.kind === "step"
        ? hint.step.placement
        : undefined;
    if (!placement) return;
    const key = `${placement.cell % 9},${Math.floor(placement.cell / 9)}`;
    setUserValues((prev) => ({ ...prev, [key]: placement.value }));
    setNotes((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setHint(null);
  }, [hint]);

  // A hint reflects a specific board; once the player changes it, drop the stale hint.
  const userValuesAtHint = useRef(userValues);
  useEffect(() => {
    if (hint && userValues !== userValuesAtHint.current) setHint(null);
    userValuesAtHint.current = userValues;
  }, [userValues, hint]);

  // Cells to tint for the current hint, and candidate digits struck through for
  // elimination hints (keyed "col,row" -> digits removed).
  const hintFocusKeys = useMemo(() => {
    if (!hint) return new Set<string>();
    if (hint.kind === "reveal") return new Set([idToKey(hint.cellId)]);
    if (hint.kind === "step") return new Set(hint.step.focusCells.map(idToKey));
    return new Set<string>();
  }, [hint]);

  const hintStrikes = useMemo(() => {
    const map = new Map<string, Set<number>>();
    if (hint?.kind === "step" && hint.step.eliminations) {
      for (const { cell, digits } of hint.step.eliminations) {
        map.set(idToKey(cell), new Set(digits));
      }
    }
    return map;
  }, [hint]);

  // A cell that already holds a committed answer can't take notes: force answer
  // mode and disable the toggle while such a cell is active.
  const activeHasAnswer = activeCell != null && (userValues[activeCell] ?? 0) > 0;
  const effectiveNoteMode = noteMode && !activeHasAnswer;

  const enterValue = useCallback(
    (digit: number) => {
      if (!activeCell) return;
      if (noteMode && (userValues[activeCell] ?? 0) === 0) {
        // Toggle the candidate; keep the picker open so several can be marked.
        setNotes((prev) => {
          const next = { ...prev };
          const set = new Set(next[activeCell] ?? []);
          if (set.has(digit)) set.delete(digit);
          else set.add(digit);
          if (set.size === 0) delete next[activeCell];
          else next[activeCell] = set;
          return next;
        });
        return;
      }
      // Answer mode: commit the digit and clear that cell's notes.
      setUserValues((prev) => ({ ...prev, [activeCell]: digit }));
      setNotes((prev) => {
        if (!prev[activeCell]) return prev;
        const next = { ...prev };
        delete next[activeCell];
        return next;
      });
      setActiveCell(null);
    },
    [activeCell, noteMode, userValues]
  );

  const clearValue = useCallback(() => {
    if (!activeCell) return;
    if (noteMode && (userValues[activeCell] ?? 0) === 0) {
      setNotes((prev) => {
        if (!prev[activeCell]) return prev;
        const next = { ...prev };
        delete next[activeCell];
        return next;
      });
      return;
    }
    setUserValues((prev) => {
      const next = { ...prev };
      delete next[activeCell];
      return next;
    });
    setActiveCell(null);
  }, [activeCell, noteMode, userValues]);

  useEffect(() => {
    if (!activeCell) return;
    function handleKey(e: KeyboardEvent) {
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) {
        enterValue(digit);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        clearValue();
      } else if (e.key === "Escape") {
        setActiveCell(null);
      } else if (e.key === "n" || e.key === "N") {
        if (!activeHasAnswer) setNoteMode((m) => !m);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeCell, activeHasAnswer, enterValue, clearValue]);

  function handleCellClick(key: string) {
    if (hintCells.has(key)) return;
    setActiveCell((prev) => (prev === key ? null : key));
  }

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
    <div style={{ maxWidth: width, width: "100%", paddingBottom: isMobile && activeCell ? 60 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <button
          onClick={requestHint}
          style={{
            fontSize: "0.85rem",
            padding: "0.35rem 0.9rem",
            background: "#1976d2",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
          title="Suggest the next logical step"
        >
          Hint
        </button>
        {hint && (
          <button
            onClick={() => setHint(null)}
            style={{
              fontSize: "0.85rem",
              padding: "0.35rem 0.9rem",
              background: "#f0f0f0",
              border: "1px solid #ccc",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Clear hint
          </button>
        )}
      </div>

      {hint && (
        <div
          style={{
            marginBottom: "0.6rem",
            padding: "0.6rem 0.8rem",
            background: hint.kind === "reveal" ? "#e8f5e9" : hint.kind === "message" ? "#fff8e1" : "#e3f2fd",
            border: `1px solid ${hint.kind === "reveal" ? "#a5d6a7" : hint.kind === "message" ? "#ffe082" : "#90caf9"}`,
            borderRadius: 6,
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          {hint.kind === "step" && (
            <>
              <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>
                {techniqueLabel(hint.step.technique)}
              </div>
              <div style={{ color: "#333" }}>{hint.step.explanation}</div>
            </>
          )}
          {hint.kind === "reveal" && (
            <>
              <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>Revealed cell</div>
              <div style={{ color: "#333" }}>
                No simple logical step was found, so here's one cell from the solution:{" "}
                {cellLabel(hint.cellId)} is {hint.value}.
              </div>
            </>
          )}
          {hint.kind === "message" && <div style={{ color: "#333" }}>{hint.text}</div>}
          {(hint.kind === "reveal" || (hint.kind === "step" && hint.step.placement)) && (
            <button
              onClick={applyHint}
              style={{
                marginTop: "0.5rem",
                fontSize: "0.8rem",
                padding: "0.3rem 0.8rem",
                background: hint.kind === "reveal" ? "#43a047" : "#1976d2",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {hint.kind === "reveal" ? "Fill it in" : "Place it"}
            </button>
          )}
        </div>
      )}

      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ border: "1px solid #ccc", outline: "none", userSelect: "none", display: "block" }}
        tabIndex={0}
        onContextMenu={(e) => {
          if (activeCell) {
            e.preventDefault();
            setActiveCell(null);
          }
        }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Hint highlight layer: amber for the pattern/placement cells, red for
              cells a hint says to eliminate candidates from. Drawn beneath the
              peer-highlight so an active cell still reads clearly. */}
          {hint && (hint.kind === "step" || hint.kind === "reveal") && (
            <g>
              {Array.from(hintFocusKeys).map((key) => {
                const [col, row] = key.split(",").map(Number);
                return (
                  <rect
                    key={`hint-focus-${key}`}
                    x={col * CELL_SIZE + 1}
                    y={row * CELL_SIZE + 1}
                    width={CELL_SIZE - 2}
                    height={CELL_SIZE - 2}
                    fill={hint.kind === "reveal" ? "#c8e6c9" : "#fff59d"}
                    fillOpacity={0.8}
                  />
                );
              })}
              {Array.from(hintStrikes.keys()).map((key) => {
                const [col, row] = key.split(",").map(Number);
                return (
                  <rect
                    key={`hint-elim-${key}`}
                    x={col * CELL_SIZE + 1}
                    y={row * CELL_SIZE + 1}
                    width={CELL_SIZE - 2}
                    height={CELL_SIZE - 2}
                    fill="#ffcdd2"
                    fillOpacity={0.7}
                  />
                );
              })}
            </g>
          )}

          {/* Highlight layer */}
          {highlightSource && (
            <g>
              <rect
                x={parseInt(highlightSource.split(",")[0]) * CELL_SIZE + 1}
                y={parseInt(highlightSource.split(",")[1]) * CELL_SIZE + 1}
                width={CELL_SIZE - 2}
                height={CELL_SIZE - 2}
                fill="#bbdefb"
                fillOpacity={0.6}
              />
              {Array.from(highlightedCells).map((key) => {
                const [col, row] = key.split(",").map(Number);
                return (
                  <rect
                    key={`hl-${key}`}
                    x={col * CELL_SIZE + 1}
                    y={row * CELL_SIZE + 1}
                    width={CELL_SIZE - 2}
                    height={CELL_SIZE - 2}
                    fill="#e3f2fd"
                    fillOpacity={0.5}
                  />
                );
              })}
            </g>
          )}

          {/* Grid lines */}
          {gridLines}

          {/* Hint values */}
          {hints.map((row, rowIdx) =>
            row.map((val, colIdx) => {
              if (val <= 0) return null;
              const hintKey = `${colIdx},${rowIdx}`;
              return (
                <text
                  key={`hint-${rowIdx}-${colIdx}`}
                  x={colIdx * CELL_SIZE + CELL_SIZE / 2}
                  y={rowIdx * CELL_SIZE + CELL_SIZE / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={20}
                  fontFamily="sans-serif"
                  fill={liveValidate && conflictCells.has(hintKey) ? "#d32f2f" : "black"}
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
            const key = `${col},${row}`;
            const isHint = hintCells.has(key);
            return (
              <rect
                key={`click-${key}`}
                x={col * CELL_SIZE}
                y={row * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                fill="transparent"
                style={{ cursor: isHint ? "default" : "pointer" }}
                onMouseEnter={() => { if (!activeCell) setHoveredCell(key); }}
                onMouseLeave={() => { if (!activeCell) setHoveredCell(null); }}
                onClick={() => handleCellClick(key)}
              />
            );
          })}

          {/* Pencil-mark notes: small grey digits in a fixed 3x3 sub-layout
              (1 2 3 / 4 5 6 / 7 8 9). Hidden once the cell holds an answer/hint. */}
          {Object.entries(notes).map(([key, set]) => {
            const [col, row] = key.split(",").map(Number);
            if (hintCells.has(key) || (userValues[key] ?? 0) > 0) return null;
            const third = CELL_SIZE / 3;
            return Array.from(set).map((digit) => {
              const sub = digit - 1;
              const sx = col * CELL_SIZE + ((sub % 3) + 0.5) * third;
              const sy = row * CELL_SIZE + (Math.floor(sub / 3) + 0.5) * third;
              return (
                <text
                  key={`note-${key}-${digit}`}
                  x={sx}
                  y={sy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={third * 0.8}
                  fontFamily="sans-serif"
                  fill="#999"
                  pointerEvents="none"
                >
                  {digit}
                </text>
              );
            });
          })}

          {/* Hint candidate strikes: for elimination hints, show the removed digits
              as small red struck-through marks in the 3x3 sub-layout, so the player
              sees which candidates the technique rules out. Only on empty cells. */}
          {Array.from(hintStrikes.entries()).map(([key, digits]) => {
            const [col, row] = key.split(",").map(Number);
            if (hintCells.has(key) || (userValues[key] ?? 0) > 0) return null;
            const third = CELL_SIZE / 3;
            return Array.from(digits).map((digit) => {
              const sub = digit - 1;
              const sx = col * CELL_SIZE + ((sub % 3) + 0.5) * third;
              const sy = row * CELL_SIZE + (Math.floor(sub / 3) + 0.5) * third;
              return (
                <g key={`strike-${key}-${digit}`} pointerEvents="none">
                  <text
                    x={sx}
                    y={sy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={third * 0.8}
                    fontFamily="sans-serif"
                    fill="#d32f2f"
                  >
                    {digit}
                  </text>
                  <line
                    x1={sx - third * 0.35}
                    y1={sy + third * 0.35}
                    x2={sx + third * 0.35}
                    y2={sy - third * 0.35}
                    stroke="#d32f2f"
                    strokeWidth={1}
                  />
                </g>
              );
            });
          })}

          {/* User-entered values */}
          {Object.entries(userValues).map(([key, val]) => {
            if (activeCell === key) return null;
            const [col, row] = key.split(",").map(Number);
            return (
              <text
                key={`uv-${key}`}
                x={col * CELL_SIZE + CELL_SIZE / 2}
                y={row * CELL_SIZE + CELL_SIZE / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={20}
                fontFamily="sans-serif"
                fill={liveValidate && conflictCells.has(key) ? "#d32f2f" : "#888"}
                pointerEvents="none"
              >
                {val}
              </text>
            );
          })}

          {/* Radial input menu (desktop only; mobile uses the DigitBar below) */}
          {activeCell && !isMobile && (() => {
            const [col, row] = activeCell.split(",").map(Number);
            return (
              <RadialInput
                cx={col * CELL_SIZE + CELL_SIZE / 2}
                cy={row * CELL_SIZE + CELL_SIZE / 2}
                backdrop={{ x: -PAD, y: -PAD, width, height }}
                onDigit={enterValue}
                onErase={clearValue}
                onDismiss={() => setActiveCell(null)}
                noteMode={effectiveNoteMode}
                onToggleMode={() => setNoteMode((m) => !m)}
                modeDisabled={activeHasAnswer}
              />
            );
          })()}
        </g>
      </svg>

      {/* Mobile digit bar */}
      {activeCell && isMobile && (
        <DigitBar
          onDigit={enterValue}
          onClear={clearValue}
          onDismiss={() => setActiveCell(null)}
          noteMode={effectiveNoteMode}
          onToggleMode={() => setNoteMode((m) => !m)}
          modeDisabled={activeHasAnswer}
        />
      )}
    </div>
  );
}
