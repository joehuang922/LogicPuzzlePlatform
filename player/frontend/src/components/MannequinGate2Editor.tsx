import { useState, useMemo, useCallback, useEffect } from "react";
import { MannequinGate2Canon } from "../types/canon";
import { formatProblems, warnings } from "./mannequinGate2Rules";
import { CELL_SIZE, MannequinGate2Svg, PAD } from "./MannequinGate2Board";

interface MannequinGate2EditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

function parseCanon(json: string): MannequinGate2Canon | null {
  try {
    const p = JSON.parse(json);
    if (Number.isInteger(p.rows) && Number.isInteger(p.cols) && p.rows > 0 && p.cols > 0 && Array.isArray(p.lines)) {
      return p as MannequinGate2Canon;
    }
  } catch {}
  return null;
}

/**
 * Mannequin Gate 2 editor. Drag from a cell through neighbouring cells (diagonals too) to
 * draw a line; a cell joins the drag once the pointer nears its centre, and dragging back
 * onto the previous cell undoes a step. Click a cell to select a line through it (repeated
 * clicks cycle through that cell's lines) and Delete line removes it.
 */
export default function MannequinGate2Editor({ initialJson, onChange }: MannequinGate2EditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(6);
  const [newCols, setNewCols] = useState(6);
  const [drag, setDrag] = useState<number[][] | null>(null);
  const [selected, setSelected] = useState<{ cell: [number, number]; line: number } | null>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const update = useCallback((next: MannequinGate2Canon) => setJsonText(JSON.stringify(next)), []);

  const resize = (rows: number, cols: number) => {
    if (!canon || rows < 1 || cols < 1) return;
    const lines = canon.lines.filter((l) => l.every(([r, c]) => r < rows && c < cols));
    setSelected(null);
    update({ rows, cols, lines });
  };

  /** The cell whose centre is within ~0.4 cell of the pointer, else null. */
  const cellNear = (e: React.PointerEvent<SVGSVGElement>): [number, number] | null => {
    if (!canon) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = (canon.cols * CELL_SIZE + PAD * 2) / rect.width;
    const x = (e.clientX - rect.left) * scale - PAD;
    const y = (e.clientY - rect.top) * scale - PAD;
    const c = Math.floor(x / CELL_SIZE);
    const r = Math.floor(y / CELL_SIZE);
    if (r < 0 || r >= canon.rows || c < 0 || c >= canon.cols) return null;
    const dx = x / CELL_SIZE - (c + 0.5);
    const dy = y / CELL_SIZE - (r + 0.5);
    return Math.hypot(dx, dy) <= 0.4 ? [r, c] : null;
  };

  const pointer = {
    down: (e: React.PointerEvent<SVGSVGElement>) => {
      const cell = cellNear(e);
      if (!cell) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag([cell]);
    },
    move: (e: React.PointerEvent<SVGSVGElement>) => {
      if (!drag) return;
      const cell = cellNear(e);
      if (!cell) return;
      const last = drag[drag.length - 1];
      if (cell[0] === last[0] && cell[1] === last[1]) return;
      if (Math.max(Math.abs(cell[0] - last[0]), Math.abs(cell[1] - last[1])) !== 1) return;
      const prev = drag[drag.length - 2];
      if (prev && prev[0] === cell[0] && prev[1] === cell[1]) setDrag(drag.slice(0, -1));
      else if (!drag.some(([r, c]) => r === cell[0] && c === cell[1])) setDrag([...drag, cell]);
    },
    up: () => {
      if (!drag || !canon) return;
      if (drag.length >= 2) {
        update({ ...canon, lines: [...canon.lines, drag] });
        setSelected({ cell: [drag[0][0], drag[0][1]], line: canon.lines.length });
      } else {
        // A click: select the next line through this cell.
        const [r, c] = drag[0];
        const through = canon.lines.flatMap((l, i) => (l.some(([lr, lc]) => lr === r && lc === c) ? [i] : []));
        if (through.length === 0) setSelected(null);
        else {
          const same = selected && selected.cell[0] === r && selected.cell[1] === c;
          const k = same ? (through.indexOf(selected!.line) + 1) % through.length : 0;
          setSelected({ cell: [r, c], line: through[k] });
        }
      }
      setDrag(null);
    },
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid Mannequin Gate 2 JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 1 && newCols >= 1 && update({ rows: newRows, cols: newCols, lines: [] })}>Create Empty Board</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const problems = formatProblems(canon);
  const warns = warnings(canon);
  const sel = selected && selected.line < canon.lines.length ? selected : null;

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
        <input type="number" onFocus={(e) => e.currentTarget.select()} value={canon.rows} min={1}
          onChange={(e) => resize(Number(e.target.value), canon.cols)} style={{ width: 50 }} />
        <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
        <input type="number" onFocus={(e) => e.currentTarget.select()} value={canon.cols} min={1}
          onChange={(e) => resize(canon.rows, Number(e.target.value))} style={{ width: 50 }} />
        <button
          disabled={!sel}
          onClick={() => {
            if (!sel) return;
            update({ ...canon, lines: canon.lines.filter((_, i) => i !== sel.line) });
            setSelected(null);
          }}
        >
          Delete line{sel ? ` ${sel.line + 1}` : ""}
        </button>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Drag cell to cell (diagonals too) to draw a line · click a cell to select a line through it
        </div>
      </div>

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Fix before saving:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      {warns.length > 0 && (
        <ul style={{ color: "#b70", fontSize: "0.8rem", margin: "0 0 0.75rem", paddingLeft: "1.25rem" }}>
          {warns.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <div style={{ maxWidth: Math.min(canon.cols * CELL_SIZE + PAD * 2, 600), background: "white", border: "1px solid #ccc", cursor: "crosshair" }}>
        <MannequinGate2Svg
          canon={drag && drag.length >= 2 ? { ...canon, lines: [...canon.lines, drag] } : canon}
          highlightLines={[...(sel ? [sel.line] : []), ...(drag && drag.length >= 2 ? [canon.lines.length] : [])]}
          highlightCells={drag ?? (sel ? [sel.cell] : [])}
          onCellPointer={pointer}
        />
      </div>
    </div>
  );
}
