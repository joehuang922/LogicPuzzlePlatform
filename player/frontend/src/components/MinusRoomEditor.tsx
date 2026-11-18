import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MinusRoomCanon, MinusRoomCircle } from "../types/canon";
import { MinusRoomCircles, MinusRoomGrid, MR_CELL as S, MR_PAD } from "./MinusRoomBoard";
import { minusRoomFormatProblems, roomIds } from "./minusRoomRules";

interface MinusRoomEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

type Mode = "numbers" | "walls" | "circles";

const grid = (h: number, w: number, from?: number[][]) =>
  Array.from({ length: Math.max(h, 0) }, (_, r) => Array.from({ length: Math.max(w, 0) }, (_, c) => from?.[r]?.[c] ?? 0));

function parseCanon(json: string): MinusRoomCanon | null {
  try {
    const p = JSON.parse(json);
    if (typeof p.rows === "number" && typeof p.cols === "number" && p.rows >= 2 && p.cols >= 2) {
      return {
        rows: p.rows,
        cols: p.cols,
        max: typeof p.max === "number" && p.max >= 1 ? p.max : 4,
        cells: Array.isArray(p.cells) ? p.cells : grid(p.rows, p.cols),
        edges: {
          h: Array.isArray(p.edges?.h) ? p.edges.h : grid(p.rows - 1, p.cols),
          v: Array.isArray(p.edges?.v) ? p.edges.v : grid(p.rows, p.cols - 1),
        },
        circles: Array.isArray(p.circles) ? p.circles : [],
      };
    }
  } catch {}
  return null;
}

function makeEmptyCanon(rows: number, cols: number): MinusRoomCanon {
  return {
    rows,
    cols,
    max: 4,
    cells: grid(rows, cols),
    edges: { h: grid(rows - 1, cols), v: grid(rows, cols - 1) },
    circles: [],
  };
}

const sortCircles = (cs: MinusRoomCircle[]) => [...cs].sort((a, b) => a.dr - b.dr || a.dc - b.dc);

// A click this close (fraction of a cell) to an interior line edits that edge.
const EDGE_ZONE = 0.25;

/** Overridable warnings: a given bigger than its room, nothing given at all. */
export function minusRoomWarnings(canon: MinusRoomCanon): string[] {
  const out: string[] = [];
  const rooms = roomIds(canon);
  const sizes = new Map<number, number>();
  rooms.flat().forEach((id) => sizes.set(id, (sizes.get(id) ?? 0) + 1));
  canon.cells.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v > 0 && v > (sizes.get(rooms[r]?.[c]) ?? 0)) out.push(`Given ${v} at (${r},${c}) is bigger than its room`);
    })
  );
  if (canon.cells.every((row) => row.every((v) => v === 0)) && canon.circles.length === 0) {
    out.push("No givens or circles");
  }
  return out;
}

/**
 * Three modes: Numbers (click a cell to set its given), Walls (click an interior edge
 * to toggle its room wall) and Circles (click an interior edge to set its circled
 * difference). Rows / Cols / Max inputs resize, keeping what still fits.
 */
export default function MinusRoomEditor({ initialJson, onChange }: MinusRoomEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [mode, setMode] = useState<Mode>("numbers");
  const svgRef = useRef<SVGSVGElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon?.rows ?? 0;
  const cols = canon?.cols ?? 0;
  const svgWidth = cols * S + MR_PAD * 2;
  const svgHeight = rows * S + MR_PAD * 2;

  const updateJson = useCallback((next: MinusRoomCanon) => setJsonText(JSON.stringify(next)), []);

  /** The interior edge near (fx, fy) in cell units as doubled coordinates, or null. */
  const edgeAt = (fx: number, fy: number): [number, number] | null => {
    const lineR = Math.round(fy);
    const lineC = Math.round(fx);
    const dy = Math.abs(fy - lineR);
    const dx = Math.abs(fx - lineC);
    const nearH = dy < EDGE_ZONE && lineR > 0 && lineR < rows;
    const nearV = dx < EDGE_ZONE && lineC > 0 && lineC < cols;
    if (nearH && (!nearV || dy <= dx)) return [2 * lineR - 1, 2 * Math.floor(fx)];
    if (nearV) return [2 * Math.floor(fy), 2 * lineC - 1];
    return null;
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!canon) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    const fy = ((e.clientY - rect.top) * scale - MR_PAD) / S;
    const fx = ((e.clientX - rect.left) * scale - MR_PAD) / S;
    if (fx < 0 || fy < 0 || fx >= cols || fy >= rows) return;

    if (mode === "numbers") {
      const r = Math.floor(fy);
      const c = Math.floor(fx);
      const current = canon.cells[r]?.[c] ?? 0;
      const input = window.prompt(`Given for (${r},${c}), 1-${canon.max} (empty or 0 clears)`, current ? String(current) : "");
      if (input === null) return;
      const n = Math.max(0, Math.floor(Number(input.trim() || "0")));
      if (!Number.isFinite(n)) return;
      const cells = grid(rows, cols, canon.cells);
      cells[r][c] = n;
      updateJson({ ...canon, cells });
      return;
    }

    const edge = edgeAt(fx, fy);
    if (!edge) return;
    const [dr, dc] = edge;
    if (mode === "walls") {
      const h = grid(rows - 1, cols, canon.edges.h);
      const v = grid(rows, cols - 1, canon.edges.v);
      if (dr % 2 === 1) h[(dr - 1) / 2][dc / 2] ^= 1;
      else v[dr / 2][(dc - 1) / 2] ^= 1;
      updateJson({ ...canon, edges: { h, v } });
      return;
    }
    const current = canon.circles.find((k) => k.dr === dr && k.dc === dc);
    const input = window.prompt(`Circled difference, 0-${canon.max - 1} (empty clears)`, current ? String(current.value) : "");
    if (input === null) return;
    const others = canon.circles.filter((k) => !(k.dr === dr && k.dc === dc));
    const text = input.trim();
    const value = Math.floor(Number(text));
    const circles = text === "" || !Number.isFinite(value) || value < 0 ? others : [...others, { dr, dc, value }];
    updateJson({ ...canon, circles: sortCircles(circles) });
  };

  const handleResize = (newRows: number, newCols: number, newMax: number) => {
    if (!canon || newRows < 2 || newCols < 2 || newMax < 1 || newMax > 9) return;
    const fits = (k: MinusRoomCircle) => k.dr <= 2 * (newRows - 1) && k.dc <= 2 * (newCols - 1);
    updateJson({
      rows: newRows,
      cols: newCols,
      max: newMax,
      cells: grid(newRows, newCols, canon.cells),
      edges: { h: grid(newRows - 1, newCols, canon.edges.h), v: grid(newRows, newCols - 1, canon.edges.v) },
      circles: canon.circles.filter(fits),
    });
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid minus room JSON. Fix the textarea or create a new grid.</p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => updateJson(makeEmptyCanon(6, 6))}>Create 6x6</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const problems = minusRoomFormatProblems(canon);
  const warnings = problems.length ? [] : minusRoomWarnings(canon);
  const inputStyle = { width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 };
  const modeButton = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      style={{
        padding: "0.2rem 0.6rem",
        borderRadius: 12,
        border: "1px solid #4a90d9",
        background: mode === m ? "#4a90d9" : "white",
        color: mode === m ? "white" : "#4a90d9",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        {([["Rows", rows, (n: number) => handleResize(n, cols, canon.max)],
          ["Cols", cols, (n: number) => handleResize(rows, n, canon.max)],
          ["Max", canon.max, (n: number) => handleResize(rows, cols, n)]] as const).map(([label, value, set]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>{label}:</label>
            <input type="number" onFocus={(e) => e.currentTarget.select()} value={value} min={label === "Max" ? 1 : 2}
              onChange={(e) => set(Number(e.target.value))} style={inputStyle} />
          </div>
        ))}
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {modeButton("numbers", "Numbers")}
          {modeButton("walls", "Walls")}
          {modeButton("circles", "Circles")}
        </div>
      </div>
      <div style={{ fontSize: "0.75rem", color: "#666", marginBottom: "0.75rem" }}>
        {mode === "numbers" && "Click a cell to set its given number."}
        {mode === "walls" && "Click a line between two cells to toggle a room wall."}
        {mode === "circles" && "Click a line between two cells to set its circled difference."}
      </div>

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Fix before saving:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}
      {warnings.map((w) => (
        <div key={w} style={{ color: "#a60", fontSize: "0.8rem", marginBottom: "0.5rem" }}>Warning: {w}</div>
      ))}

      <svg
        ref={svgRef}
        width={Math.min(svgWidth, 600)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white", cursor: "pointer" }}
        onClick={onClick}
      >
        <g transform={`translate(${MR_PAD},${MR_PAD})`}>
          {canon.cells.flatMap((row, r) =>
            row.map((v, c) =>
              v > 0 ? (
                <text key={`g-${r}-${c}`} x={(c + 0.5) * S} y={(r + 0.5) * S} textAnchor="middle" dominantBaseline="central"
                  fontSize={S * 0.5} fontFamily="sans-serif" fontWeight="bold" fill="#111">
                  {v}
                </text>
              ) : null
            )
          )}
          <MinusRoomGrid canon={canon} />
          <MinusRoomCircles canon={canon} />
        </g>
      </svg>
      <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
        1〜{canon.max} · <strong>Givens:</strong> {canon.cells.flat().filter((v) => v > 0).length} ·{" "}
        <strong>Circles:</strong> {canon.circles.length}
      </div>
    </div>
  );
}
