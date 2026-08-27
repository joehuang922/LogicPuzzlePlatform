import { useState, useEffect} from "react";

interface NumberLinkEditorProps {
  initialCanon?: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 16;
const TOKEN_RADIUS = 13;

export default function NumberLinkEditor({ initialCanon, onChange }: NumberLinkEditorProps) {
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

  function handleCellClick(r: number, c: number, e: React.MouseEvent) {
    e.preventDefault();
    const decrement = e.shiftKey || e.button === 2 || e.type === "contextmenu";
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      // Left-click increments (no upper limit); shift/right-click decrements down to 0.
      next[r][c] = decrement ? Math.max(0, next[r][c] - 1) : next[r][c] + 1;
      return next;
    });
  }


  const jsonStr = JSON.stringify({ cells }, null, 2);

  useEffect(() => {
    onChange(jsonStr);
  }, [jsonStr, onChange]);

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

  // Validation aid: each distinct positive value should appear exactly twice.
  const counts = new Map<number, number>();
  for (const row of cells) {
    for (const v of row) {
      if (v > 0) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  const badValues = [...counts.entries()]
    .filter(([, n]) => n !== 2)
    .map(([v, n]) => `${v}×${n}`);

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
          Click cell: +1 · shift/right-click: −1
        </span>
      </div>

      {badValues.length > 0 && (
        <div style={{ fontSize: "0.8rem", color: "#c0392b" }}>
          Each number must appear exactly twice. Wrong counts: {badValues.join(", ")}
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <svg
          width={Math.min(svgWidth, 500)}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {/* Outer border */}
            <rect
              x={0}
              y={0}
              width={cols * CELL_SIZE}
              height={rows * CELL_SIZE}
              fill="none"
              stroke="#222"
              strokeWidth={2}
            />
            {/* Inner grid lines (dashed) */}
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

            {/* Cell click targets and number tokens */}
            {Array.from({ length: rows * cols }, (_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              const val = cells[r][c];
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
                    onClick={(e) => handleCellClick(r, c, e)}
                    onContextMenu={(e) => handleCellClick(r, c, e)}
                  />
                  {val > 0 && (
                    <>
                      <circle cx={cx} cy={cy} r={TOKEN_RADIUS} fill="#fff" stroke="#222" strokeWidth={2} pointerEvents="none" />
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={val >= 10 ? 13 : 16}
                        fontWeight={700}
                        fill="#222"
                        pointerEvents="none"
                      >
                        {val}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

      </div>

    </div>
  );
}
