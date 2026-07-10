import { useState } from "react";

interface SlitherlinkEditorProps {
  initialCanon?: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 16;
const DOT_RADIUS = 3;

export default function SlitherlinkEditor({ initialCanon, onComplete, onCancel }: SlitherlinkEditorProps) {
  let initRows = 5, initCols = 5;
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
    initCells ?? Array.from({ length: initRows }, () => Array(initCols).fill(-1))
  );

  function resizeGrid(newRows: number, newCols: number) {
    const newCells = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) => (r < cells.length && c < cells[0].length ? cells[r][c] : -1))
    );
    setRows(newRows);
    setCols(newCols);
    setCells(newCells);
  }

  function handleCellClick(r: number, c: number) {
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      // Cycle: -1 -> 0 -> 1 -> 2 -> 3 -> -1
      next[r][c] = next[r][c] >= 3 ? -1 : next[r][c] + 1;
      return next;
    });
  }

  function handleDone() {
    onComplete(JSON.stringify({ cells }, null, 2));
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
            max={20}
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
            max={20}
            value={cols}
            onChange={(e) => resizeGrid(rows, Number(e.target.value) || 1)}
            style={{ width: 50 }}
          />
        </label>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>Click cells to cycle: empty → 0 → 1 → 2 → 3 → empty</span>
      </div>

      <svg
        width={Math.min(svgWidth, 600)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {/* Cell click targets and numbers */}
          {Array.from({ length: rows * cols }, (_, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            return (
              <g key={`cell-${r}-${c}`}>
                <rect
                  x={c * CELL_SIZE}
                  y={r * CELL_SIZE}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill={cells[r][c] >= 0 ? "#f0f8ff" : "transparent"}
                  stroke="none"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleCellClick(r, c)}
                />
                {cells[r][c] >= 0 && (
                  <text
                    x={(c + 0.5) * CELL_SIZE}
                    y={(r + 0.5) * CELL_SIZE}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={CELL_SIZE * 0.5}
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    fill="#333"
                    pointerEvents="none"
                  >
                    {cells[r][c]}
                  </text>
                )}
              </g>
            );
          })}

          {/* Dots at intersections */}
          {Array.from({ length: (rows + 1) * (cols + 1) }, (_, i) => {
            const r = Math.floor(i / (cols + 1));
            const c = i % (cols + 1);
            return (
              <circle
                key={`dot-${r}-${c}`}
                cx={c * CELL_SIZE}
                cy={r * CELL_SIZE}
                r={DOT_RADIUS}
                fill="#333"
                pointerEvents="none"
              />
            );
          })}
        </g>
      </svg>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={handleDone} style={{ padding: "0.5rem 1rem" }}>Done</button>
        <button onClick={onCancel} style={{ padding: "0.5rem 1rem" }}>Cancel</button>
      </div>
    </div>
  );
}
