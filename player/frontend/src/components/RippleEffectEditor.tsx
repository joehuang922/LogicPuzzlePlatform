import { useState, useMemo, useCallback } from "react";
import { RippleEffectCanon } from "../types/canon";

interface RippleEffectEditorProps {
  initialJson: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

function parseCanon(json: string): RippleEffectCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (
      parsed.cells &&
      Array.isArray(parsed.cells) &&
      parsed.cells.length > 0 &&
      parsed.edges &&
      Array.isArray(parsed.edges.h) &&
      Array.isArray(parsed.edges.v)
    ) {
      return parsed as RippleEffectCanon;
    }
  } catch {}
  return null;
}

function createEmptyBoard(rows: number, cols: number): RippleEffectCanon {
  const cells: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const h: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  const v: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
  return { cells, edges: { h, v } };
}

export default function RippleEffectEditor({ initialJson, onComplete, onCancel }: RippleEffectEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(8);
  const [newCols, setNewCols] = useState(8);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: RippleEffectCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const handleResize = useCallback(
    (newR: number, newC: number) => {
      if (!canon || newR < 2 || newC < 2) return;
      const cells: number[][] = Array.from({ length: newR }, (_, r) =>
        Array.from({ length: newC }, (_, c) => (r < rows && c < cols ? canon.cells[r][c] : 0))
      );
      const h: number[][] = Array.from({ length: newR - 1 }, (_, r) =>
        Array.from({ length: newC }, (_, c) =>
          r < rows - 1 && c < cols ? canon.edges.h[r][c] : 0
        )
      );
      const v: number[][] = Array.from({ length: newR }, (_, r) =>
        Array.from({ length: newC - 1 }, (_, c) =>
          r < rows && c < cols - 1 ? canon.edges.v[r][c] : 0
        )
      );
      updateJson({ cells, edges: { h, v } });
    },
    [canon, rows, cols, updateJson]
  );

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const current = canon.cells[r][c];
      const input = prompt(
        `Enter clue for cell (row ${r}, col ${c}). Current: ${current || "empty"}. Enter 0 or empty to clear.`
      );
      if (input === null) return;
      const num = parseInt(input, 10);
      const cells = canon.cells.map((row) => [...row]);
      cells[r][c] = isNaN(num) || num < 0 ? 0 : num;
      updateJson({ ...canon, cells });
    },
    [canon, updateJson]
  );

  const handleHEdgeClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const h = canon.edges.h.map((row) => [...row]);
      h[r][c] = h[r][c] === 0 ? 1 : 0;
      updateJson({ ...canon, edges: { ...canon.edges, h } });
    },
    [canon, updateJson]
  );

  const handleVEdgeClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const v = canon.edges.v.map((row) => [...row]);
      v[r][c] = v[r][c] === 0 ? 1 : 0;
      updateJson({ ...canon, edges: { ...canon.edges, v } });
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
          Invalid ripple-effect JSON. Fix the textarea or create a new board.
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
  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isBorder = r === 0 || r === rows;
      const isThick = isBorder || (r > 0 && r < rows && canon.edges.h[r - 1][c] === 1);
      gridLines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={(c + 1) * CELL_SIZE}
          y2={r * CELL_SIZE}
          stroke={isThick ? "black" : "#bbb"}
          strokeWidth={isThick ? THICK : THIN}
        />
      );
    }
  }
  // Vertical lines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick = isBorder || (c > 0 && c < cols && canon.edges.v[r][c - 1] === 1);
      gridLines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={c * CELL_SIZE}
          y2={(r + 1) * CELL_SIZE}
          stroke={isThick ? "black" : "#bbb"}
          strokeWidth={isThick ? THICK : THIN}
        />
      );
    }
  }

  // Edge click targets (internal edges only)
  const edgeTargets: JSX.Element[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL_SIZE;
      const y = (r + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
      edgeTargets.push(
        <rect
          key={`he-${r}-${c}`}
          x={x}
          y={y}
          width={CELL_SIZE}
          height={EDGE_HIT_WIDTH}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={() => handleHEdgeClick(r, c)}
        />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const x = (c + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2;
      const y = r * CELL_SIZE;
      edgeTargets.push(
        <rect
          key={`ve-${r}-${c}`}
          x={x}
          y={y}
          width={EDGE_HIT_WIDTH}
          height={CELL_SIZE}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={() => handleVEdgeClick(r, c)}
        />
      );
    }
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
            min={2}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input
            type="number"
            value={cols}
            onChange={(e) => handleResize(rows, Number(e.target.value))}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }}
            min={2}
          />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click a cell to set its clue; click a border to toggle it thick (room boundary) / thin
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
              {/* Cell fills */}
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

              {/* Clue numbers */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const num = canon.cells[r][c];
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

              {/* Cell click targets (inner area, leaving edge strips for border toggles) */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                return (
                  <rect
                    key={`click-${r}-${c}`}
                    x={c * CELL_SIZE + EDGE_HIT_WIDTH / 2}
                    y={r * CELL_SIZE + EDGE_HIT_WIDTH / 2}
                    width={CELL_SIZE - EDGE_HIT_WIDTH}
                    height={CELL_SIZE - EDGE_HIT_WIDTH}
                    fill="transparent"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleCellClick(r, c)}
                  />
                );
              })}

              {edgeTargets}
            </g>
          </svg>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
            <strong>Rooms</strong> are the areas enclosed by thick borders. Clue = pre-filled number (0 = empty).
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
