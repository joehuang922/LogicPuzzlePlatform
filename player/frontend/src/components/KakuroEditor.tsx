import { useState, useEffect } from "react";
import { KakuroCell } from "../types/canon";

interface KakuroEditorProps {
  initialCanon?: string;
  onComplete: (json: string) => void;
  onCancel: () => void;
}

const CELL_SIZE = 40;
const PAD = 16;

function buildDefaultCells(rows: number, cols: number): KakuroCell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ type: "clue" as const, right: null, down: null }))
  );
}

export default function KakuroEditor({ initialCanon, onComplete, onCancel }: KakuroEditorProps) {
  let initRows = 5, initCols = 5;
  let initCells: KakuroCell[][] | null = null;
  if (initialCanon) {
    try {
      const parsed = JSON.parse(initialCanon);
      if (parsed.cells) {
        initCells = parsed.cells;
        initRows = parsed.cells.length;
        initCols = parsed.cells[0].length;
      }
    } catch { /* ignore */ }
  }

  const [rows, setRows] = useState(initRows);
  const [cols, setCols] = useState(initCols);
  const [cells, setCells] = useState<KakuroCell[][]>(initCells ?? buildDefaultCells(initRows, initCols));
  const [jsonText, setJsonText] = useState(JSON.stringify({ cells }, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [editingClue, setEditingClue] = useState<{ r: number; c: number } | null>(null);

  useEffect(() => {
    setJsonText(JSON.stringify({ cells }, null, 2));
    setJsonError(null);
  }, [cells]);

  function handleJsonChange(text: string) {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (parsed.cells && Array.isArray(parsed.cells)) {
        setCells(parsed.cells);
        setRows(parsed.cells.length);
        setCols(parsed.cells[0].length);
        setJsonError(null);
      } else {
        setJsonError("Missing 'cells' array");
      }
    } catch (e: unknown) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  function resizeGrid(newRows: number, newCols: number) {
    const newCells: KakuroCell[][] = Array.from({ length: newRows }, (_, r) =>
      Array.from({ length: newCols }, (_, c) => {
        if (r < cells.length && c < cells[0].length) return cells[r][c];
        return { type: "clue" as const, right: null, down: null };
      })
    );
    setRows(newRows);
    setCols(newCols);
    setCells(newCells);
  }

  function handleCellClick(r: number, c: number) {
    const cell = cells[r][c];
    if (cell.type === "empty") {
      // Toggle to clue
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = { type: "clue", right: null, down: null };
        return next;
      });
    } else {
      // Toggle to empty
      setCells((prev) => {
        const next = prev.map((row) => [...row]);
        next[r][c] = { type: "empty" };
        return next;
      });
    }
    setEditingClue(null);
  }

  function handleClueRightClick(r: number, c: number, e: React.MouseEvent) {
    e.preventDefault();
    const cell = cells[r][c];
    if (cell.type === "clue") {
      setEditingClue({ r, c });
    }
  }

  function updateClue(r: number, c: number, field: "right" | "down", value: string) {
    setCells((prev) => {
      const next = prev.map((row) => [...row]);
      const cell = next[r][c];
      if (cell.type === "clue") {
        const numVal = value === "" ? null : parseInt(value);
        next[r][c] = { ...cell, [field]: isNaN(numVal as number) ? null : numVal };
      }
      return next;
    });
  }

  function handleDone() {
    onComplete(JSON.stringify({ cells }, null, 2));
  }

  const svgWidth = cols * CELL_SIZE + PAD * 2;
  const svgHeight = rows * CELL_SIZE + PAD * 2;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Rows:{" "}
          <input type="number" min={2} max={30} value={rows} onChange={(e) => resizeGrid(Number(e.target.value) || 2, cols)} style={{ width: 50 }} />
        </label>
        <label>
          Cols:{" "}
          <input type="number" min={2} max={30} value={cols} onChange={(e) => resizeGrid(rows, Number(e.target.value) || 2)} style={{ width: 50 }} />
        </label>
        <span style={{ fontSize: "0.8rem", color: "#666" }}>Click: toggle clue/empty. Right-click clue: edit numbers.</span>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <svg
          width={Math.min(svgWidth, 600)}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", display: "block" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
              const x = PAD + c * CELL_SIZE;
              const y = PAD + r * CELL_SIZE;
              const cell = cells[r][c];
              const elements: JSX.Element[] = [];

              if (cell.type === "clue") {
                elements.push(
                  <rect key={`bg-${r}-${c}`} x={x} y={y} width={CELL_SIZE} height={CELL_SIZE} fill="#444" />
                );
                elements.push(
                  <line key={`diag-${r}-${c}`} x1={x} y1={y} x2={x + CELL_SIZE} y2={y + CELL_SIZE} stroke="#666" strokeWidth={1} />
                );
                if (cell.right != null) {
                  elements.push(
                    <text key={`r-${r}-${c}`} x={x + CELL_SIZE * 0.72} y={y + CELL_SIZE * 0.35} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="white" pointerEvents="none">{cell.right}</text>
                  );
                }
                if (cell.down != null) {
                  elements.push(
                    <text key={`d-${r}-${c}`} x={x + CELL_SIZE * 0.28} y={y + CELL_SIZE * 0.7} textAnchor="middle" dominantBaseline="central" fontSize={11} fill="white" pointerEvents="none">{cell.down}</text>
                  );
                }
              } else {
                elements.push(
                  <rect key={`bg-${r}-${c}`} x={x} y={y} width={CELL_SIZE} height={CELL_SIZE} fill="#f9f9f9" />
                );
                elements.push(
                  <circle key={`dot-${r}-${c}`} cx={x + CELL_SIZE / 2} cy={y + CELL_SIZE / 2} r={3} fill="#ccc" pointerEvents="none" />
                );
              }

              elements.push(
                <rect
                  key={`click-${r}-${c}`}
                  x={x}
                  y={y}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  fill="transparent"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleCellClick(r, c)}
                  onContextMenu={(e) => handleClueRightClick(r, c, e)}
                />
              );

              return elements;
            })
          ).flat(2)}
          {/* Grid lines */}
          {Array.from({ length: rows + 1 }, (_, r) => (
            <line key={`h-${r}`} x1={PAD} y1={PAD + r * CELL_SIZE} x2={PAD + cols * CELL_SIZE} y2={PAD + r * CELL_SIZE} stroke="#333" strokeWidth={r === 0 || r === rows ? 2 : 0.5} />
          ))}
          {Array.from({ length: cols + 1 }, (_, c) => (
            <line key={`v-${c}`} x1={PAD + c * CELL_SIZE} y1={PAD} x2={PAD + c * CELL_SIZE} y2={PAD + rows * CELL_SIZE} stroke="#333" strokeWidth={c === 0 || c === cols ? 2 : 0.5} />
          ))}
        </svg>

        {editingClue && cells[editingClue.r][editingClue.c].type === "clue" && (
          <div style={{ padding: "0.5rem", border: "1px solid #ccc", borderRadius: 4, background: "#fafafa" }}>
            <div style={{ marginBottom: 8, fontWeight: "bold" }}>
              Clue at ({editingClue.c}, {editingClue.r})
            </div>
            <label style={{ display: "block", marginBottom: 4 }}>
              Right (→):{" "}
              <input
                type="number"
                min={1}
                max={45}
                value={(cells[editingClue.r][editingClue.c] as { type: "clue"; right?: number | null; down?: number | null }).right ?? ""}
                onChange={(e) => updateClue(editingClue.r, editingClue.c, "right", e.target.value)}
                style={{ width: 50 }}
              />
            </label>
            <label style={{ display: "block" }}>
              Down (↓):{" "}
              <input
                type="number"
                min={1}
                max={45}
                value={(cells[editingClue.r][editingClue.c] as { type: "clue"; right?: number | null; down?: number | null }).down ?? ""}
                onChange={(e) => updateClue(editingClue.r, editingClue.c, "down", e.target.value)}
                style={{ width: 50 }}
              />
            </label>
            <button
              onClick={() => {
                const { r, c } = editingClue;
                setCells((prev) => {
                  const next = prev.map((row) => [...row]);
                  const cell = next[r][c];
                  if (cell.type === "clue") {
                    next[r][c] = { ...cell, right: cell.down, down: cell.right };
                  }
                  return next;
                });
              }}
              style={{ marginTop: 8, marginRight: 8 }}
            >Swap ↓/→</button>
            <button onClick={() => setEditingClue(null)} style={{ marginTop: 8 }}>Close</button>
          </div>
        )}
      </div>

      <div>
        <label style={{ display: "block", marginBottom: 4, fontWeight: "bold" }}>JSON (source of truth):</label>
        <textarea
          value={jsonText}
          onChange={(e) => handleJsonChange(e.target.value)}
          rows={12}
          style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }}
        />
        {jsonError && <div style={{ color: "red", fontSize: 12 }}>{jsonError}</div>}
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={handleDone} style={{ padding: "0.5rem 1rem" }}>Done</button>
        <button onClick={onCancel} style={{ padding: "0.5rem 1rem" }}>Cancel</button>
      </div>
    </div>
  );
}
