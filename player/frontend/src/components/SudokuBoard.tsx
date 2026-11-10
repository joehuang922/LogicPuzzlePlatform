import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useBoardUiState } from "../hooks/useBoardUiState";
import { useIsMobile } from "../hooks/useIsMobile";
import DigitBar from "./DigitBar";
import RadialInput from "./RadialInput";
import { nextPlacement, cellLabel } from "@puzzle/solver";
import { conflictCells as findConflicts, peerMap as buildPeerMap } from "./sudokuRules";
import { useTypedNumber } from "../hooks/useTypedNumber";

interface SudokuBoardProps {
  hints: number[][];
  // Room size (default 3x3). The board is N x N with N = roomWidth * roomHeight and
  // digits 1..N: 16x16, 25x25, 30x30 (6 wide, 5 tall) as well as the standard 9x9.
  roomWidth?: number;
  roomHeight?: number;
  initialUserValues?: Record<string, number>;
  // Pencil-mark candidates keyed by "col,row"; each an ascending digit list.
  initialNotes?: Record<string, number[]>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  liveValidate?: boolean;
}

// The hint affordance's view model: the next cell to fill (its digit is never shown),
// or a plain message.
type HintView =
  | { kind: "cell"; cellId: number }
  | { kind: "message"; text: string };

const CELL_SIZE = 40;
// On a phone a board above 9x9 keeps at least this many px per cell and scrolls
// sideways, instead of shrinking 30 cells into a phone's width.
const MIN_MOBILE_CELL_PX = 30;
const PAD = CELL_SIZE;
const THIN = 1;
const MEDIUM = 2;
const THICK = 3;
function notesFromInitial(initial: Record<string, number[]> | undefined, max: number): Record<string, Set<number>> {
  const map: Record<string, Set<number>> = {};
  if (initial) {
    for (const [key, digits] of Object.entries(initial)) {
      const set = new Set(digits.filter((d) => d >= 1 && d <= max));
      if (set.size > 0) map[key] = set;
    }
  }
  return map;
}

export default function SudokuBoard({ hints, roomWidth = 3, roomHeight = 3, initialUserValues, initialNotes, onValuesChange, onComplete, liveValidate }: SudokuBoardProps) {
  const isMobile = useIsMobile();
  const n = roomWidth * roomHeight;
  const dims = useMemo(() => ({ roomWidth, roomHeight, size: n }), [roomWidth, roomHeight, n]);
  // Above 9x9, digits come from a number pad (desktop too) and typed multi-digit keys.
  const big = n > 9;
  const idToKey = (id: number) => `${id % n},${Math.floor(id / n)}`;
  const width = n * CELL_SIZE + PAD * 2;
  const height = n * CELL_SIZE + PAD * 2;

  const [userValues, setUserValues] = useState<Record<string, number>>(initialUserValues ?? {});
  const [notes, setNotes] = useState<Record<string, Set<number>>>(() => notesFromInitial(initialNotes, n));
  const [noteMode, setNoteMode] = useBoardUiState("sudoku.noteMode", false);
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
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (hints[row]?.[col] > 0) {
          set.add(`${col},${row}`);
        }
      }
    }
    return set;
  }, [hints]);

  const peerMap = useMemo(() => buildPeerMap(dims), [dims]);

  const conflictCells = useMemo(() => {
    const fullGrid: number[][] = Array.from({ length: n }, (_, row) =>
      Array.from({ length: n }, (_, col) => {
        const hint = hints[row]?.[col] ?? 0;
        if (hint > 0) return hint;
        return userValues[`${col},${row}`] ?? 0;
      })
    );
    return findConflicts(dims, fullGrid);
  }, [dims, n, hints, userValues]);

  const completedRef = useRef(false);

  useEffect(() => {
    if (completedRef.current) return;
    const totalHints = hints.flat().filter((v) => v > 0).length;
    const totalFilled = totalHints + Object.keys(userValues).length;
    if (totalFilled === n * n && conflictCells.size === 0) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [userValues, conflictCells, hints, n, onComplete]);

  const highlightSource = activeCell ?? hoveredCell;
  const highlightedCells = useMemo(() => {
    if (!highlightSource) return new Set<string>();
    return peerMap.get(highlightSource) ?? new Set<string>();
  }, [highlightSource, peerMap]);

  // --- Hint affordance (docs/auto-solve, Phase 4) -------------------------------
  // Runs the client-side solver on the committed board to find the next cell whose
  // digit can be worked out (nextPlacement: candidate-only steps are worked through
  // internally) and highlights it, without its digit.
  const [hint, setHint] = useState<HintView | null>(null);

  const requestHint = useCallback(() => {
    // Hints reason from committed entries as if they're correct, so a contradiction
    // makes the candidate analysis unsound — steer the player to fix conflicts first.
    if (conflictCells.size > 0) {
      setHint({ kind: "message", text: "Fix the conflicting cells first — hints assume your entries are correct." });
      return;
    }
    const canon = { room_width: roomWidth, room_height: roomHeight, hints };
    const step = nextPlacement(1, canon, userValues);
    if (step?.placement) {
      setHint({ kind: "cell", cellId: step.placement.cell });
      return;
    }
    const complete = hints.every((row, r) => row.every((v, c) => v > 0 || (userValues[`${c},${r}`] ?? 0) > 0));
    setHint({ kind: "message", text: complete ? "The board is already complete." : "No hint is available from here." });
  }, [conflictCells, hints, roomWidth, roomHeight, userValues]);

  // A hint reflects a specific board; once the player changes it, drop the stale hint.
  const userValuesAtHint = useRef(userValues);
  useEffect(() => {
    if (hint && userValues !== userValuesAtHint.current) setHint(null);
    userValuesAtHint.current = userValues;
  }, [userValues, hint]);

  // Cells to tint for the current hint.
  const hintFocusKeys = useMemo(() => {
    if (!hint) return new Set<string>();
    return hint.kind === "cell" ? new Set([idToKey(hint.cellId)]) : new Set<string>();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint, n]);

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

  // Above 9x9 a number takes one or two keys ("1", "2" -> 12).
  const typed = useTypedNumber(n, enterValue);
  const { key: typeKey, reset: resetTyped } = typed;
  useEffect(() => resetTyped(), [activeCell, resetTyped]);

  useEffect(() => {
    if (!activeCell) return;
    function handleKey(e: KeyboardEvent) {
      const digit = parseInt(e.key, 10);
      if (big && /^[0-9]$/.test(e.key)) {
        typeKey(e.key);
      } else if (digit >= 1 && digit <= 9) {
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
  }, [activeCell, activeHasAnswer, big, typeKey, enterValue, clearValue]);

  function handleCellClick(key: string) {
    if (hintCells.has(key)) return;
    setActiveCell((prev) => (prev === key ? null : key));
  }

  // Room borders: vertical every roomWidth columns, horizontal every roomHeight rows.
  const stroke = (i: number, room: number) =>
    i === 0 || i === n ? THICK : i % room === 0 ? MEDIUM : THIN;
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
        strokeWidth={stroke(i, roomHeight)}
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
        strokeWidth={stroke(i, roomWidth)}
      />
    );
  }

  // The number pad (mobile, or any board above 9x9) is fixed to the bottom of the
  // window; leave room so it never hides the last rows.
  const showPad = activeCell != null && (isMobile || big);
  const padRows = big ? Math.ceil((n + 3) / (isMobile ? 8 : 13)) : 1;

  return (
    <div style={{ maxWidth: width, width: "100%", paddingBottom: showPad ? padRows * 42 + 24 : 0 }}>
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
            background: hint.kind === "message" ? "#fff8e1" : "#e3f2fd",
            border: `1px solid ${hint.kind === "message" ? "#ffe082" : "#90caf9"}`,
            borderRadius: 6,
            fontSize: "0.85rem",
            lineHeight: 1.4,
          }}
        >
          {hint.kind === "cell" && (
            <>
              <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>Next cell: {cellLabel(hint.cellId, n)}</div>
              <div style={{ color: "#333" }}>Its digit can be worked out from the board as it stands.</div>
            </>
          )}
          {hint.kind === "message" && <div style={{ color: "#333" }}>{hint.text}</div>}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
      <svg
        width={isMobile && big ? (n * MIN_MOBILE_CELL_PX * width) / (n * CELL_SIZE) : "100%"}
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
          {/* Hint highlight: the next cell to fill, in amber. Drawn beneath the
              peer-highlight so an active cell still reads clearly. */}
          {hint?.kind === "cell" && (
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
                    fill="#fff59d"
                    fillOpacity={0.8}
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
          {Array.from({ length: n * n }, (_, i) => {
            const col = i % n;
            const row = Math.floor(i / n);
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

          {/* Pencil-mark notes: small grey digits laid out like a room (3x3 on a
              9x9: 1 2 3 / 4 5 6 / 7 8 9; roomWidth x roomHeight above). Hidden once
              the cell holds an answer/hint. */}
          {Object.entries(notes).map(([key, set]) => {
            const [col, row] = key.split(",").map(Number);
            if (hintCells.has(key) || (userValues[key] ?? 0) > 0) return null;
            const slotW = CELL_SIZE / roomWidth;
            const slotH = CELL_SIZE / roomHeight;
            return Array.from(set).map((digit) => {
              const sub = digit - 1;
              const sx = col * CELL_SIZE + ((sub % roomWidth) + 0.5) * slotW;
              const sy = row * CELL_SIZE + (Math.floor(sub / roomWidth) + 0.5) * slotH;
              return (
                <text
                  key={`note-${key}-${digit}`}
                  x={sx}
                  y={sy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.min(slotH * 0.8, slotW * (digit > 9 ? 0.8 : 1.3))}
                  fontFamily="sans-serif"
                  fill="#999"
                  pointerEvents="none"
                >
                  {digit}
                </text>
              );
            });
          })}


          {/* Digits typed so far on a big board, while waiting for a second key. */}
          {activeCell && typed.pending && (() => {
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
                {typed.pending}
              </text>
            );
          })()}

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

          {/* Radial input menu (desktop 9x9 only; mobile and bigger boards use the
              DigitBar below) */}
          {activeCell && !isMobile && !big && (() => {
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
      </div>

      {/* Number pad: mobile, and every board above 9x9 */}
      {activeCell && showPad && (
        <DigitBar
          max={n}
          marked={effectiveNoteMode ? notes[activeCell] : undefined}
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
