import { useState, useMemo, useCallback } from "react";
import { DoubleChocoCanon } from "../types/canon";

interface DoubleChocoEditorProps {
  initialJson: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

function parseCanon(json: string): DoubleChocoCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.cells && Array.isArray(parsed.cells) && parsed.cells.length > 0) {
      return parsed as DoubleChocoCanon;
    }
  } catch {}
  return null;
}

function createEmptyBoard(rows: number, cols: number): DoubleChocoCanon {
  const cells: [number, number][][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => [0, 0])
  );
  return { cells };
}

export default function DoubleChocoEditor({ initialJson, onComplete, onCancel }: DoubleChocoEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: DoubleChocoCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const handleCellColorClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const newCells = canon.cells.map((row) => row.map((cell) => [...cell] as [number, number]));
      newCells[r][c][0] = newCells[r][c][0] === 0 ? 1 : 0;
      updateJson({ ...canon, cells: newCells });
    },
    [canon, updateJson]
  );

  const handleCellNumberClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const current = canon.cells[r][c][1];
      const input = prompt(`Enter number for cell (${r},${c}). Current: ${current || "empty"}. Enter 0 or empty to clear.`);
      if (input === null) return;
      const num = parseInt(input, 10);
      const newCells = canon.cells.map((row) => row.map((cell) => [...cell] as [number, number]));
      newCells[r][c][1] = isNaN(num) || num < 0 ? 0 : num;
      updateJson({ ...canon, cells: newCells });
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
          Invalid double-choco JSON. Fix the textarea or create a new board.
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

  const gridLines: JSX.Element[] = [];
  // All internal grids are dashed in the question (no thick borders in canon)
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      gridLines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={(c + 1) * CELL_SIZE}
          y2={r * CELL_SIZE}
          stroke="black"
          strokeWidth={isBorder ? THICK : THIN}
          strokeDasharray={isBorder ? undefined : "3,3"}
        />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      gridLines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={c * CELL_SIZE}
          y2={(r + 1) * CELL_SIZE}
          stroke="black"
          strokeWidth={isBorder ? THICK : THIN}
          strokeDasharray={isBorder ? undefined : "3,3"}
        />
      );
    }
  }

  const cellInset = EDGE_HIT_WIDTH / 2 + 1;

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
          <input type="number" value={rows} readOnly style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", background: "#eee", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input type="number" value={cols} readOnly style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", background: "#eee", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Left-click: toggle gray/white | Right-click: set number
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg
            width={Math.min(svgWidth, 600)}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <g transform={`translate(${PAD},${PAD})`}>
              {/* Cell fills */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const [color] = canon.cells[r][c];
                return (
                  <rect
                    key={`fill-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill={color === 1 ? "#ccc" : "white"}
                  />
                );
              })}

              {/* Numbers */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const [, num] = canon.cells[r][c];
                if (num === 0) return null;
                return (
                  <text
                    key={`num-${r}-${c}`}
                    x={c * CELL_SIZE + CELL_SIZE / 2}
                    y={r * CELL_SIZE + CELL_SIZE / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={CELL_SIZE * 0.5}
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    fill="black"
                    pointerEvents="none"
                  >
                    {num}
                  </text>
                );
              })}

              {gridLines}

              {/* Cell click targets */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                return (
                  <rect
                    key={`cell-${r}-${c}`}
                    x={c * CELL_SIZE + cellInset}
                    y={r * CELL_SIZE + cellInset}
                    width={CELL_SIZE - cellInset * 2}
                    height={CELL_SIZE - cellInset * 2}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleCellColorClick(r, c)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleCellNumberClick(r, c);
                    }}
                  />
                );
              })}
            </g>
          </svg>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
            <strong>Colors:</strong> white=0, gray=1 | <strong>Numbers:</strong> 0=empty
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
