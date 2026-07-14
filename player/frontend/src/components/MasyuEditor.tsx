import { useState } from "react";

interface MasyuEditorProps {
  initialCanon?: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 16;
const CIRCLE_RADIUS = 11;
const DOT_RADIUS = 3;

export default function MasyuEditor({ initialCanon, onComplete, onCancel }: MasyuEditorProps) {
  let initRows = 10, initCols = 10;
  let initCells: number[][] | null = null;
  if (initialCanon) {
    try {
      const parsed = JSON.parse(initialCanon);
      if (parsed.cells) {
        initCells = parsed.cells;
        initRows = parsed.cells.length;
        initCols = parsed.cells[0].length;
      }
    } catch { /* ignore */ }
  }

  const [rows, setRows] = useState(initRows);
  const [cols, setCols] = useState(initCols);
  const [cells, setCells] = useState<number[][]>(
    initCells ?? Array.from({ length: initRows }, () => Array(initCols).fill(0))
  );

  function resizeGrid(newRows: number, newCols: number) {
    const newCells = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) => (r < cells.length && c < cells[0].length ? cells[r][c] : 0))
    );
    setRows(newRows);
    setCols(newCols);
    setCells(newCells);
  }

  function handleCellClick(r: number, c: number) {
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      // Cycle: 0 (empty) -> 1 (white) -> 2 (black) -> 0
      next[r][c] = (next[r][c] + 1) % 3;
      return next;
    });
  }

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
    } catch { /* ignore invalid JSON while typing */ }
  }

  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Rows:{" "}
          <input
            type="number"
            min={1}
            max={30}
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
            max={30}
            value={cols}
            onChange={(e) => resizeGrid(rows, Number(e.target.value) || 1)}
            style={{ width: 50 }}
          />
        </label>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>
          Click cells to cycle: empty → white ○ → black ● → empty
        </span>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <svg
          width={Math.min(svgWidth, 500)}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {/* Grid lines */}
            {Array.from({ length: rows + 1 }, (_, r) => (
              <line
                key={`gh-${r}`}
                x1={0}
                y1={r * CELL_SIZE}
                x2={cols * CELL_SIZE}
                y2={r * CELL_SIZE}
                stroke="#ddd"
                strokeWidth={0.5}
              />
            ))}
            {Array.from({ length: cols + 1 }, (_, c) => (
              <line
                key={`gv-${c}`}
                x1={c * CELL_SIZE}
                y1={0}
                x2={c * CELL_SIZE}
                y2={rows * CELL_SIZE}
                stroke="#ddd"
                strokeWidth={0.5}
              />
            ))}

            {/* Cell click targets and circles */}
            {Array.from({ length: rows * cols }, (_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              return (
                <g key={`cell-${r}-${c}`}>
                  <rect
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill="transparent"
                    stroke="none"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleCellClick(r, c)}
                  />
                  {cells[r][c] === 0 && (
                    <circle cx={cx} cy={cy} r={DOT_RADIUS} fill="#999" pointerEvents="none" />
                  )}
                  {cells[r][c] === 1 && (
                    <circle cx={cx} cy={cy} r={CIRCLE_RADIUS} fill="#fff" stroke="#222" strokeWidth={2} pointerEvents="none" />
                  )}
                  {cells[r][c] === 2 && (
                    <circle cx={cx} cy={cy} r={CIRCLE_RADIUS} fill="#222" stroke="#222" strokeWidth={2} pointerEvents="none" />
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <textarea
          value={jsonStr}
          onChange={(e) => handleJsonChange(e.target.value)}
          style={{ fontFamily: "monospace", fontSize: "0.75rem", width: 300, minHeight: 200 }}
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={handleDone} style={{ padding: "0.5rem 1rem" }}>Done</button>
        <button onClick={onCancel} style={{ padding: "0.5rem 1rem" }}>Cancel</button>
      </div>
    </div>
  );
}
