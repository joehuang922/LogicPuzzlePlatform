import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MelonPieCanon, MelonPieCircle } from "../types/canon";
import { MelonPieCircles, MelonPieLattice, MELON_PIE_CELL, MELON_PIE_PAD } from "./MelonPieBoard";
import { melonPieFormatProblems, melonPieWarnings } from "./melonPieRules";

interface MelonPieEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL = MELON_PIE_CELL;
const PAD = MELON_PIE_PAD;

// Circles cycle none -> white -> gray -> black -> none.
const CYCLE: (0 | 1 | 2 | null)[] = [null, 0, 2, 1];

function parseCanon(json: string): MelonPieCanon | null {
  try {
    const p = JSON.parse(json);
    if (!Number.isInteger(p?.width) || !Number.isInteger(p?.height) || p.width < 1 || p.height < 1) return null;
    if (!Array.isArray(p.circles)) return null;
    const ok = p.circles.every((k: Record<string, unknown>) =>
      !!k && Number.isInteger(k.r) && Number.isInteger(k.c) && [0, 1, 2].includes(k.color as number)
    );
    return ok ? { width: p.width, height: p.height, circles: p.circles } : null;
  } catch {
    return null;
  }
}

export function createEmptyMelonPie(rows: number, cols: number): MelonPieCanon {
  return { width: cols, height: rows, circles: [] };
}

/** Resize at the bottom / right; circles off the new lattice go. */
function resize(canon: MelonPieCanon, height: number, width: number): MelonPieCanon {
  return { width, height, circles: canon.circles.filter(({ r, c }) => r <= height && c <= width) };
}

export default function MelonPieEditor({ initialJson, onChange }: MelonPieEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(6);
  const [newCols, setNewCols] = useState(6);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon?.height ?? 0;
  const cols = canon?.width ?? 0;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const update = useCallback((next: MelonPieCanon) => setJsonText(JSON.stringify(next)), []);

  /** The grid point nearest the pointer. */
  const pointAt = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    const r = Math.round(((e.clientY - rect.top) * scale - PAD) / CELL);
    const c = Math.round(((e.clientX - rect.left) * scale - PAD) / CELL);
    return r >= 0 && r <= rows && c >= 0 && c <= cols ? [r, c] : null;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canon) return;
    const pt = pointAt(e);
    if (!pt) return;
    const [r, c] = pt;
    const i = canon.circles.findIndex((k) => k.r === r && k.c === c);
    const cur = i >= 0 ? canon.circles[i].color : null;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    const circles: MelonPieCircle[] = canon.circles.filter((_, j) => j !== i);
    if (next !== null) circles.push({ r, c, color: next });
    circles.sort((a, b) => a.r - b.r || a.c - b.c);
    update({ ...canon, circles });
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid melon pie JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={1} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={1} />
          <button onClick={() => newRows >= 1 && newCols >= 1 && update(createEmptyMelonPie(newRows, newCols))}>
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

  const problems = melonPieFormatProblems(canon);
  const warnings = melonPieWarnings(canon);
  const problemPoints = new Set(problems.map((p) => `${p.r},${p.c}`));

  const sizeButton = (label: string, title: string, r: number, c: number) => (
    <button title={title} disabled={r < 1 || c < 1} onClick={() => update(resize(canon, r, c))}
      style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
      {label}
    </button>
  );

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", fontSize: "0.8rem" }}>
          Rows {rows}
          {sizeButton("+", "Add a row of cells at the bottom", rows + 1, cols)}
          {sizeButton("−", "Remove the bottom row of cells", rows - 1, cols)}
          Cols {cols}
          {sizeButton("+", "Add a column of cells at the right", rows, cols + 1)}
          {sizeButton("−", "Remove the right column of cells", rows, cols - 1)}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click a grid point to cycle its circle: none, white, gray, black
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
        onPointerMove={(e) => setHover(pointAt(e))}
        onPointerLeave={() => setHover(null)}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <MelonPieLattice canon={canon} />
          <MelonPieCircles canon={canon} />
          {[...problemPoints].map((key) => {
            const [r, c] = key.split(",").map(Number);
            return <circle key={`p-${key}`} cx={c * CELL} cy={r * CELL} r={CELL * 0.3} fill="none" stroke="#c33"
              strokeWidth={2} strokeDasharray="4 2" pointerEvents="none" />;
          })}
          {hover && (
            <circle cx={hover[1] * CELL} cy={hover[0] * CELL} r={CELL * 0.27} fill="none" stroke="#4a90d9"
              strokeWidth={3} strokeOpacity={0.7} pointerEvents="none" />
          )}
        </g>
      </svg>
    </div>
  );
}
