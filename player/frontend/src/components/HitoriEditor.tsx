import { useState, useMemo, useCallback, useEffect} from "react";
import { HitoriCanon } from "../types/canon";

interface HitoriEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

function parseCanon(json: string): HitoriCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.cells && Array.isArray(parsed.cells) && parsed.cells.length > 0) {
      return parsed as HitoriCanon;
    }
  } catch {}
  return null;
}

// Every Hitori cell holds a number, so new cells default to 1 rather than empty.
function createBoard(rows: number, cols: number): HitoriCanon {
  const cells: number[][] = Array.from({ length: rows }, () => Array(cols).fill(1));
  return { cells };
}

// Count cells that repeat a value already present in their row or column — a
// quick sanity check that the grid actually needs shading.
function duplicateCells(canon: HitoriCanon): number {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = canon.cells[r][c];
      let dup = false;
      for (let k = 0; k < cols && !dup; k++) if (k !== c && canon.cells[r][k] === v) dup = true;
      for (let k = 0; k < rows && !dup; k++) if (k !== r && canon.cells[k][c] === v) dup = true;
      if (dup) count++;
    }
  }
  return count;
}

export default function HitoriEditor({ initialJson, onChange }: HitoriEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(8);
  const [newCols, setNewCols] = useState(8);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: HitoriCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const handleResize = useCallback(
    (newR: number, newC: number) => {
      if (!canon || newR < 1 || newC < 1) return;
      const newCells: number[][] = Array.from({ length: newR }, (_, r) =>
        Array.from({ length: newC }, (_, c) => (r < rows && c < cols ? canon.cells[r][c] : 1))
      );
      updateJson({ cells: newCells });
    },
    [canon, rows, cols, updateJson]
  );

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const current = canon.cells[r][c];
      const input = prompt(
        `Enter number for cell (row ${r}, col ${c}). Current: ${current}. Must be a positive integer.`
      );
      if (input === null) return;
      const num = parseInt(input, 10);
      // Cells can't be empty: anything that isn't a positive integer keeps the old value.
      if (isNaN(num) || num < 1) return;
      const newCells = canon.cells.map((row) => [...row]);
      newCells[r][c] = num;
      updateJson({ cells: newCells });
    },
    [canon, updateJson]
  );

  const handleCreateBoard = () => {
    if (newRows >= 2 && newCols >= 2) {
      updateJson(createBoard(newRows, newCols));
    }
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid hitori JSON. Fix the textarea or create a new board.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={handleCreateBoard}>Create Board</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;
  const dups = duplicateCells(canon);
  const maxSide = Math.max(rows, cols);
  let outOfRange = 0;
  for (const row of canon.cells) for (const v of row) if (v < 1 || v > maxSide) outOfRange++;

  const gridLines: JSX.Element[] = [];
  for (let r = 0; r <= rows; r++) {
    const isBorder = r === 0 || r === rows;
    gridLines.push(
      <line
        key={`h-${r}`}
        x1={0}
        y1={r * CELL_SIZE}
        x2={cols * CELL_SIZE}
        y2={r * CELL_SIZE}
        stroke="black"
        strokeWidth={isBorder ? THICK : THIN}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    const isBorder = c === 0 || c === cols;
    gridLines.push(
      <line
        key={`v-${c}`}
        x1={c * CELL_SIZE}
        y1={0}
        x2={c * CELL_SIZE}
        y2={rows * CELL_SIZE}
        stroke="black"
        strokeWidth={isBorder ? THICK : THIN}
      />
    );
  }

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
          <input
            type="number" onFocus={(e) => e.currentTarget.select()}
            value={rows}
            onChange={(e) => handleResize(Number(e.target.value), cols)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }}
            min={1}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input
            type="number" onFocus={(e) => e.currentTarget.select()}
            value={cols}
            onChange={(e) => handleResize(rows, Number(e.target.value))}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }}
            min={1}
          />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click cell to set its number
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg
            width={Math.min(svgWidth, 600)}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
          >
            <g transform={`translate(${PAD},${PAD})`}>
              {/* Cell backgrounds: out-of-range values (likely misreads) are tinted */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const v = canon.cells[r][c];
                const suspicious = v < 1 || v > maxSide;
                return (
                  <rect
                    key={`bg-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill={suspicious ? "#fde2e2" : "white"}
                  />
                );
              })}

              {gridLines}

              {/* Numbers */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const num = canon.cells[r][c];
                const cx = c * CELL_SIZE + CELL_SIZE / 2;
                const cy = r * CELL_SIZE + CELL_SIZE / 2;
                return (
                  <text
                    key={`num-${r}-${c}`}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={CELL_SIZE * (num >= 10 ? 0.4 : 0.5)}
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    fill="#1f2937"
                    pointerEvents="none"
                  >
                    {num}
                  </text>
                );
              })}

              {/* Cell click targets */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                return (
                  <rect
                    key={`click-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleCellClick(r, c)}
                  />
                );
              })}
            </g>
          </svg>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
            <strong>Cells:</strong> {rows * cols}, {dups} in a row/column duplicate
            {outOfRange > 0 ? `, ${outOfRange} outside 1–${maxSide} (highlighted)` : ""}
          </div>
        </div>

      </div>

    </div>
  );
}
