import { useState, useMemo, useCallback } from "react";
import { NurikabeCanon } from "../types/canon";

interface NurikabeEditorProps {
  initialJson: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

function parseCanon(json: string): NurikabeCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.cells && Array.isArray(parsed.cells) && parsed.cells.length > 0) {
      return parsed as NurikabeCanon;
    }
  } catch {}
  return null;
}

function createEmptyBoard(rows: number, cols: number): NurikabeCanon {
  const cells: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  return { cells };
}

function clueStats(canon: NurikabeCanon): { count: number; sum: number } {
  let count = 0;
  let sum = 0;
  for (const row of canon.cells) for (const v of row) if (v > 0) { count++; sum += v; }
  return { count, sum };
}

export default function NurikabeEditor({ initialJson, onComplete, onCancel }: NurikabeEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: NurikabeCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const handleResize = useCallback(
    (newR: number, newC: number) => {
      if (!canon || newR < 1 || newC < 1) return;
      const newCells: number[][] = Array.from({ length: newR }, (_, r) =>
        Array.from({ length: newC }, (_, c) => (r < rows && c < cols ? canon.cells[r][c] : 0))
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
        `Enter island clue for cell (row ${r}, col ${c}). Current: ${current || "empty"}. Enter 0 or empty to clear.`
      );
      if (input === null) return;
      const num = parseInt(input, 10);
      const newCells = canon.cells.map((row) => [...row]);
      newCells[r][c] = isNaN(num) || num < 0 ? 0 : num;
      updateJson({ cells: newCells });
    },
    [canon, updateJson]
  );

  const handleCreateEmpty = () => {
    if (newRows >= 2 && newCols >= 2) {
      updateJson(createEmptyBoard(newRows, newCols));
    }
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid nurikabe JSON. Fix the textarea or create a new board.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={handleCreateEmpty}>Create Empty Board</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }

  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;
  const { count, sum } = clueStats(canon);
  const area = rows * cols;

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
            type="number"
            value={rows}
            onChange={(e) => handleResize(Number(e.target.value), cols)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }}
            min={1}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input
            type="number"
            value={cols}
            onChange={(e) => handleResize(rows, Number(e.target.value))}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }}
            min={1}
          />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click cell to set island clue (0 = empty)
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
              {/* Cell backgrounds */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const hasClue = canon.cells[r][c] > 0;
                return (
                  <rect
                    key={`bg-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill={hasClue ? "#e8f0fe" : "white"}
                  />
                );
              })}

              {gridLines}

              {/* Clue numbers */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const num = canon.cells[r][c];
                if (num <= 0) return null;
                const cx = c * CELL_SIZE + CELL_SIZE / 2;
                const cy = r * CELL_SIZE + CELL_SIZE / 2;
                return (
                  <text
                    key={`clue-${r}-${c}`}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={CELL_SIZE * 0.5}
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
            <strong>Clues:</strong> {count} island{count === 1 ? "" : "s"}, total island size {sum} / {area} cells
            {sum > 0 && sum < area ? " (sea fills the remaining " + (area - sum) + ")" : ""}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 250, display: "flex", flexDirection: "column" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.25rem" }}>
            Canon JSON (source of truth)
          </label>
          <textarea
            style={{
              flex: 1,
              minHeight: 300,
              fontFamily: "monospace",
              fontSize: "0.75rem",
              padding: "0.5rem",
              border: "1px solid #ccc",
              borderRadius: 4,
              resize: "vertical",
            }}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
        </div>
      </div>

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => onComplete(jsonText)}
          style={{ padding: "0.5rem 1.25rem", background: "#4a90d9", color: "white", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: "bold" }}
        >
          Complete
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "0.5rem 1rem", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
