import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { HalfFullPaintCircle, TetroChainKCanon } from "../types/canon";
import { TetroChainKCircles, TetroChainKGrid, TETRO_CHAIN_K_CELL, TETRO_CHAIN_K_PAD } from "./TetroChainKBoard";
import { tetroChainKFormatProblems, tetroChainKWarnings } from "./tetroChainKRules";

interface TetroChainKEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL = TETRO_CHAIN_K_CELL;
const PAD = TETRO_CHAIN_K_PAD;

// Circles cycle none -> white -> gray -> black -> none.
const CYCLE: (0 | 1 | 2 | null)[] = [null, 0, 2, 1];

function parseCanon(json: string): TetroChainKCanon | null {
  try {
    const p = JSON.parse(json);
    if (!Number.isInteger(p?.width) || !Number.isInteger(p?.height) || p.width < 1 || p.height < 1) return null;
    if (!Array.isArray(p.circles)) return null;
    const ok = p.circles.every((k: Record<string, unknown>) =>
      !!k && Number.isInteger(k.dr) && Number.isInteger(k.dc) && [0, 1, 2].includes(k.color as number)
    );
    return ok ? { width: p.width, height: p.height, circles: p.circles } : null;
  } catch {
    return null;
  }
}

export function createEmptyTetroChainK(rows: number, cols: number): TetroChainKCanon {
  return { width: cols, height: rows, circles: [] };
}

/** Resize at the bottom / right; circles off the new board's interior lines go. */
function resize(canon: TetroChainKCanon, height: number, width: number): TetroChainKCanon {
  return { width, height, circles: canon.circles.filter(({ dr, dc }) => dr <= 2 * height - 1 && dc <= 2 * width - 1) };
}

export default function TetroChainKEditor({ initialJson, onChange }: TetroChainKEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(8);
  const [newCols, setNewCols] = useState(8);
  const [hover, setHover] = useState<{ dr: number; dc: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon?.height ?? 0;
  const cols = canon?.width ?? 0;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const update = useCallback((next: TetroChainKCanon) => setJsonText(JSON.stringify(next)), []);

  /** The nearest edge midpoint or interior corner (doubled coordinates, one even). */
  const latticeAt = (e: React.PointerEvent): { dr: number; dc: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    const x = ((e.clientX - rect.left) * scale - PAD) / CELL;
    const y = ((e.clientY - rect.top) * scale - PAD) / CELL;
    const dr = Math.round(y * 2);
    const dc = Math.round(x * 2);
    if (dr < 1 || dc < 1 || dr > 2 * rows - 1 || dc > 2 * cols - 1) return null;
    if (dr % 2 === 1 && dc % 2 === 1) return null;
    return { dr, dc };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canon) return;
    const pt = latticeAt(e);
    if (!pt) return;
    const i = canon.circles.findIndex((k) => k.dr === pt.dr && k.dc === pt.dc);
    const cur = i >= 0 ? canon.circles[i].color : null;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    const circles: HalfFullPaintCircle[] = canon.circles.filter((_, j) => j !== i);
    if (next !== null) circles.push({ dr: pt.dr, dc: pt.dc, color: next });
    circles.sort((a, b) => a.dr - b.dr || a.dc - b.dc);
    update({ ...canon, circles });
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid tetro chain k JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 2 && newCols >= 2 && update(createEmptyTetroChainK(newRows, newCols))}>
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

  const problems = tetroChainKFormatProblems(canon);
  const warnings = tetroChainKWarnings(canon);
  const problemCells = new Set(problems.map((p) => `${p.r},${p.c}`));

  const sizeButton = (label: string, title: string, r: number, c: number) => (
    <button title={title} disabled={r < 2 || c < 2} onClick={() => update(resize(canon, r, c))}
      style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
      {label}
    </button>
  );

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", fontSize: "0.8rem" }}>
          Rows {rows}
          {sizeButton("+", "Add a row at the bottom", rows + 1, cols)}
          {sizeButton("−", "Remove the bottom row", rows - 1, cols)}
          Cols {cols}
          {sizeButton("+", "Add a column at the right", rows, cols + 1)}
          {sizeButton("−", "Remove the right column", rows, cols - 1)}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click an edge midpoint or corner to cycle its circle: none, white, gray, black
        </div>
      </div>

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Fix before saving:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ color: "#a66b00", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Check:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {warnings.map((p) => (
              <li key={p.message}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}

      <svg
        ref={svgRef}
        width={Math.min(svgWidth, 720)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", touchAction: "none", display: "block", background: "white", cursor: "pointer" }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => setHover(latticeAt(e))}
        onPointerLeave={() => setHover(null)}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <rect x={0} y={0} width={cols * CELL} height={rows * CELL} fill="white" />
          <TetroChainKGrid canon={canon} />
          {[...problemCells].map((key) => {
            const [r, c] = key.split(",").map(Number);
            return (
              <rect key={`p-${key}`} x={c * CELL + 3} y={r * CELL + 3} width={CELL - 6} height={CELL - 6}
                fill="none" stroke="#c33" strokeWidth={2} strokeDasharray="4 2" pointerEvents="none" />
            );
          })}
          <TetroChainKCircles canon={canon} />
          {hover && (
            <circle cx={(hover.dc / 2) * CELL} cy={(hover.dr / 2) * CELL} r={CELL * 0.22} fill="none"
              stroke="#4a90d9" strokeWidth={3} strokeOpacity={0.7} pointerEvents="none" />
          )}
        </g>
      </svg>
    </div>
  );
}
