import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { FillominoCanon } from "../types/canon";
import BoardViewport from "./BoardViewport";

interface FillominoEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const THIN = 1;
const THICK = 3;

function parseCanon(json: string): FillominoCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed.cells && Array.isArray(parsed.cells) && parsed.cells.length > 0) {
      return parsed as FillominoCanon;
    }
  } catch {}
  return null;
}

function createEmptyBoard(rows: number, cols: number): FillominoCanon {
  const cells: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  return { cells };
}

export default function FillominoEditor({ initialJson, onChange }: FillominoEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [inputBuffer, setInputBuffer] = useState("");
  const bufferTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((newCanon: FillominoCanon) => {
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

  const setCellValue = useCallback(
    (r: number, c: number, value: number) => {
      if (!canon) return;
      const newCells = canon.cells.map((row) => [...row]);
      newCells[r][c] = value < 0 ? 0 : value;
      updateJson({ cells: newCells });
    },
    [canon, updateJson]
  );

  const handleCellClick = useCallback((r: number, c: number) => {
    setSelected((prev) => (prev && prev.r === r && prev.c === c ? null : { r, c }));
    setInputBuffer("");
  }, []);

  const handleCreateEmpty = () => {
    if (newRows >= 2 && newCols >= 2) {
      updateJson(createEmptyBoard(newRows, newCols));
    }
  };

  // Keyboard editing for the selected cell: digits set the clue (multi-digit
  // supported via a short buffer), backspace/0 clears, arrows move selection.
  useEffect(() => {
    if (!selected || !canon) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const { r, c } = selected;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
        const next = inputBuffer + e.key;
        setInputBuffer(next);
        setCellValue(r, c, parseInt(next, 10));
        bufferTimeoutRef.current = setTimeout(() => setInputBuffer(""), 1000);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        setCellValue(r, c, 0);
        setInputBuffer("");
        // Note: Escape is intentionally not handled here — the editor modal
        // owns Escape (to close). Re-click a cell to deselect.
      } else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const dr = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        const dc = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          setSelected({ r: nr, c: nc });
          setInputBuffer("");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, canon, inputBuffer, setCellValue, rows, cols]);

  // Clear selection if the board shrinks out from under it.
  useEffect(() => {
    if (selected && (selected.r >= rows || selected.c >= cols)) setSelected(null);
  }, [selected, rows, cols]);

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid fillomino JSON. Fix the textarea or create a new board.
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
          Click a cell, then type a number (0/Backspace clears, arrows move)
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0, width: "100%" }}>
          <BoardViewport
            width={svgWidth}
            height={svgHeight}
            cellSize={CELL_SIZE}
            fill
            focusPoint={
              selected
                ? {
                    x: PAD + selected.c * CELL_SIZE + CELL_SIZE / 2,
                    y: PAD + selected.r * CELL_SIZE + CELL_SIZE / 2,
                  }
                : null
            }
          >
            <g transform={`translate(${PAD},${PAD})`}>
              {/* Cell backgrounds */}
              {Array.from({ length: rows * cols }, (_, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const hasClue = canon.cells[r][c] > 0;
                const isSel = selected && selected.r === r && selected.c === c;
                return (
                  <rect
                    key={`bg-${r}-${c}`}
                    x={c * CELL_SIZE}
                    y={r * CELL_SIZE}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    fill={isSel ? "#ffe9a8" : hasClue ? "#e8f0fe" : "white"}
                  />
                );
              })}

              {/* Numbers */}
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
          </BoardViewport>
          <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
            <strong>Values:</strong> 0 = empty (no clue), positive integer = clue
          </div>
        </div>

      </div>

    </div>
  );
}
