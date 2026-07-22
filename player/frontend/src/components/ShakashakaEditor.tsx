import { useState, useMemo, useCallback } from "react";
import { ShakashakaCanon } from "../types/canon";

interface ShakashakaEditorProps {
  initialJson: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 36;
const PAD = 12;

function parseCanon(json: string): ShakashakaCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.cells && Array.isArray(parsed.cells)) {
      return parsed as ShakashakaCanon;
    }
  } catch {}
  return null;
}

function makeEmptyCanon(rows: number, cols: number): ShakashakaCanon {
  return {
    cells: Array.from({ length: rows }, () => Array(cols).fill(-1)),
  };
}

export default function ShakashakaEditor({
  initialJson,
  onComplete,
  onCancel,
}: ShakashakaEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: ShakashakaCanon) => {
    setJsonText(JSON.stringify(newCanon, null, 2));
  }, []);

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const newCells = canon.cells.map((row) => [...row]);
      const current = newCells[r][c];
      // Cycle: -1 (white) → 5 (black no number) → 0 → 1 → 2 → 3 → 4 → -1
      if (current === -1) {
        newCells[r][c] = 5;
      } else if (current === 5) {
        newCells[r][c] = 0;
      } else if (current >= 0 && current < 4) {
        newCells[r][c] = current + 1;
      } else {
        newCells[r][c] = -1;
      }
      updateJson({ cells: newCells });
    },
    [canon, updateJson]
  );

  function handleResize(newRows: number, newCols: number) {
    if (newRows < 1 || newCols < 1) return;
    if (canon) {
      const newCells = Array.from({ length: newRows }, (_, r) =>
        Array.from({ length: newCols }, (_, c) =>
          r < canon.cells.length && c < canon.cells[0].length
            ? canon.cells[r][c]
            : -1
        )
      );
      updateJson({ cells: newCells });
    } else {
      updateJson(makeEmptyCanon(newRows, newCols));
    }
  }

  if (!canon) {
    return (
      <div
        style={{
          border: "2px solid #c33",
          borderRadius: 8,
          padding: "1rem",
          background: "#fff8f8",
        }}
      >
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid shakashaka JSON. Fix the textarea below or create a new grid.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => updateJson(makeEmptyCanon(7, 7))}>
            Create 7x7 grid
          </button>
        </div>
        <textarea
          style={{
            width: "100%",
            minHeight: 200,
            fontFamily: "monospace",
            fontSize: "0.8rem",
            padding: "0.5rem",
          }}
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

  const elements: JSX.Element[] = [];

  // Cell backgrounds
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * CELL_SIZE;
      const y = r * CELL_SIZE;
      const cellVal = canon.cells[r][c];
      if (cellVal !== -1) {
        // Black cell
        elements.push(
          <rect
            key={`bg-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="#222"
          />
        );
        if (cellVal >= 0 && cellVal <= 4) {
          elements.push(
            <text
              key={`num-${r}-${c}`}
              x={x + CELL_SIZE / 2}
              y={y + CELL_SIZE / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={CELL_SIZE * 0.5}
              fontFamily="sans-serif"
              fontWeight="bold"
              fill="white"
              pointerEvents="none"
            >
              {cellVal}
            </text>
          );
        }
      } else {
        elements.push(
          <rect
            key={`bg-${r}-${c}`}
            x={x}
            y={y}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="white"
          />
        );
      }
    }
  }

  // Grid lines (dashed inner, solid border)
  for (let r = 0; r <= rows; r++) {
    const isBorder = r === 0 || r === rows;
    elements.push(
      <line
        key={`hline-${r}`}
        x1={0}
        y1={r * CELL_SIZE}
        x2={cols * CELL_SIZE}
        y2={r * CELL_SIZE}
        stroke="#333"
        strokeWidth={isBorder ? 2 : 0.5}
        strokeDasharray={isBorder ? undefined : "3,3"}
      />
    );
  }
  for (let c = 0; c <= cols; c++) {
    const isBorder = c === 0 || c === cols;
    elements.push(
      <line
        key={`vline-${c}`}
        x1={c * CELL_SIZE}
        y1={0}
        x2={c * CELL_SIZE}
        y2={rows * CELL_SIZE}
        stroke="#333"
        strokeWidth={isBorder ? 2 : 0.5}
        strokeDasharray={isBorder ? undefined : "3,3"}
      />
    );
  }

  // Click targets
  const targets: JSX.Element[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      targets.push(
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
    }
  }

  return (
    <div
      style={{
        border: "2px solid #4a90d9",
        borderRadius: 8,
        padding: "1rem",
        background: "#f8fbff",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>
            Rows:
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={rows}
            onChange={(e) => handleResize(Number(e.target.value) || 1, cols)}
            style={{
              width: 50,
              padding: "0.25rem",
              fontSize: "0.85rem",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>
            Cols:
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={cols}
            onChange={(e) => handleResize(rows, Number(e.target.value) || 1)}
            style={{
              width: 50,
              padding: "0.25rem",
              fontSize: "0.85rem",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          />
        </div>
        <span
          style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}
        >
          Click cell to cycle: white → black → 0 → 1 → 2 → 3 → 4 → white
        </span>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg
            width={Math.min(svgWidth, 600)}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{
              border: "1px solid #ccc",
              userSelect: "none",
              display: "block",
              background: "white",
            }}
          >
            <g transform={`translate(${PAD},${PAD})`}>
              {elements}
              {targets}
            </g>
          </svg>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 250,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <label
            style={{
              fontSize: "0.85rem",
              fontWeight: "bold",
              marginBottom: "0.25rem",
            }}
          >
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
          style={{
            padding: "0.5rem 1.25rem",
            background: "#4a90d9",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Complete
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "0.5rem 1rem",
            border: "1px solid #ccc",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
