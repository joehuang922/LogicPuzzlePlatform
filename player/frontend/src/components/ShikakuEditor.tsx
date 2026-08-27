import { useState, useMemo, useCallback, useEffect} from "react";
import { ShikakuCanon } from "../types/canon";

interface ShikakuEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

function parseCanon(json: string): ShikakuCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.cells && Array.isArray(parsed.cells) && parsed.cells.length > 0) {
      return parsed as ShikakuCanon;
    }
  } catch {}
  return null;
}

function createEmptyBoard(rows: number, cols: number): ShikakuCanon {
  const cells: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  return { cells };
}

function clueSum(canon: ShikakuCanon): number {
  let sum = 0;
  for (const row of canon.cells) for (const v of row) if (v > 0) sum += v;
  return sum;
}

export default function ShikakuEditor({ initialJson, onChange }: ShikakuEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: ShikakuCanon) => {
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
        `Enter clue for cell (row ${r}, col ${c}). Current: ${current || "empty"}. Enter 0 or empty to clear.`
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
          Invalid shikaku JSON. Fix the textarea or create a new board.
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
  const sum = clueSum(canon);
  const area = rows * cols;

  const gridLines: JSX.Element[] = [];
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
          Click cell to set clue number (0 = empty)
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

              {/* Clue circles */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const num = canon.cells[r][c];
                if (num <= 0) return null;
                const cx = c * CELL_SIZE + CELL_SIZE / 2;
                const cy = r * CELL_SIZE + CELL_SIZE / 2;
                return (
                  <g key={`clue-${r}-${c}`} pointerEvents="none">
                    <circle cx={cx} cy={cy} r={CELL_SIZE * 0.36} fill="#1f2937" />
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={CELL_SIZE * 0.4}
                      fontFamily="sans-serif"
                      fontWeight="bold"
                      fill="white"
                    >
                      {num}
                    </text>
                  </g>
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
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: sum === area ? "#2a7" : "#c60" }}>
            <strong>Clue sum:</strong> {sum} / {area} (grid area){" "}
            {sum === area ? "✓" : "— must equal grid area for a valid puzzle"}
          </div>
        </div>

      </div>

    </div>
  );
}
