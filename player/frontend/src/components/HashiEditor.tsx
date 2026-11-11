import { useState, useMemo, useCallback, useEffect } from "react";
import { HashiCanon } from "../types/canon";
import { EMPTY, MAX_CLUE, hashiWarnings, isIsland } from "./hashiRules";

interface HashiEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const PITCH = 36;
const PAD = 20;
const RADIUS = PITCH * 0.42;

function parseCanon(json: string): HashiCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed.cells) && parsed.cells.length > 0 && Array.isArray(parsed.cells[0])) {
      return parsed as HashiCanon;
    }
  } catch {}
  return null;
}

/** Click a lattice point to cycle empty -> 1 -> ... -> 8 -> empty; right-click goes back. */
export default function HashiEditor({ initialJson, onChange }: HashiEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(9);
  const [newCols, setNewCols] = useState(9);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;

  const updateJson = useCallback((next: HashiCanon) => setJsonText(JSON.stringify(next)), []);

  const cycle = (r: number, c: number, step: number) => {
    if (!canon) return;
    const cells = canon.cells.map((row) => [...row]);
    const span = MAX_CLUE + 1;
    cells[r][c] = (((cells[r][c] + step) % span) + span) % span;
    updateJson({ cells });
  };

  const handleResize = useCallback(
    (newR: number, newC: number) => {
      if (!canon || newR < 1 || newC < 1) return;
      const cells = Array.from({ length: newR }, (_, r) =>
        Array.from({ length: newC }, (_, c) => (r < rows && c < cols ? canon.cells[r][c] : EMPTY))
      );
      updateJson({ cells });
    },
    [canon, rows, cols, updateJson]
  );

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid Hashi JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 2 && newCols >= 2 && updateJson({ cells: Array.from({ length: newRows }, () => Array(newCols).fill(EMPTY)) })}>
            Create Empty Board
          </button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const svgWidth = (cols - 1) * PITCH + PAD * 2;
  const svgHeight = (rows - 1) * PITCH + PAD * 2;
  const warnings = hashiWarnings(canon.cells);

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={rows} min={1}
            onChange={(e) => handleResize(Number(e.target.value), cols)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={cols} min={1}
            onChange={(e) => handleResize(rows, Number(e.target.value))}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click: empty → 1 → … → 8 · right-click goes back
        </div>
      </div>

      {warnings.length > 0 && (
        <ul style={{ color: "#c33", fontSize: "0.8rem", margin: "0 0 0.75rem", paddingLeft: "1.25rem" }}>
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <svg
        width={Math.min(svgWidth, 600)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {canon.cells.flatMap((row, r) =>
            row.map((v, c) => (
              <g
                key={`p-${r}-${c}`}
                onClick={() => cycle(r, c, 1)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  cycle(r, c, -1);
                }}
                style={{ cursor: "pointer" }}
              >
                <rect x={(c - 0.5) * PITCH} y={(r - 0.5) * PITCH} width={PITCH} height={PITCH} fill="transparent" />
                {isIsland(v) ? (
                  <>
                    <circle cx={c * PITCH} cy={r * PITCH} r={RADIUS} fill="white" stroke="#222" strokeWidth={1.8} />
                    <text x={c * PITCH} y={r * PITCH} textAnchor="middle" dominantBaseline="central" fontSize={PITCH * 0.5} fill="black">
                      {v}
                    </text>
                  </>
                ) : (
                  <circle cx={c * PITCH} cy={r * PITCH} r={2} fill="#bbb" />
                )}
              </g>
            ))
          )}
        </g>
      </svg>
    </div>
  );
}
