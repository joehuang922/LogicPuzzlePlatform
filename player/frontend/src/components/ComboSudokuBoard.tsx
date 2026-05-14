import { useState, useEffect, useCallback, useMemo } from "react";

interface Subboard {
  x: number;
  y: number;
  hints: number[][];
}

interface ComboSudokuBoardProps {
  subboards: Subboard[];
}

const CELL_SIZE = 40;
const PAD = CELL_SIZE;
const THIN = 1;
const MEDIUM = 2;
const THICK = 3;
const RADIAL_RADIUS = 44;
const CIRCLE_RADIUS = 13;

export default function ComboSudokuBoard({ subboards }: ComboSudokuBoardProps) {
  const totalCols = Math.max(...subboards.map((sb) => 3 * sb.x + 9));
  const totalRows = Math.max(...subboards.map((sb) => 3 * sb.y + 9));
  const width = totalCols * CELL_SIZE + PAD * 2;
  const height = totalRows * CELL_SIZE + PAD * 2;

  const [userValues, setUserValues] = useState<Record<string, number>>({});
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

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

  const radialPositions = Array.from({ length: 10 }, (_, i) => {
    const angle = (i * 36 - 90) * (Math.PI / 180);
    return { x: Math.cos(angle) * RADIAL_RADIUS, y: Math.sin(angle) * RADIAL_RADIUS };
  });

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
      {/* Highlight layer (behind grid lines) */}
      {highlightSource && (
        <g>
          {/* Highlight the source cell itself */}
          <rect
            x={parseInt(highlightSource.split(",")[0]) * CELL_SIZE + 1}
            y={parseInt(highlightSource.split(",")[1]) * CELL_SIZE + 1}
            width={CELL_SIZE - 2}
            height={CELL_SIZE - 2}
            fill="#bbdefb"
            fillOpacity={0.6}
          />
          {/* Highlight peer cells */}
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

      {/* Radial input menu */}
      {activeCell && (() => {
        const [col, row] = activeCell.split(",").map(Number);
        const cx = col * CELL_SIZE + CELL_SIZE / 2;
        const cy = row * CELL_SIZE + CELL_SIZE / 2;
        return (
          <g>
            {/* Backdrop to dismiss */}
            <rect
              x={-PAD}
              y={-PAD}
              width={width}
              height={height}
              fill="transparent"
              onClick={() => setActiveCell(null)}
              onContextMenu={(e) => { e.preventDefault(); setActiveCell(null); }}
            />
            {/* Semi-transparent background circle */}
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
              const digit = i; // positions 1–9 map to digits 1–9
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
