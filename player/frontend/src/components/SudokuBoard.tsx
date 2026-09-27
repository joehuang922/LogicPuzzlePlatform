import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import DigitBar from "./DigitBar";
import RadialInput from "./RadialInput";

interface SudokuBoardProps {
  hints: number[][];
  initialUserValues?: Record<string, number>;
  // Pencil-mark candidates keyed by "col,row"; each an ascending digit list.
  initialNotes?: Record<string, number[]>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  liveValidate?: boolean;
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

export default function SudokuBoard({ hints, initialUserValues, initialNotes, onValuesChange, onComplete, liveValidate }: SudokuBoardProps) {
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
