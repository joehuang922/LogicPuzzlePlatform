import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useIsMobile } from "../hooks/useIsMobile";
import DigitBar from "./DigitBar";
import RadialInput from "./RadialInput";
import { comboGeometry, nextPlacement } from "@puzzle/solver";

interface Subboard {
  x: number;
  y: number;
  hints: number[][];
}

interface ComboSudokuBoardProps {
  subboards: Subboard[];
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  /** Show the Hint button (the play page; not the admin previews). */
  hintable?: boolean;
}

// The hint: the next cell to fill (its digit is never shown), or a plain message.
type HintView = { kind: "cell"; key: string; label: string } | { kind: "message"; text: string };

const CELL_SIZE = 40;
const PAD = CELL_SIZE;
const THIN = 1;
const MEDIUM = 2;
const THICK = 3;

export default function ComboSudokuBoard({ subboards, initialUserValues, onValuesChange, onComplete, hintable }: ComboSudokuBoardProps) {
  const isMobile = useIsMobile();
  const totalCols = Math.max(...subboards.map((sb) => 3 * sb.x + 9));
  const totalRows = Math.max(...subboards.map((sb) => 3 * sb.y + 9));
  const width = totalCols * CELL_SIZE + PAD * 2;
  const height = totalRows * CELL_SIZE + PAD * 2;

  const [userValues, setUserValues] = useState<Record<string, number>>(initialUserValues ?? {});
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const completedRef = useRef(false);

  useEffect(() => {
    onValuesChange?.(userValues);
  }, [userValues, onValuesChange]);

  useEffect(() => {
    if (completedRef.current) return;

    // Check all cells are filled and no conflicts exist
    const filledGrid = new Map<string, number>();
    for (const sb of subboards) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const key = `${3 * sb.x + col},${3 * sb.y + row}`;
          const hint = sb.hints[row]?.[col] ?? 0;
          const val = hint > 0 ? hint : (userValues[key] ?? 0);
          if (val === 0) return;
          filledGrid.set(key, val);
        }
      }
    }

    // Validate each subboard's rows, columns, and 3x3 boxes
    for (const sb of subboards) {
      const ox = 3 * sb.x;
      const oy = 3 * sb.y;

      for (let row = 0; row < 9; row++) {
        const rowVals = new Set<number>();
        for (let col = 0; col < 9; col++) {
          const val = filledGrid.get(`${ox + col},${oy + row}`)!;
          if (rowVals.has(val)) return;
          rowVals.add(val);
        }
      }

      for (let col = 0; col < 9; col++) {
        const colVals = new Set<number>();
        for (let row = 0; row < 9; row++) {
          const val = filledGrid.get(`${ox + col},${oy + row}`)!;
          if (colVals.has(val)) return;
          colVals.add(val);
        }
      }

      for (let boxR = 0; boxR < 3; boxR++) {
        for (let boxC = 0; boxC < 3; boxC++) {
          const boxVals = new Set<number>();
          for (let r = boxR * 3; r < boxR * 3 + 3; r++) {
            for (let c = boxC * 3; c < boxC * 3 + 3; c++) {
              const val = filledGrid.get(`${ox + c},${oy + r}`)!;
              if (boxVals.has(val)) return;
              boxVals.add(val);
            }
          }
        }
      }
    }

    completedRef.current = true;
    onComplete?.();
  }, [userValues, subboards, onComplete]);

  const hintCells = useMemo(() => {
    const set = new Set<string>();
    for (const sb of subboards) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const val = sb.hints[row]?.[col];
          if (val && val > 0) {
            set.add(`${3 * sb.x + col},${3 * sb.y + row}`);
          }
        }
      }
    }
    return set;
  }, [subboards]);

  /** Givens by global "col,row" key, merged across boards. */
  const givens = useMemo(() => {
    const map = new Map<string, number>();
    for (const sb of subboards) {
      sb.hints.forEach((line, row) =>
        line.forEach((v, col) => {
          if (v > 0) map.set(`${3 * sb.x + col},${3 * sb.y + row}`, v);
        })
      );
    }
    return map;
  }, [subboards]);

  const cellsInBoard = useMemo(() => {
    const set = new Set<string>();
    for (const sb of subboards) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          set.add(`${3 * sb.x + col},${3 * sb.y + row}`);
        }
      }
    }
    return set;
  }, [subboards]);

  // Precompute peers: for each global cell, the set of all global cells
  // sharing a row, column, or 3x3 room in any subboard containing it.
  const peerMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const sb of subboards) {
      const ox = 3 * sb.x;
      const oy = 3 * sb.y;
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          const key = `${ox + col},${oy + row}`;
          if (!map.has(key)) map.set(key, new Set());
          const peers = map.get(key)!;
          // Same row in this subboard
          for (let c = 0; c < 9; c++) {
            if (c !== col) peers.add(`${ox + c},${oy + row}`);
          }
          // Same column in this subboard
          for (let r = 0; r < 9; r++) {
            if (r !== row) peers.add(`${ox + col},${oy + r}`);
          }
          // Same 3x3 room in this subboard
          const roomStartCol = Math.floor(col / 3) * 3;
          const roomStartRow = Math.floor(row / 3) * 3;
          for (let r = roomStartRow; r < roomStartRow + 3; r++) {
            for (let c = roomStartCol; c < roomStartCol + 3; c++) {
              if (r !== row || c !== col) peers.add(`${ox + c},${oy + r}`);
            }
          }
        }
      }
    }
    return map;
  }, [subboards]);

  // --- Hint (docs/combo-sudoku) -------------------------------------------------
  // The sudoku ladder over the whole layout (nextPlacement on type 2): highlights the
  // next cell whose digit can be worked out, never the digit itself.
  const [hint, setHint] = useState<HintView | null>(null);

  const requestHint = useCallback(() => {
    // Hints take the entries as right, so a clash makes them unsound: fix it first.
    const valueAt = (key: string) => givens.get(key) ?? userValues[key] ?? 0;
    for (const key of Object.keys(userValues)) {
      const val = valueAt(key);
      if (val > 0 && [...(peerMap.get(key) ?? [])].some((peer) => valueAt(peer) === val)) {
        setHint({ kind: "message", text: "Fix the conflicting cells first — hints assume your entries are correct." });
        return;
      }
    }
    const canon = { subboards };
    const step = nextPlacement(2, canon, userValues);
    if (step?.placement) {
      const geo = comboGeometry(canon);
      setHint({ kind: "cell", key: geo.key(step.placement.cell), label: geo.cellLabel(step.placement.cell) });
      return;
    }
    const complete = [...cellsInBoard].every((k) => hintCells.has(k) || (userValues[k] ?? 0) > 0);
    setHint({ kind: "message", text: complete ? "The board is already complete." : "No hint is available from here." });
  }, [userValues, peerMap, givens, hintCells, cellsInBoard, subboards]);

  // A hint reflects a specific board; once the player changes it, drop the stale hint.
  const userValuesAtHint = useRef(userValues);
  useEffect(() => {
    if (hint && userValues !== userValuesAtHint.current) setHint(null);
    userValuesAtHint.current = userValues;
  }, [userValues, hint]);

  const highlightSource = activeCell ?? hoveredCell;
  const highlightedCells = useMemo(() => {
    if (!highlightSource) return new Set<string>();
    const peers = peerMap.get(highlightSource);
    return peers ?? new Set<string>();
  }, [highlightSource, peerMap]);

  const enterValue = useCallback(
    (digit: number) => {
      if (!activeCell) return;
      setUserValues((prev) => ({ ...prev, [activeCell]: digit }));
      setActiveCell(null);
    },
    [activeCell]
  );

  const clearValue = useCallback(() => {
    if (!activeCell) return;
    setUserValues((prev) => {
      const next = { ...prev };
      delete next[activeCell];
      return next;
    });
    setActiveCell(null);
  }, [activeCell]);

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
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeCell, enterValue, clearValue]);

  function handleCellClick(key: string) {
    if (hintCells.has(key)) return;
    setActiveCell((prev) => (prev === key ? null : key));
  }

  const renderedHints = new Set<string>();

  return (
    <div style={{ maxWidth: width, width: "100%", paddingBottom: isMobile && activeCell ? 60 : 0 }}>
      {hintable && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <button onClick={requestHint} style={hintButtonStyle} title="Highlight the next cell whose digit can be worked out">
            Hint
          </button>
          {hint && (
            <button onClick={() => setHint(null)} style={clearButtonStyle}>
              Clear hint
            </button>
          )}
        </div>
      )}
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
          {hint.kind === "cell" ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: "0.2rem" }}>Next cell: {hint.label}</div>
              <div style={{ color: "#333" }}>Its digit can be worked out from the board as it stands.</div>
            </>
          ) : (
            <div style={{ color: "#333" }}>{hint.text}</div>
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
        {/* Hint highlight: the next cell to fill, in amber. */}
        {hint?.kind === "cell" && (() => {
          const [col, row] = hint.key.split(",").map(Number);
          return (
            <rect
              x={col * CELL_SIZE + 1}
              y={row * CELL_SIZE + 1}
              width={CELL_SIZE - 2}
              height={CELL_SIZE - 2}
              fill="#fff59d"
              fillOpacity={0.8}
            />
          );
        })()}
        {/* Highlight layer (behind grid lines) */}
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
              if (!cellsInBoard.has(key)) return null;
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

        {subboards.map((sb, idx) => {
          const ox = 3 * sb.x * CELL_SIZE;
          const oy = 3 * sb.y * CELL_SIZE;
          const cellLines: JSX.Element[] = [];
          const roomLines: JSX.Element[] = [];
          const hints: JSX.Element[] = [];

          for (let i = 0; i <= 9; i++) {
            const isBorder = i === 0 || i === 9;
            const isRoom = i % 3 === 0 && !isBorder;
            const strokeWidth = isBorder ? THICK : isRoom ? MEDIUM : THIN;
            const target = isBorder ? roomLines : isRoom ? roomLines : cellLines;

            target.push(
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
            target.push(
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
              const val = sb.hints[row]?.[col];
              if (val && val > 0) {
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
                      fontSize={20}
                      fontFamily="sans-serif"
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
              {cellLines}
              {roomLines}
              {hints}
            </g>
          );
        })}

        {/* Hover/click targets for all board cells */}
        {Array.from(cellsInBoard).map((key) => {
          const [col, row] = key.split(",").map(Number);
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
              fill="#888"
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
        />
      )}
    </div>
  );
}

const hintButtonStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  padding: "0.35rem 0.9rem",
  background: "#1976d2",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const clearButtonStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  padding: "0.35rem 0.9rem",
  background: "#f0f0f0",
  border: "1px solid #ccc",
  borderRadius: 4,
  cursor: "pointer",
};
