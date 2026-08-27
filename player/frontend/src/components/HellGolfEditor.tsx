import { useState, useEffect} from "react";

interface HellGolfEditorProps {
  initialCanon?: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 40;
const PAD = 16;
const BALL_RADIUS = 14;

// Internal per-cell state: 0 = empty, LAKE = lake, GOAL = goal, >= 1 = ball number.
const LAKE = -1;
const GOAL = -2;

type Grid = number[][];

function emptyGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

// Parse canon JSON into the internal grid.
function canonToGrid(canon: {
  lakes?: number[][];
  balls?: { r: number; c: number; n: number }[];
  goals?: number[][];
}): Grid | null {
  if (!canon.lakes || !Array.isArray(canon.lakes)) return null;
  const rows = canon.lakes.length;
  const cols = canon.lakes[0].length;
  const grid = emptyGrid(rows, cols);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (canon.lakes[r][c] === 1) grid[r][c] = LAKE;
  for (const [r, c] of canon.goals ?? [])
    if (r >= 0 && r < rows && c >= 0 && c < cols) grid[r][c] = GOAL;
  for (const b of canon.balls ?? [])
    if (b.r >= 0 && b.r < rows && b.c >= 0 && b.c < cols) grid[b.r][b.c] = b.n;
  return grid;
}

// Serialize the internal grid back to canon JSON.
function gridToCanon(grid: Grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const lakes = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (grid[r][c] === LAKE ? 1 : 0))
  );
  const balls: { r: number; c: number; n: number }[] = [];
  const goals: number[][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === GOAL) goals.push([r, c]);
      else if (grid[r][c] >= 1) balls.push({ r, c, n: grid[r][c] });
    }
  return { lakes, balls, goals };
}

export default function HellGolfEditor({
  initialCanon,
  onChange,
}: HellGolfEditorProps) {
  let initRows = 10;
  let initCols = 10;
  let initGrid: Grid | null = null;
  if (initialCanon) {
    try {
      const parsed = JSON.parse(initialCanon);
      const g = canonToGrid(parsed);
      if (g) {
        initGrid = g;
        initRows = g.length;
        initCols = g[0].length;
      }
    } catch {
      /* ignore */
    }
  }

  const [rows, setRows] = useState(initRows);
  const [cols, setCols] = useState(initCols);
  const [grid, setGrid] = useState<Grid>(initGrid ?? emptyGrid(initRows, initCols));

  function resizeGrid(newRows: number, newCols: number) {
    const next = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) =>
        r < grid.length && c < grid[0].length ? grid[r][c] : 0
      )
    );
    setRows(newRows);
    setCols(newCols);
    setGrid(next);
  }

  // Cycle: empty -> lake -> goal -> ball(1) -> ball(2) -> ... (each further
  // click while a ball increments the number). Shift/right-click cycles back.
  function cycle(v: number, back: boolean): number {
    if (!back) {
      if (v === 0) return LAKE;
      if (v === LAKE) return GOAL;
      if (v === GOAL) return 1;
      return v + 1; // ball: keep incrementing
    }
    if (v === 0) return 0;
    if (v === LAKE) return 0;
    if (v === GOAL) return LAKE;
    if (v === 1) return GOAL;
    return v - 1;
  }

  function handleCellClick(r: number, c: number, e: React.MouseEvent) {
    e.preventDefault();
    const back = e.shiftKey || e.button === 2 || e.type === "contextmenu";
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = cycle(next[r][c], back);
      return next;
    });
  }


  const jsonStr = JSON.stringify(gridToCanon(grid), null, 2);

  useEffect(() => {
    onChange(jsonStr);
  }, [jsonStr, onChange]);

  function handleJsonChange(value: string) {
    try {
      const parsed = JSON.parse(value);
      const g = canonToGrid(parsed);
      if (g) {
        setGrid(g);
        setRows(g.length);
        setCols(g[0].length);
      }
    } catch {
      /* ignore invalid JSON while typing */
    }
  }

  // Validation aid: ball count must equal goal count.
  let ballCount = 0;
  let goalCount = 0;
  for (const row of grid)
    for (const v of row) {
      if (v === GOAL) goalCount++;
      else if (v >= 1) ballCount++;
    }
  const mismatch = ballCount !== goalCount;

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
          Click: empty→lake→goal→ball(1)→+1 · shift/right-click: back
        </span>
      </div>

      <div style={{ fontSize: "0.8rem", color: mismatch ? "#c0392b" : "#16a34a" }}>
        Balls: {ballCount} · Goals: {goalCount}
        {mismatch ? " — counts must be equal" : " ✓"}
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <svg
          width={Math.min(svgWidth, 500)}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {/* Lake fills */}
            {grid.flatMap((row, r) =>
              row.map((v, c) =>
                v === LAKE ? (
                  <rect
                    key={`lake-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill="#9ca3af"
                    pointerEvents="none"
                  />
                ) : null
              )
            )}

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

            {/* Cell click targets + glyphs */}
            {Array.from({ length: rows * cols }, (_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              const v = grid[r][c];
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
                  {v === GOAL && (
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={22}
                      fontWeight={700}
                      fill="#374151"
                      pointerEvents="none"
                    >
                      H
                    </text>
                  )}
                  {v >= 1 && (
                    <>
                      <circle cx={cx} cy={cy} r={BALL_RADIUS} fill="#fff" stroke="#2563eb" strokeWidth={2} pointerEvents="none" />
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={15}
                        fontWeight={700}
                        fill="#2563eb"
                        pointerEvents="none"
                      >
                        {v}
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
