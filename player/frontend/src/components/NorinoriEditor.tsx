import { useState, useMemo, useCallback, useEffect} from "react";
import { NorinoriCanon } from "../types/canon";

interface NorinoriEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

function parseCanon(json: string): NorinoriCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (
      parsed.grids &&
      Array.isArray(parsed.grids.h) &&
      Array.isArray(parsed.grids.v) &&
      parsed.grids.h.length > 0 &&
      parsed.grids.v.length > 0
    ) {
      return parsed as NorinoriCanon;
    }
  } catch {}
  return null;
}

function createEmptyBoard(rows: number, cols: number): NorinoriCanon {
  const h: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
  const v: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
  return { grids: { h, v } };
}

function dimsOf(canon: NorinoriCanon): { rows: number; cols: number } {
  const rows = canon.grids.h.length + 1;
  const cols = canon.grids.v[0].length + 1;
  return { rows, cols };
}

export default function NorinoriEditor({ initialJson, onChange }: NorinoriEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const dims = canon ? dimsOf(canon) : { rows: 0, cols: 0 };
  const { rows, cols } = dims;

  const updateJson = useCallback((newCanon: NorinoriCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const handleResize = useCallback(
    (newR: number, newC: number) => {
      if (!canon || newR < 2 || newC < 2) return;
      const h: number[][] = Array.from({ length: newR - 1 }, (_, r) =>
        Array.from({ length: newC }, (_, c) =>
          r < rows - 1 && c < cols ? canon.grids.h[r][c] : 0
        )
      );
      const v: number[][] = Array.from({ length: newR }, (_, r) =>
        Array.from({ length: newC - 1 }, (_, c) =>
          r < rows && c < cols - 1 ? canon.grids.v[r][c] : 0
        )
      );
      updateJson({ grids: { h, v } });
    },
    [canon, rows, cols, updateJson]
  );

  const handleHEdgeClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const newH = canon.grids.h.map((row) => [...row]);
      newH[r][c] = newH[r][c] === 0 ? 1 : 0;
      updateJson({ grids: { ...canon.grids, h: newH } });
    },
    [canon, updateJson]
  );

  const handleVEdgeClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const newV = canon.grids.v.map((row) => [...row]);
      newV[r][c] = newV[r][c] === 0 ? 1 : 0;
      updateJson({ grids: { ...canon.grids, v: newV } });
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
          Invalid Norinori JSON. Fix the textarea or create a new board.
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
      const isThick = isBorder || (r > 0 && r < rows && canon.grids.h[r - 1][c] === 1);
      gridLines.push(
        <line
          key={`h-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={(c + 1) * CELL_SIZE}
          y2={r * CELL_SIZE}
          stroke="black"
          strokeWidth={isThick ? THICK : THIN}
        />
      );
    }
  }
  // Vertical lines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const isBorder = c === 0 || c === cols;
      const isThick = isBorder || (c > 0 && c < cols && canon.grids.v[r][c - 1] === 1);
      gridLines.push(
        <line
          key={`v-${r}-${c}`}
          x1={c * CELL_SIZE}
          y1={r * CELL_SIZE}
          x2={c * CELL_SIZE}
          y2={(r + 1) * CELL_SIZE}
          stroke="black"
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
          Click a border to toggle it thick (region boundary) / thin
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
                return (
                  <rect
                    key={`fill-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill="white"
                  />
                );
              })}
              {gridLines}
              {edgeTargets}
            </g>
          </svg>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
            <strong>Regions</strong> are the areas enclosed by thick borders. No cell symbols in Norinori.
          </div>
        </div>

      </div>

    </div>
  );
}
