import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useBoardUiState } from "../hooks/useBoardUiState";
import { useIsMobile } from "../hooks/useIsMobile";
import DigitBar from "./DigitBar";
import RadialInput from "./RadialInput";
import { UnequalSudokuCanon } from "../types/canon";
import {
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

interface UnequalSudokuBoardProps {
  canon: UnequalSudokuCanon;
  initialUserValues?: Record<string, number>;
  // Pencil-mark candidates keyed by "col,row"; each an ascending digit list.
  initialNotes?: Record<string, number[]>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  liveValidate?: boolean;
  readonly?: boolean;
}

const PAD = GAP_CELL;
const RED = "#d32f2f";

/** Does `a <sign> b` hold? sign 1: a < b, 2: a > b. An empty cell (0) never breaks it. */
export function signHolds(sign: number, a: number, b: number): boolean {
  if (a === 0 || b === 0) return true;
  if (sign === 1) return a < b;
  if (sign === 2) return a > b;
  return true;
}

/**
 * Conflicts on a (partly) filled 9x9 grid: cells repeating a digit in a row, column or
 * box, or sitting on either side of a broken sign; and the broken signs themselves,
 * keyed "r:row,col" (right gap) / "d:row,col" (down gap).
 */
export function unequalSudokuConflicts(
  grid: number[][],
  canon: UnequalSudokuCanon
): { cells: Set<string>; signs: Set<string> } {
  const cells = new Set<string>();
  const signs = new Set<string>();
  const groups: [number, number][][] = [];
  for (let i = 0; i < 9; i++) {
    groups.push(Array.from({ length: 9 }, (_, j) => [i, j] as [number, number]));
    groups.push(Array.from({ length: 9 }, (_, j) => [j, i] as [number, number]));
    const br = Math.floor(i / 3) * 3;
    const bc = (i % 3) * 3;
    groups.push(Array.from({ length: 9 }, (_, j) => [br + Math.floor(j / 3), bc + (j % 3)] as [number, number]));
  }
  for (const group of groups) {
    const seen = new Map<number, [number, number][]>();
    for (const [r, c] of group) {
      const v = grid[r][c];
      if (!v) continue;
      if (!seen.has(v)) seen.set(v, []);
      seen.get(v)!.push([r, c]);
    }
    for (const list of seen.values()) {
      if (list.length > 1) list.forEach(([r, c]) => cells.add(`${c},${r}`));
    }
  }
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (c < 8 && !signHolds(canon.right[r]?.[c] ?? 0, grid[r][c], grid[r][c + 1])) {
        signs.add(`r:${r},${c}`);
        cells.add(`${c},${r}`);
        cells.add(`${c + 1},${r}`);
      }
      if (r < 8 && !signHolds(canon.down[r]?.[c] ?? 0, grid[r][c], grid[r + 1][c])) {
        signs.add(`d:${r},${c}`);
        cells.add(`${c},${r}`);
        cells.add(`${c},${r + 1}`);
      }
    }
  }
  return { cells, signs };
}

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

export default function UnequalSudokuBoard({
  canon,
  initialUserValues,
  initialNotes,
  onValuesChange,
  onComplete,
  liveValidate,
  readonly,
}: UnequalSudokuBoardProps) {
  const { hints } = canon;
  const isMobile = useIsMobile();
  const width = GAP_BOARD + PAD * 2;
  const height = GAP_BOARD + PAD * 2;

  const [userValues, setUserValues] = useState<Record<string, number>>(initialUserValues ?? {});
  const [notes, setNotes] = useState<Record<string, Set<number>>>(() => notesFromInitial(initialNotes));
  const [noteMode, setNoteMode] = useBoardUiState("unequalSudoku.noteMode", false);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // One flat map: answers under "col,row", note flags under "n:col,row:digit" -> 1.
  useEffect(() => {
    const flat: Record<string, number> = { ...userValues };
    for (const [key, set] of Object.entries(notes)) {
      if (userValues[key] != null && userValues[key] > 0) continue;
      for (const digit of set) flat[`n:${key}:${digit}`] = 1;
    }
    onValuesChange?.(flat);
  }, [userValues, notes, onValuesChange]);

  const hintCells = useMemo(() => {
    const set = new Set<string>();
    for (let row = 0; row < 9; row++)
      for (let col = 0; col < 9; col++) if (hints[row]?.[col] > 0) set.add(`${col},${row}`);
    return set;
  }, [hints]);

  const grid = useMemo(
    () =>
      Array.from({ length: 9 }, (_, row) =>
        Array.from({ length: 9 }, (_, col) => {
          const hint = hints[row]?.[col] ?? 0;
          return hint > 0 ? hint : userValues[`${col},${row}`] ?? 0;
        })
      ),
    [hints, userValues]
  );

  const conflicts = useMemo(() => unequalSudokuConflicts(grid, canon), [grid, canon]);

  const completedRef = useRef(false);
  useEffect(() => {
    if (completedRef.current || readonly) return;
    const full = grid.every((row) => row.every((v) => v > 0));
    if (full && conflicts.cells.size === 0 && conflicts.signs.size === 0) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [grid, conflicts, onComplete, readonly]);

  const highlightSource = activeCell ?? hoveredCell;
  const highlightedCells = useMemo(() => {
    const set = new Set<string>();
    if (!highlightSource) return set;
    const [col, row] = highlightSource.split(",").map(Number);
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 9; i++) {
      set.add(`${i},${row}`);
      set.add(`${col},${i}`);
      set.add(`${bc + (i % 3)},${br + Math.floor(i / 3)}`);
    }
    set.delete(highlightSource);
    return set;
  }, [highlightSource]);

  const activeHasAnswer = activeCell != null && (userValues[activeCell] ?? 0) > 0;
  const effectiveNoteMode = noteMode && !activeHasAnswer;

  const enterValue = useCallback(
    (digit: number) => {
      if (!activeCell) return;
      if (noteMode && (userValues[activeCell] ?? 0) === 0) {
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
      if (digit >= 1 && digit <= 9) enterValue(digit);
      else if (e.key === "Backspace" || e.key === "Delete") clearValue();
      else if (e.key === "Escape") setActiveCell(null);
      else if (e.key === "n" || e.key === "N") {
        if (!activeHasAnswer) setNoteMode((m) => !m);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeCell, activeHasAnswer, enterValue, clearValue, setNoteMode]);

  function handleCellClick(key: string) {
    if (readonly || hintCells.has(key)) return;
    setActiveCell((prev) => (prev === key ? null : key));
  }

  const showConflicts = !!liveValidate && !readonly;

  const cellFill = (key: string) => {
    if (key === highlightSource) return "#bbdefb";
    if (highlightedCells.has(key)) return "#e8f2fc";
    return "white";
  };

  return (
    <div style={{ maxWidth: width, width: "100%", paddingBottom: isMobile && activeCell ? 60 : 0 }}>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ outline: "none", userSelect: "none", display: "block", background: "white" }}
        tabIndex={0}
        onContextMenu={(e) => {
          if (activeCell) {
            e.preventDefault();
            setActiveCell(null);
          }
        }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <BoxPlates />

          {/* Cells: white squares with a thin outline; also the click targets. */}
          {Array.from({ length: 81 }, (_, i) => {
            const col = i % 9;
            const row = Math.floor(i / 9);
            const key = `${col},${row}`;
            const isHint = hintCells.has(key);
            return (
              <rect
                key={`cell-${key}`}
                x={cellX(col)}
                y={cellY(row)}
                width={GAP_CELL}
                height={GAP_CELL}
                fill={cellFill(key)}
                stroke="#3a2430"
                strokeWidth={1.2}
                style={{ cursor: readonly || isHint ? "default" : "pointer" }}
                onMouseEnter={() => {
                  if (!activeCell && !readonly) setHoveredCell(key);
                }}
                onMouseLeave={() => {
                  if (!activeCell && !readonly) setHoveredCell(null);
                }}
                onClick={() => handleCellClick(key)}
              />
            );
          })}

          {/* Inequality signs */}
          {Array.from({ length: 9 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => {
              const { x, y } = rightGapCenter(r, c);
              return (
                <InequalitySign
                  key={`r-${r}-${c}`}
                  cx={x}
                  cy={y}
                  horizontal
                  sign={canon.right[r]?.[c] ?? 0}
                  color={showConflicts && conflicts.signs.has(`r:${r},${c}`) ? RED : undefined}
                />
              );
            })
          )}
          {Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => {
              const { x, y } = downGapCenter(r, c);
              return (
                <InequalitySign
                  key={`d-${r}-${c}`}
                  cx={x}
                  cy={y}
                  horizontal={false}
                  sign={canon.down[r]?.[c] ?? 0}
                  color={showConflicts && conflicts.signs.has(`d:${r},${c}`) ? RED : undefined}
                />
              );
            })
          )}

          {/* Givens */}
          {hints.map((rowArr, row) =>
            rowArr.map((val, col) => {
              if (val <= 0) return null;
              const key = `${col},${row}`;
              return (
                <text
                  key={`hint-${key}`}
                  x={cellCx(col)}
                  y={cellCy(row)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={22}
                  fontWeight="bold"
                  fontFamily="sans-serif"
                  fill={showConflicts && conflicts.cells.has(key) ? RED : "black"}
                  pointerEvents="none"
                >
                  {val}
                </text>
              );
            })
          )}

          {/* Pencil-mark notes in a 3x3 sub-layout. */}
          {Object.entries(notes).map(([key, set]) => {
            if (hintCells.has(key) || (userValues[key] ?? 0) > 0) return null;
            const [col, row] = key.split(",").map(Number);
            const third = GAP_CELL / 3;
            return Array.from(set).map((digit) => {
              const sub = digit - 1;
              return (
                <text
                  key={`note-${key}-${digit}`}
                  x={cellX(col) + ((sub % 3) + 0.5) * third}
                  y={cellY(row) + (Math.floor(sub / 3) + 0.5) * third}
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

          {/* Player digits */}
          {Object.entries(userValues).map(([key, val]) => {
            if (activeCell === key || hintCells.has(key)) return null;
            const [col, row] = key.split(",").map(Number);
            return (
              <text
                key={`uv-${key}`}
                x={cellCx(col)}
                y={cellCy(row)}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={22}
                fontFamily="sans-serif"
                fill={showConflicts && conflicts.cells.has(key) ? RED : "#888"}
                pointerEvents="none"
              >
                {val}
              </text>
            );
          })}

          {/* Radial input menu (desktop only; mobile uses the DigitBar below) */}
          {activeCell &&
            !isMobile &&
            (() => {
              const [col, row] = activeCell.split(",").map(Number);
              return (
                <RadialInput
                  cx={cellCx(col)}
                  cy={cellCy(row)}
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
