import { useState, useEffect} from "react";
import { YajilinClue } from "../types/canon";

interface YajilinEditorProps {
  initialCanon?: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 16;

const DIRS: ("up" | "down" | "left" | "right")[] = ["up", "right", "down", "left"];
const ARROW_MAP: Record<string, string> = { up: "↑", down: "↓", left: "←", right: "→" };

type Cell = YajilinClue | null;

export default function YajilinEditor({ initialCanon, onChange }: YajilinEditorProps) {
  let initRows = 10, initCols = 10;
  let initCells: Cell[][] | null = null;
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
  const [cells, setCells] = useState<Cell[][]>(
    initCells ?? Array.from({ length: initRows }, () => Array(initCols).fill(null))
  );

  function resizeGrid(newRows: number, newCols: number) {
    const newCells: Cell[][] = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) =>
        r < cells.length && c < cells[0].length ? cells[r][c] : null
      )
    );
    setRows(newRows);
    setCols(newCols);
    setCells(newCells);
  }

  function handleLeftClick(r: number, c: number) {
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      const cur = next[r][c];
      if (cur === null) {
        next[r][c] = { dir: "up", num: 0 };
      } else {
        const dirIdx = DIRS.indexOf(cur.dir);
        const nextDirIdx = (dirIdx + 1) % DIRS.length;
        if (nextDirIdx === 0) {
          // Wrapped around direction — increment number
          const newNum = cur.num + 1;
          if (newNum > 9) {
            next[r][c] = null;
          } else {
            next[r][c] = { dir: DIRS[0], num: newNum };
          }
        } else {
          next[r][c] = { dir: DIRS[nextDirIdx], num: cur.num };
        }
      }
      return next;
    });
  }

  function handleRightClick(r: number, c: number, e: React.MouseEvent) {
    e.preventDefault();
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = null;
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

  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;
  const fs = CELL_SIZE * 0.3;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Rows:{" "}
          <input
            type="number" min={1} max={100} value={rows}
            onChange={(e) => resizeGrid(Number(e.target.value) || 1, cols)}
            style={{ width: 50 }}
          />
        </label>
        <label>
          Cols:{" "}
          <input
            type="number" min={1} max={100} value={cols}
            onChange={(e) => resizeGrid(rows, Number(e.target.value) || 1)}
            style={{ width: 50 }}
          />
        </label>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>
          Click to cycle dir/num. Right-click to clear.
        </span>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <svg
          width={Math.min(svgWidth, 500)}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            <rect x={0} y={0} width={cols * CELL_SIZE} height={rows * CELL_SIZE}
              fill="none" stroke="#222" strokeWidth={2} />
            {Array.from({ length: rows - 1 }, (_, i) => (
              <line key={`gh-${i}`} x1={0} y1={(i + 1) * CELL_SIZE}
                x2={cols * CELL_SIZE} y2={(i + 1) * CELL_SIZE}
                stroke="#bbb" strokeWidth={0.5} />
            ))}
            {Array.from({ length: cols - 1 }, (_, i) => (
              <line key={`gv-${i}`} x1={(i + 1) * CELL_SIZE} y1={0}
                x2={(i + 1) * CELL_SIZE} y2={rows * CELL_SIZE}
                stroke="#bbb" strokeWidth={0.5} />
            ))}

            {Array.from({ length: rows * cols }, (_, i) => {
              const r = Math.floor(i / cols);
              const c = i % cols;
              const cx = (c + 0.5) * CELL_SIZE;
              const cy = (r + 0.5) * CELL_SIZE;
              const clue = cells[r][c];
              return (
                <g key={`cell-${r}-${c}`}>
                  <rect
                    x={c * CELL_SIZE} y={r * CELL_SIZE}
                    width={CELL_SIZE} height={CELL_SIZE}
                    fill="transparent" stroke="none"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleLeftClick(r, c)}
                    onContextMenu={(e) => handleRightClick(r, c, e)}
                  />
                  {clue === null && (
                    <circle cx={cx} cy={cy} r={3} fill="#ccc" pointerEvents="none" />
                  )}
                  {clue !== null && (clue.dir === "left" || clue.dir === "right") && (
                    <g pointerEvents="none">
                      <text x={cx} y={cy - fs * 0.45} textAnchor="middle" dominantBaseline="central"
                        fontSize={fs} fill="#222">{ARROW_MAP[clue.dir]}</text>
                      <text x={cx} y={cy + fs * 0.55} textAnchor="middle" dominantBaseline="central"
                        fontSize={fs} fontWeight="bold" fill="#222">{clue.num}</text>
                    </g>
                  )}
                  {clue !== null && (clue.dir === "up" || clue.dir === "down") && (
                    <g pointerEvents="none">
                      <text x={cx - fs * 0.45} y={cy} textAnchor="middle" dominantBaseline="central"
                        fontSize={fs} fontWeight="bold" fill="#222">{clue.num}</text>
                      <text x={cx + fs * 0.45} y={cy} textAnchor="middle" dominantBaseline="central"
                        fontSize={fs} fill="#222">{ARROW_MAP[clue.dir]}</text>
                    </g>
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
