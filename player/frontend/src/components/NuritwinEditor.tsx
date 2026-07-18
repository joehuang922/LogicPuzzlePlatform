import { useState, useMemo, useCallback } from "react";
import { NuritwinCanon } from "../types/canon";
import { useGridCellInput } from "../hooks/useGridCellInput";

interface NuritwinEditorProps {
  initialJson: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

function parseCanon(json: string): NuritwinCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.cells && parsed.grids && parsed.grids.h && parsed.grids.v) {
      return parsed as NuritwinCanon;
    }
  } catch {}
  return null;
}

function makeEmptyCanon(rows: number, cols: number): NuritwinCanon {
  return {
    cells: Array.from({ length: rows }, () => Array(cols).fill(0)),
    grids: {
      h: Array.from({ length: rows - 1 }, () => Array(cols).fill(0)),
      v: Array.from({ length: rows }, () => Array(cols - 1).fill(0)),
    },
  };
}

export default function NuritwinEditor({ initialJson, onComplete, onCancel }: NuritwinEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: NuritwinCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const setCellValue = useCallback(
    (r: number, c: number, val: number) => {
      if (!canon) return;
      const newCells = canon.cells.map((row) => [...row]);
      newCells[r][c] = val;
      updateJson({ ...canon, cells: newCells });
    },
    [canon, updateJson]
  );

  const { focused, handleCellClick } = useGridCellInput({
    rows,
    cols,
    cells: canon?.cells ?? [],
    setCellValue,
  });

  const handleHEdgeClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const newH = canon.grids.h.map((row) => [...row]);
      newH[r][c] = newH[r][c] === 0 ? 1 : 0;
      updateJson({ ...canon, grids: { ...canon.grids, h: newH } });
    },
    [canon, updateJson]
  );

  const handleVEdgeClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const newV = canon.grids.v.map((row) => [...row]);
      newV[r][c] = newV[r][c] === 0 ? 1 : 0;
      updateJson({ ...canon, grids: { ...canon.grids, v: newV } });
    },
    [canon, updateJson]
  );

  function handleResize(newRows: number, newCols: number) {
    if (newRows < 1 || newCols < 1) return;
    if (canon) {
      const newCells = Array.from({ length: newRows }, (_, r) =>
        Array.from({ length: newCols }, (_, c) =>
          r < canon.cells.length && c < canon.cells[0].length ? canon.cells[r][c] : 0
        )
      );
      const newH = Array.from({ length: newRows - 1 }, (_, r) =>
        Array.from({ length: newCols }, (_, c) =>
          r < canon.grids.h.length && c < canon.grids.h[0].length ? canon.grids.h[r][c] : 0
        )
      );
      const newV = Array.from({ length: newRows }, (_, r) =>
        Array.from({ length: newCols - 1 }, (_, c) =>
          r < canon.grids.v.length && c < canon.grids.v[0].length ? canon.grids.v[r][c] : 0
        )
      );
      updateJson({ cells: newCells, grids: { h: newH, v: newV } });
    } else {
      updateJson(makeEmptyCanon(newRows, newCols));
    }
  }

  if (!canon) {
    return (
      <div style={{ border: "2px solid #c33", borderRadius: 8, padding: "1rem", background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid nuritwin JSON. Fix the textarea below or set dimensions to create a new grid.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => updateJson(makeEmptyCanon(7, 7))}>
            Create 7x7 grid
          </button>
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

  const edgeTargets: JSX.Element[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      edgeTargets.push(
        <rect
          key={`he-${r}-${c}`}
          x={c * CELL_SIZE}
          y={(r + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2}
          width={CELL_SIZE}
          height={EDGE_HIT_WIDTH}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            handleHEdgeClick(r, c);
          }}
        />
      );
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      edgeTargets.push(
        <rect
          key={`ve-${r}-${c}`}
          x={(c + 1) * CELL_SIZE - EDGE_HIT_WIDTH / 2}
          y={r * CELL_SIZE}
          width={EDGE_HIT_WIDTH}
          height={CELL_SIZE}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            handleVEdgeClick(r, c);
          }}
        />
      );
    }
  }

  const cellInset = EDGE_HIT_WIDTH / 2 + 1;
  const cellTargets: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cellTargets.push(
        <rect
          key={`cell-${r}-${c}`}
          x={c * CELL_SIZE + cellInset}
          y={r * CELL_SIZE + cellInset}
          width={CELL_SIZE - cellInset * 2}
          height={CELL_SIZE - cellInset * 2}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onClick={() => handleCellClick(r, c)}
        />
      );
    }
  }

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
          <input
            type="number"
            min={1}
            max={100}
            value={rows}
            onChange={(e) => handleResize(Number(e.target.value) || 1, cols)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input
            type="number"
            min={1}
            max={100}
            value={cols}
            onChange={(e) => handleResize(rows, Number(e.target.value) || 1)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }}
          />
        </div>
        <span style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click cell + type number | Delete to clear | Click border to toggle thick/thin
        </span>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg
            width={Math.min(svgWidth, 600)}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
            tabIndex={0}
          >
            <g transform={`translate(${PAD},${PAD})`}>
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const isFocused = focused?.r === r && focused?.c === c;
                return (
                  <rect
                    key={`fill-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill={isFocused ? "#cde4f7" : "white"}
                    stroke={isFocused ? "#1976d2" : "none"}
                    strokeWidth={isFocused ? 2 : 0}
                  />
                );
              })}

              {gridLines}

              {/* Clue numbers */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const val = canon.cells[r][c];
                if (val === 0) return null;
                return (
                  <text
                    key={`num-${r}-${c}`}
                    x={c * CELL_SIZE + CELL_SIZE / 2}
                    y={r * CELL_SIZE + CELL_SIZE / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={CELL_SIZE * 0.45}
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    fill="#222"
                    pointerEvents="none"
                  >
                    {val}
                  </text>
                );
              })}

              {edgeTargets}
              {cellTargets}
            </g>
          </svg>
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
