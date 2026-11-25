import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { HalfFullPaintCanon, HalfFullPaintCircle } from "../types/canon";
import { HalfFullPaintCircles, HalfFullPaintGrid, HALF_FULL_PAINT_CELL, HALF_FULL_PAINT_PAD } from "./HalfFullPaintBoard";
import { halfFullPaintFormatProblems, halfFullPaintWarnings } from "./halfFullPaintRules";

interface HalfFullPaintEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL = HALF_FULL_PAINT_CELL;
const PAD = HALF_FULL_PAINT_PAD;

type Mode = "walls" | "circles";
type Edge = { kind: "h" | "v"; r: number; c: number };
type Point = { dr: number; dc: number };

// Circles cycle none -> white -> gray -> black -> none.
const CYCLE: (0 | 1 | 2 | null)[] = [null, 0, 2, 1];

function parseCanon(json: string): HalfFullPaintCanon | null {
  try {
    const p = JSON.parse(json);
    if (!Number.isInteger(p?.width) || !Number.isInteger(p?.height) || p.width < 1 || p.height < 1) return null;
    if (!Array.isArray(p.grids?.h) || !Array.isArray(p.grids?.v) || !Array.isArray(p.circles)) return null;
    const isCircle = (o: unknown) => {
      const c = o as Record<string, unknown>;
      return !!c && Number.isInteger(c.dr) && Number.isInteger(c.dc) && [0, 1, 2].includes(c.color as number);
    };
    if (!p.circles.every(isCircle)) return null;
    return { width: p.width, height: p.height, grids: { h: p.grids.h, v: p.grids.v }, circles: p.circles };
  } catch {
    return null;
  }
}

/** An empty board: one room, no circles. */
export function createEmptyHalfFullPaint(rows: number, cols: number): HalfFullPaintCanon {
  return {
    width: cols,
    height: rows,
    grids: {
      h: Array.from({ length: rows - 1 }, () => Array(cols).fill(0)),
      v: Array.from({ length: rows }, () => Array(cols - 1).fill(0)),
    },
    circles: [],
  };
}

/** Resize at the bottom / right: new cells are walled off from the old board; circles off it go. */
function resize(canon: HalfFullPaintCanon, rows: number, cols: number): HalfFullPaintCanon {
  const isNew = (r: number, c: number) => r >= canon.height || c >= canon.width;
  const edge = (old: number | undefined, a: boolean, b: boolean) => (a || b ? (a && b ? 0 : 1) : old ?? 0);
  return {
    width: cols,
    height: rows,
    grids: {
      h: Array.from({ length: rows - 1 }, (_, r) =>
        Array.from({ length: cols }, (_, c) => edge(canon.grids.h[r]?.[c], isNew(r, c), isNew(r + 1, c)))
      ),
      v: Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols - 1 }, (_, c) => edge(canon.grids.v[r]?.[c], isNew(r, c), isNew(r, c + 1)))
      ),
    },
    circles: canon.circles.filter(({ dr, dc }) => dr <= 2 * rows - 1 && dc <= 2 * cols - 1),
  };
}

export default function HalfFullPaintEditor({ initialJson, onChange }: HalfFullPaintEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(10);
  const [newCols, setNewCols] = useState(10);
  const [mode, setMode] = useState<Mode>("walls");
  const [hoverEdge, setHoverEdge] = useState<Edge | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon?.height ?? 0;
  const cols = canon?.width ?? 0;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const update = useCallback((next: HalfFullPaintCanon) => setJsonText(JSON.stringify(next)), []);

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
      [fy, { kind: "h", r: r - 1, c }],
      [1 - fy, { kind: "h", r, c }],
      [fx, { kind: "v", r, c: c - 1 }],
      [1 - fx, { kind: "v", r, c }],
    ];
    cands.sort((a, b) => a[0] - b[0]);
    const [dist, e] = cands[0];
    if (dist > 0.3) return null;
    if (e.kind === "h" && (e.r < 0 || e.r >= rows - 1 || e.c < 0 || e.c >= cols)) return null;
    if (e.kind === "v" && (e.c < 0 || e.c >= cols - 1 || e.r < 0 || e.r >= rows)) return null;
    return e;
  };

  // The nearest edge midpoint or interior corner (doubled coordinates, one even).
  const latticeAt = (x: number, y: number): Point | null => {
    const dr = Math.round(y * 2);
    const dc = Math.round(x * 2);
    if (dr < 1 || dc < 1 || dr > 2 * rows - 1 || dc > 2 * cols - 1) return null;
    if (dr % 2 === 1 && dc % 2 === 1) return null;
    return { dr, dc };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canon) return;
    const p = pointAt(e);
    if (!p) return;
    if (mode === "walls") {
      const edge = edgeAt(p[0], p[1]);
      if (!edge) return;
      const grids = { h: canon.grids.h.map((row) => [...row]), v: canon.grids.v.map((row) => [...row]) };
      grids[edge.kind][edge.r][edge.c] = grids[edge.kind][edge.r][edge.c] === 1 ? 0 : 1;
      update({ ...canon, grids });
      return;
    }
    const pt = latticeAt(p[0], p[1]);
    if (!pt) return;
    const i = canon.circles.findIndex((c) => c.dr === pt.dr && c.dc === pt.dc);
    const cur = i >= 0 ? canon.circles[i].color : null;
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    const circles: HalfFullPaintCircle[] = canon.circles.filter((_, j) => j !== i);
    if (next !== null) circles.push({ dr: pt.dr, dc: pt.dc, color: next });
    circles.sort((a, b) => a.dr - b.dr || a.dc - b.dc);
    update({ ...canon, circles });
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pointAt(e);
    setHoverEdge(p && mode === "walls" ? edgeAt(p[0], p[1]) : null);
    setHoverPoint(p && mode === "circles" ? latticeAt(p[0], p[1]) : null);
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid half-full paint JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 2 && newCols >= 2 && update(createEmptyHalfFullPaint(newRows, newCols))}>
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

  const problems = halfFullPaintFormatProblems(canon);
  const warnings = halfFullPaintWarnings(canon);
  const marked = new Map<string, string>();
  warnings.forEach((p) => marked.set(`${p.r},${p.c}`, "#e69500"));
  problems.forEach((p) => marked.set(`${p.r},${p.c}`, "#c33"));

  const modeButton = (m: Mode, label: string) => (
    <button
      onClick={() => {
        setMode(m);
        setHoverEdge(null);
        setHoverPoint(null);
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
    <button title={title} disabled={r < 2 || c < 2} onClick={() => update(resize(canon, r, c))}
      style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}>
      {label}
    </button>
  );

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {modeButton("walls", "Walls")}
          {modeButton("circles", "Circles")}
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
          {mode === "walls"
            ? "Click an edge between two cells to toggle its wall"
            : "Click an edge midpoint or corner to cycle its circle: none, white, gray, black"}
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
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          setHoverEdge(null);
          setHoverPoint(null);
        }}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <rect x={0} y={0} width={cols * CELL} height={rows * CELL} fill="white" />
          <HalfFullPaintGrid canon={canon} />
          {[...marked].map(([key, color]) => {
            const [r, c] = key.split(",").map(Number);
            return (
              <rect key={`p-${key}`} x={c * CELL + 3} y={r * CELL + 3} width={CELL - 6} height={CELL - 6}
                fill="none" stroke={color} strokeWidth={2} strokeDasharray="4 2" pointerEvents="none" />
            );
          })}
          {hoverEdge && (
            <line
              x1={hoverEdge.kind === "h" ? hoverEdge.c * CELL : (hoverEdge.c + 1) * CELL}
              y1={hoverEdge.kind === "h" ? (hoverEdge.r + 1) * CELL : hoverEdge.r * CELL}
              x2={(hoverEdge.c + 1) * CELL}
              y2={(hoverEdge.r + 1) * CELL}
              stroke="#4a90d9" strokeWidth={5} strokeOpacity={0.6} pointerEvents="none"
            />
          )}
          <HalfFullPaintCircles canon={canon} />
          {hoverPoint && (
            <circle cx={(hoverPoint.dc / 2) * CELL} cy={(hoverPoint.dr / 2) * CELL} r={CELL * 0.22}
              fill="none" stroke="#4a90d9" strokeWidth={3} strokeOpacity={0.7} pointerEvents="none" />
          )}
        </g>
      </svg>
    </div>
  );
}
