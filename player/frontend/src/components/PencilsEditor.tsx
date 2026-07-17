import { useState, useRef, useEffect, useCallback } from "react";

interface PencilsEditorProps {
  initialCanon?: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 16;

function PencilHead({
  cx,
  cy,
  dir,
  size,
  tipFill,
}: {
  cx: number;
  cy: number;
  dir: number;
  size: number;
  tipFill: string;
}) {
  let angle = 0;
  switch (dir) {
    case -1: angle = 180; break;
    case -2: angle = 0; break;
    case -3: angle = 90; break;
    case -4: angle = -90; break;
  }
  const x0 = cx - size / 2;
  const y0 = cy - size / 2;
  const outerPts = `${x0},${y0} ${x0 + size},${y0} ${x0 + size * 0.5},${y0 + size * 0.5}`;
  const innerPts = `${x0 + size * 0.3},${y0 + size * 0.3} ${x0 + size * 0.7},${y0 + size * 0.3} ${x0 + size * 0.5},${y0 + size * 0.5}`;
  return (
    <g transform={`rotate(${angle}, ${cx}, ${cy})`} pointerEvents="none">
      <polygon points={outerPts} fill="white" stroke={tipFill} strokeWidth={1} />
      <polygon points={innerPts} fill={tipFill} />
    </g>
  );
}

const DIR_LABELS: { dir: number; label: string; title: string }[] = [
  { dir: -1, label: "▲", title: "Up" },
  { dir: -2, label: "▼", title: "Down" },
  { dir: -3, label: "◀", title: "Left" },
  { dir: -4, label: "▶", title: "Right" },
];

export default function PencilsEditor({
  initialCanon,
  onComplete,
  onCancel,
}: PencilsEditorProps) {
  let initRows = 7,
    initCols = 7;
  let initCells: number[][] | null = null;
  if (initialCanon) {
    try {
      const parsed = JSON.parse(initialCanon);
      if (parsed.cells) {
        initCells = parsed.cells;
        initRows = parsed.cells.length;
        initCols = parsed.cells[0].length;
      }
    } catch {
      /* ignore */
    }
  }

  const [rows, setRows] = useState(initRows);
  const [cols, setCols] = useState(initCols);
  const [cells, setCells] = useState<number[][]>(
    initCells ??
      Array.from({ length: initRows }, () => Array(initCols).fill(0))
  );
  const [focused, setFocused] = useState<{ r: number; c: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  function resizeGrid(newRows: number, newCols: number) {
    const newCells = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) =>
        r < cells.length && c < cells[0].length ? cells[r][c] : 0
      )
    );
    setRows(newRows);
    setCols(newCols);
    setCells(newCells);
    if (focused && (focused.r >= newRows || focused.c >= newCols)) {
      setFocused(null);
    }
  }

  function setCellValue(r: number, c: number, val: number) {
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = val;
      return next;
    });
  }

  function handleCellClick(r: number, c: number) {
    setFocused({ r, c });
  }

  function handleSetDirection(dir: number) {
    if (!focused) return;
    setCellValue(focused.r, focused.c, dir);
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!focused) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setCellValue(focused.r, focused.c, 0);
        return;
      }

      if (e.key === "Escape") {
        setFocused(null);
        return;
      }

      if (e.key === "ArrowUp" && focused.r > 0) {
        e.preventDefault();
        setFocused({ r: focused.r - 1, c: focused.c });
        return;
      }
      if (e.key === "ArrowDown" && focused.r < rows - 1) {
        e.preventDefault();
        setFocused({ r: focused.r + 1, c: focused.c });
        return;
      }
      if (e.key === "ArrowLeft" && focused.c > 0) {
        e.preventDefault();
        setFocused({ r: focused.r, c: focused.c - 1 });
        return;
      }
      if (e.key === "ArrowRight" && focused.c < cols - 1) {
        e.preventDefault();
        setFocused({ r: focused.r, c: focused.c + 1 });
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const current = cells[focused.r][focused.c];
        const digit = Number(e.key);
        let newVal: number;
        if (current > 0) {
          newVal = current * 10 + digit;
        } else {
          newVal = digit;
        }
        setCellValue(focused.r, focused.c, newVal);
      }
    },
    [focused, cells, rows, cols]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function handleDone() {
    onComplete(JSON.stringify({ cells }, null, 2));
  }

  const jsonStr = JSON.stringify({ cells }, null, 2);

  function handleJsonChange(value: string) {
    try {
      const parsed = JSON.parse(value);
      if (parsed.cells && Array.isArray(parsed.cells)) {
        setCells(parsed.cells);
        setRows(parsed.cells.length);
        setCols(parsed.cells[0].length);
      }
    } catch {
      /* ignore invalid JSON while typing */
    }
  }

  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label>
          Rows:{" "}
          <input
            type="number"
            min={1}
            max={100}
            value={rows}
            onChange={(e) => resizeGrid(Number(e.target.value) || 1, cols)}
            style={{ width: 50 }}
          />
        </label>
        <label>
          Cols:{" "}
          <input
            type="number"
            min={1}
            max={100}
            value={cols}
            onChange={(e) => resizeGrid(rows, Number(e.target.value) || 1)}
            style={{ width: 50 }}
          />
        </label>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>
          Click cell to select, type number, Delete to clear, arrows to move
        </span>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <svg
            ref={svgRef}
            width={Math.min(svgWidth, 500)}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{
              border: "1px solid #ccc",
              userSelect: "none",
              display: "block",
            }}
            tabIndex={0}
          >
            <g transform={`translate(${PAD},${PAD})`}>
              <rect
                x={0}
                y={0}
                width={cols * CELL_SIZE}
                height={rows * CELL_SIZE}
                fill="none"
                stroke="#222"
                strokeWidth={2}
              />
              {Array.from({ length: rows - 1 }, (_, i) => (
                <line
                  key={`gh-${i}`}
                  x1={0}
                  y1={(i + 1) * CELL_SIZE}
                  x2={cols * CELL_SIZE}
                  y2={(i + 1) * CELL_SIZE}
                  stroke="#bbb"
                  strokeWidth={0.5}
                  strokeDasharray="4 3"
                />
              ))}
              {Array.from({ length: cols - 1 }, (_, i) => (
                <line
                  key={`gv-${i}`}
                  x1={(i + 1) * CELL_SIZE}
                  y1={0}
                  x2={(i + 1) * CELL_SIZE}
                  y2={rows * CELL_SIZE}
                  stroke="#bbb"
                  strokeWidth={0.5}
                  strokeDasharray="4 3"
                />
              ))}

              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const cx = (c + 0.5) * CELL_SIZE;
                const cy = (r + 0.5) * CELL_SIZE;
                const val = cells[r][c];
                const isFocused = focused?.r === r && focused?.c === c;
                return (
                  <g key={`cell-${r}-${c}`}>
                    <rect
                      x={c * CELL_SIZE}
                      y={r * CELL_SIZE}
                      width={CELL_SIZE}
                      height={CELL_SIZE}
                      fill={isFocused ? "#cde4f7" : "transparent"}
                      stroke={isFocused ? "#1976d2" : "none"}
                      strokeWidth={isFocused ? 2 : 0}
                      style={{ cursor: "pointer" }}
                      onClick={() => handleCellClick(r, c)}
                    />
                    {val > 0 && (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={14}
                        fontWeight="bold"
                        fill="#222"
                        pointerEvents="none"
                      >
                        {val}
                      </text>
                    )}
                    {val < 0 && (
                      <PencilHead
                        cx={cx}
                        cy={cy}
                        dir={val}
                        size={CELL_SIZE}
                        tipFill="#222"
                      />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {focused && (
            <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", color: "#555", marginRight: "0.25rem" }}>
                Set head:
              </span>
              {DIR_LABELS.map(({ dir, label, title }) => (
                <button
                  key={dir}
                  title={title}
                  onClick={() => handleSetDirection(dir)}
                  style={{
                    width: 28,
                    height: 28,
                    fontSize: "1rem",
                    cursor: "pointer",
                    border: cells[focused.r][focused.c] === dir ? "2px solid #1976d2" : "1px solid #aaa",
                    borderRadius: 4,
                    background: cells[focused.r][focused.c] === dir ? "#cde4f7" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <textarea
          value={jsonStr}
          onChange={(e) => handleJsonChange(e.target.value)}
          style={{
            fontFamily: "monospace",
            fontSize: "0.75rem",
            width: 300,
            minHeight: 200,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={handleDone} style={{ padding: "0.5rem 1rem" }}>
          Done
        </button>
        <button onClick={onCancel} style={{ padding: "0.5rem 1rem" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
