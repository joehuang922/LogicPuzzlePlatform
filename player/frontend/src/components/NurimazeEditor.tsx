import { useState, useMemo, useCallback, useEffect } from "react";
import { NurimazeCanon } from "../types/canon";

interface NurimazeEditorProps {
  initialJson: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;
const EDGE_HIT_WIDTH = 10;

const CELL_TYPES = ["empty", "circle", "triangle", "S", "G"] as const;

function parseCanon(json: string): NurimazeCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.cells && parsed.grids && parsed.grids.h && parsed.grids.v) {
      return parsed as NurimazeCanon;
    }
  } catch {}
  return null;
}

export default function NurimazeEditor({ initialJson, onComplete, onCancel }: NurimazeEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: NurimazeCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const newCells = canon.cells.map((row) => [...row]);
      // Cycle: 0 → 1 → 2 → 3 → 4 → 0
      newCells[r][c] = (newCells[r][c] + 1) % 5;
      updateJson({ ...canon, cells: newCells });
    },
    [canon, updateJson]
  );

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

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid nurimaze JSON. Fix the textarea below, then the board will appear.
        </p>
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

  // Symbols
  const symbols: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * CELL_SIZE + CELL_SIZE / 2;
      const cy = r * CELL_SIZE + CELL_SIZE / 2;
      const val = canon.cells[r][c];

      if (val === 1) {
        symbols.push(
          <circle
            key={`sym-${r}-${c}`}
            cx={cx}
            cy={cy}
            r={CELL_SIZE * 0.28}
            fill="none"
            stroke="black"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        );
      } else if (val === 2) {
        const size = CELL_SIZE * 0.3;
        const points = [
          `${cx},${cy - size}`,
          `${cx - size * 0.87},${cy + size * 0.5}`,
          `${cx + size * 0.87},${cy + size * 0.5}`,
        ].join(" ");
        symbols.push(
          <polygon
            key={`sym-${r}-${c}`}
            points={points}
            fill="none"
            stroke="black"
            strokeWidth={1.5}
            pointerEvents="none"
          />
        );
      } else if (val === 3) {
        symbols.push(
          <text
            key={`sym-${r}-${c}`}
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={CELL_SIZE * 0.5}
            fontFamily="sans-serif"
            fontWeight="bold"
            fill="black"
            pointerEvents="none"
          >
            S
          </text>
        );
      } else if (val === 4) {
        symbols.push(
          <text
            key={`sym-${r}-${c}`}
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={CELL_SIZE * 0.5}
            fontFamily="sans-serif"
            fontWeight="bold"
            fill="black"
            pointerEvents="none"
          >
            G
          </text>
        );
      }
    }
  }

  // Edge click targets (internal edges only)
  const edgeTargets: JSX.Element[] = [];
  // Horizontal internal edges: between row r and row r+1, index in grids.h is [r][c]
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
          onClick={(e) => {
            e.stopPropagation();
            handleHEdgeClick(r, c);
          }}
        />
      );
    }
  }
  // Vertical internal edges: between col c and col c+1, index in grids.v is [r][c]
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
          onClick={(e) => {
            e.stopPropagation();
            handleVEdgeClick(r, c);
          }}
        />
      );
    }
  }

  // Cell click targets (smaller, centered in cell to avoid overlap with edges)
  const cellTargets: JSX.Element[] = [];
  const cellInset = EDGE_HIT_WIDTH / 2 + 1;
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
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
          <input
            type="number"
            value={rows}
            readOnly
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", background: "#eee", border: "1px solid #ccc", borderRadius: 4 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input
            type="number"
            value={cols}
            readOnly
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", background: "#eee", border: "1px solid #ccc", borderRadius: 4 }}
          />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Cell: click center to cycle type | Edge: click border to toggle thick/thin
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {/* Board */}
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
              {symbols}
              {edgeTargets}
              {cellTargets}
            </g>
          </svg>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
            <strong>Legend:</strong> 0=empty, 1=circle, 2=triangle, 3=S, 4=G
          </div>
        </div>

        {/* JSON textarea */}
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
