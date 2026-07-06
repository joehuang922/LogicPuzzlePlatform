import { useState, useEffect, useCallback, useMemo } from "react";

interface SudokuBoardProps {
  hints: number[][];
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
}

const CELL_SIZE = 40;
const PAD = CELL_SIZE;
const THIN = 1;
const MEDIUM = 2;
const THICK = 3;
const RADIAL_RADIUS = 44;
const CIRCLE_RADIUS = 13;

export default function SudokuBoard({ hints, initialUserValues, onValuesChange }: SudokuBoardProps) {
  const width = 9 * CELL_SIZE + PAD * 2;
  const height = 9 * CELL_SIZE + PAD * 2;

  const [userValues, setUserValues] = useState<Record<string, number>>(initialUserValues ?? {});
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  useEffect(() => {
    onValuesChange?.(userValues);
  }, [userValues, onValuesChange]);

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

  const highlightSource = activeCell ?? hoveredCell;
  const highlightedCells = useMemo(() => {
    if (!highlightSource) return new Set<string>();
    return peerMap.get(highlightSource) ?? new Set<string>();
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

  const radialPositions = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * 36 - 90) * (Math.PI / 180);
    return { x: Math.cos(angle) * RADIAL_RADIUS, y: Math.sin(angle) * RADIAL_RADIUS };
  });

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
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ border: "1px solid #ccc", outline: "none", userSelect: "none" }}
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
            return (
              <text
                key={`hint-${rowIdx}-${colIdx}`}
                x={colIdx * CELL_SIZE + CELL_SIZE / 2}
                y={rowIdx * CELL_SIZE + CELL_SIZE / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={20}
                fontFamily="sans-serif"
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

        {/* Radial input menu */}
        {activeCell && (() => {
          const [col, row] = activeCell.split(",").map(Number);
          const cx = col * CELL_SIZE + CELL_SIZE / 2;
          const cy = row * CELL_SIZE + CELL_SIZE / 2;
          return (
            <g>
              <rect
                x={-PAD}
                y={-PAD}
                width={width}
                height={height}
                fill="transparent"
                onClick={() => setActiveCell(null)}
                onContextMenu={(e) => { e.preventDefault(); setActiveCell(null); }}
              />
              <circle
                cx={cx}
                cy={cy}
                r={RADIAL_RADIUS + CIRCLE_RADIUS + 4}
                fill="white"
                fillOpacity={0.9}
                stroke="#ccc"
                strokeWidth={1}
              />
              {radialPositions.map((pos, i) => {
                const isErase = i === 0;
                const digit = i;
                return (
                  <g
                    key={`rad-${i}`}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isErase) {
                        clearValue();
                      } else {
                        enterValue(digit);
                      }
                    }}
                  >
                    <circle
                      cx={cx + pos.x}
                      cy={cy + pos.y}
                      r={CIRCLE_RADIUS}
                      fill="white"
                      stroke={isErase ? "#c62828" : "#666"}
                      strokeWidth={1.5}
                    />
                    {isErase ? (
                      <g pointerEvents="none">
                        <line
                          x1={cx + pos.x - 5}
                          y1={cy + pos.y - 5}
                          x2={cx + pos.x + 5}
                          y2={cy + pos.y + 5}
                          stroke="#c62828"
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                        <line
                          x1={cx + pos.x + 5}
                          y1={cy + pos.y - 5}
                          x2={cx + pos.x - 5}
                          y2={cy + pos.y + 5}
                          stroke="#c62828"
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      </g>
                    ) : (
                      <text
                        x={cx + pos.x}
                        y={cy + pos.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={14}
                        fontFamily="sans-serif"
                        fill="#444"
                        pointerEvents="none"
                      >
                        {digit}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })()}
      </g>
    </svg>
  );
}
