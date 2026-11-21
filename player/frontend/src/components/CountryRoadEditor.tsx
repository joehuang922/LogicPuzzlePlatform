import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { CountryRoadCanon } from "../types/canon";
import { CountryRoadGrid, COUNTRY_ROAD_CELL, COUNTRY_ROAD_PAD } from "./CountryRoadBoard";
import { countryRoadFormatProblems, countryRoadWarnings } from "./countryRoadRules";

interface CountryRoadEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL = COUNTRY_ROAD_CELL;
const PAD = COUNTRY_ROAD_PAD;

type Mode = "walls" | "numbers";
type Edge = { kind: "h" | "v"; r: number; c: number };

function parseCanon(json: string): CountryRoadCanon | null {
  try {
    const parsed = JSON.parse(json);
    const cells = parsed?.cells;
    if (!Array.isArray(cells) || cells.length === 0 || !Array.isArray(cells[0]) || cells[0].length === 0) return null;
    if (!cells.every((row: unknown) => Array.isArray(row) && row.every((v) => typeof v === "number"))) return null;
    if (!Array.isArray(parsed.grids?.h) || !Array.isArray(parsed.grids?.v)) return null;
    return { cells, grids: { h: parsed.grids.h, v: parsed.grids.v } };
  } catch {
    return null;
  }
}

/** An empty board: one room, no numbers. */
export function createEmptyCountryRoad(rows: number, cols: number): CountryRoadCanon {
  return {
    cells: Array.from({ length: rows }, () => Array(cols).fill(0)),
    grids: {
      h: Array.from({ length: rows - 1 }, () => Array(cols).fill(0)),
      v: Array.from({ length: rows }, () => Array(cols - 1).fill(0)),
    },
  };
}

/** Resize at the bottom / right; new cells join no room (walls all round them). */
function resize(canon: CountryRoadCanon, rows: number, cols: number): CountryRoadCanon {
  const oldRows = canon.cells.length;
  const oldCols = canon.cells[0].length;
  const isNew = (r: number, c: number) => r >= oldRows || c >= oldCols;
  return {
    cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => canon.cells[r]?.[c] ?? 0)),
    grids: {
      h: Array.from({ length: rows - 1 }, (_, r) =>
        Array.from({ length: cols }, (_, c) =>
          isNew(r, c) || isNew(r + 1, c) ? (isNew(r, c) && isNew(r + 1, c) ? 0 : 1) : canon.grids.h[r][c]
        )
      ),
      v: Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols - 1 }, (_, c) =>
          isNew(r, c) || isNew(r, c + 1) ? (isNew(r, c) && isNew(r, c + 1) ? 0 : 1) : canon.grids.v[r][c]
        )
      ),
    },
  };
}

export default function CountryRoadEditor({ initialJson, onChange }: CountryRoadEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const [mode, setMode] = useState<Mode>("walls");
  const [hover, setHover] = useState<Edge | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const update = useCallback((next: CountryRoadCanon) => setJsonText(JSON.stringify(next)), []);

  const pointAt = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    return [((e.clientX - rect.left) * scale - PAD) / CELL, ((e.clientY - rect.top) * scale - PAD) / CELL];
  };

  // The interior edge nearest the pointer, if close enough.
  const edgeAt = (x: number, y: number): Edge | null => {
    const c = Math.floor(x);
    const r = Math.floor(y);
    const fx = x - c;
    const fy = y - r;
    const cands: [number, Edge][] = [
      [fy, { kind: "h" as const, r: r - 1, c }],
      [1 - fy, { kind: "h" as const, r, c }],
      [fx, { kind: "v" as const, r, c: c - 1 }],
      [1 - fx, { kind: "v" as const, r, c }],
    ].sort((a, b) => (a[0] as number) - (b[0] as number)) as [number, Edge][];
    const [dist, edge] = cands[0];
    if (dist > 0.3) return null;
    if (edge.kind === "h" && (edge.r < 0 || edge.r >= rows - 1 || edge.c < 0 || edge.c >= cols)) return null;
    if (edge.kind === "v" && (edge.c < 0 || edge.c >= cols - 1 || edge.r < 0 || edge.r >= rows)) return null;
    return edge;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canon) return;
    const p = pointAt(e);
    if (!p) return;
    const [x, y] = p;
    if (mode === "walls") {
      const edge = edgeAt(x, y);
      if (!edge) return;
      const grids = { h: canon.grids.h.map((row) => [...row]), v: canon.grids.v.map((row) => [...row]) };
      grids[edge.kind][edge.r][edge.c] = grids[edge.kind][edge.r][edge.c] === 1 ? 0 : 1;
      update({ ...canon, grids });
      return;
    }
    const c = Math.floor(x);
    const r = Math.floor(y);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    setSelected([r, c]);
    setTimeout(() => numberRef.current?.focus(), 0);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode !== "walls") return;
    const p = pointAt(e);
    setHover(p ? edgeAt(p[0], p[1]) : null);
  };

  const setNumber = (text: string) => {
    if (!canon || !selected) return;
    const n = text.trim() === "" ? 0 : Number(text);
    if (!Number.isInteger(n) || n < 0) return;
    const cells = canon.cells.map((row) => [...row]);
    cells[selected[0]][selected[1]] = n;
    update({ ...canon, cells });
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid country road JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 2 && newCols >= 2 && update(createEmptyCountryRoad(newRows, newCols))}>
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

  const problems = countryRoadFormatProblems(canon);
  const warnings = countryRoadWarnings(canon);
  const marked = new Map<string, string>();
  warnings.forEach((p) => marked.set(`${p.r},${p.c}`, "#e69500"));
  problems.forEach((p) => marked.set(`${p.r},${p.c}`, "#c33"));
  const sel = selected && selected[0] < rows && selected[1] < cols ? selected : null;

  const modeButton = (m: Mode, label: string) => (
    <button
      onClick={() => {
        setMode(m);
        setHover(null);
        setSelected(null);
      }}
      style={{
        padding: "0.25rem 0.6rem",
        fontSize: "0.85rem",
        border: "1px solid #4a90d9",
        borderRadius: 4,
        background: mode === m ? "#4a90d9" : "white",
        color: mode === m ? "white" : "#4a90d9",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const sizeButton = (label: string, title: string, r: number, c: number) => (
    <button
      title={title}
      disabled={r < 2 || c < 2}
      onClick={() => {
        update(resize(canon, r, c));
        setSelected(null);
      }}
      style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {modeButton("walls", "Walls")}
          {modeButton("numbers", "Numbers")}
        </div>
        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", fontSize: "0.8rem" }}>
          Rows {rows}
          {sizeButton("+", "Add a row at the bottom", rows + 1, cols)}
          {sizeButton("−", "Remove the bottom row", rows - 1, cols)}
          Cols {cols}
          {sizeButton("+", "Add a column at the right", rows, cols + 1)}
          {sizeButton("−", "Remove the right column", rows, cols - 1)}
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          {mode === "walls" ? "Click an edge between two cells to toggle its wall" : "Click a cell, then type its number (blank for none)"}
        </div>
      </div>

      {mode === "numbers" && sel && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <span style={{ fontSize: "0.85rem" }}>
            R{sel[0] + 1}C{sel[1] + 1}
          </span>
          <input
            ref={numberRef}
            type="number"
            min={1}
            value={canon.cells[sel[0]][sel[1]] || ""}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setNumber(e.target.value)}
            style={{ width: 60, padding: "0.2rem" }}
          />
        </div>
      )}

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
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          {mode === "numbers" && sel && (
            <rect x={sel[1] * CELL} y={sel[0] * CELL} width={CELL} height={CELL} fill="#fff3c4" />
          )}
          <CountryRoadGrid canon={canon} />
          {[...marked].map(([key, color]) => {
            const [r, c] = key.split(",").map(Number);
            return (
              <rect key={`p-${key}`} x={c * CELL + 3} y={r * CELL + 3} width={CELL - 6} height={CELL - 6}
                fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 2" pointerEvents="none" />
            );
          })}
          {hover && (
            <line
              x1={hover.kind === "h" ? hover.c * CELL : (hover.c + 1) * CELL}
              y1={hover.kind === "h" ? (hover.r + 1) * CELL : hover.r * CELL}
              x2={(hover.c + 1) * CELL}
              y2={(hover.r + 1) * CELL}
              stroke="#4a90d9"
              strokeWidth={5}
              strokeOpacity={0.6}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
    </div>
  );
}
