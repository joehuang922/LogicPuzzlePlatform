import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ZebraRopeCanon } from "../types/canon";
import {
  ZebraRopeClues,
  ZebraRopeGrid,
  ZEBRA_CELL_SIZE as CELL_SIZE,
  ZEBRA_PAD as PAD,
} from "./ZebraRopeBoard";
import { zebraRopeFormatProblems } from "./zebraRopeRules";

interface ZebraRopeEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

// A dragged pointer joins a cell once it comes this close to the cell's centre (in
// cells), so a diagonal drag across a corner picks the diagonal neighbour rather than
// grazing an orthogonal one.
const CAPTURE_RADIUS = 0.35;

function parseCanon(json: string): ZebraRopeCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed.width === "number" && typeof parsed.height === "number" && parsed.width >= 1 && parsed.height >= 1) {
      return {
        width: parsed.width,
        height: parsed.height,
        ropes: Array.isArray(parsed.ropes) ? parsed.ropes : [],
        circles: Array.isArray(parsed.circles) ? parsed.circles : [],
      };
    }
  } catch {}
  return null;
}

function makeEmptyCanon(width: number, height: number): ZebraRopeCanon {
  return { width, height, ropes: [], circles: [] };
}

// Drag through cells to draw a rope; click near a grid line to cycle a circle; right
// click a rope to delete it.
export default function ZebraRopeEditor({ initialJson, onChange }: ZebraRopeEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [draft, setDraft] = useState<[number, number][] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const width = canon?.width ?? 0;
  const height = canon?.height ?? 0;
  const svgWidth = width * CELL_SIZE + PAD * 2;
  const svgHeight = height * CELL_SIZE + PAD * 2;

  const updateJson = useCallback((next: ZebraRopeCanon) => {
    setJsonText(JSON.stringify(next));
  }, []);

  // Pointer position in cell units (x = column, y = row), board origin at 0.
  const pointAt = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    return {
      x: ((e.clientX - rect.left) * scale - PAD) / CELL_SIZE,
      y: ((e.clientY - rect.top) * scale - PAD) / CELL_SIZE,
    };
  };

  const cellOf = (p: { x: number; y: number }): [number, number] | null => {
    const r = Math.floor(p.y);
    const c = Math.floor(p.x);
    return r >= 0 && r < height && c >= 0 && c < width ? [r, c] : null;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canon || e.button !== 0) return;
    const p = pointAt(e);
    const cell = p && cellOf(p);
    if (!cell) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft([cell]);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draft) return;
    const p = pointAt(e);
    const cell = p && cellOf(p);
    if (!p || !cell) return;
    const [r, c] = cell;
    if (Math.hypot(p.x - (c + 0.5), p.y - (r + 0.5)) > CAPTURE_RADIUS) return;
    const [lr, lc] = draft[draft.length - 1];
    if (r === lr && c === lc) return;
    const prev = draft[draft.length - 2];
    if (prev && prev[0] === r && prev[1] === c) {
      setDraft(draft.slice(0, -1)); // dragging back undoes the last step
      return;
    }
    if (Math.max(Math.abs(r - lr), Math.abs(c - lc)) !== 1) return;
    if (draft.some(([dr, dc]) => dr === r && dc === c)) return;
    setDraft([...draft, [r, c]]);
  };

  // A click (no rope drawn) snaps to the nearest edge midpoint or corner and cycles
  // the circle there: none -> white (0) -> gray (2) -> black (1) -> none.
  const cycleCircle = (p: { x: number; y: number }) => {
    if (!canon) return;
    const fc = p.x * 2;
    const fr = p.y * 2;
    let dc = Math.round(fc);
    let dr = Math.round(fr);
    if (dr % 2 === 1 && dc % 2 === 1) {
      const nearEven = (f: number) => 2 * Math.round(f / 2);
      if (Math.abs(fc - nearEven(fc)) <= Math.abs(fr - nearEven(fr))) dc = nearEven(fc);
      else dr = nearEven(fr);
    }
    if (dr < 1 || dr > 2 * height - 1 || dc < 1 || dc > 2 * width - 1) return;
    const circles = canon.circles.map((d) => ({ ...d }));
    const i = circles.findIndex((d) => d.dr === dr && d.dc === dc);
    if (i === -1) circles.push({ dr, dc, color: 0 });
    else if (circles[i].color === 0) circles[i].color = 2;
    else if (circles[i].color === 2) circles[i].color = 1;
    else circles.splice(i, 1);
    updateJson({ ...canon, circles });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draft || !canon) return;
    if (draft.length >= 2) {
      updateJson({ ...canon, ropes: [...canon.ropes, draft] });
    } else {
      const p = pointAt(e);
      if (p) cycleCircle(p);
    }
    setDraft(null);
  };

  // Right click a cell on a rope: delete the last-drawn rope through it.
  const onContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!canon) return;
    const p = pointAt(e);
    const cell = p && cellOf(p);
    if (!cell) return;
    const [r, c] = cell;
    for (let i = canon.ropes.length - 1; i >= 0; i--) {
      if (canon.ropes[i].some(([rr, rc]) => rr === r && rc === c)) {
        updateJson({ ...canon, ropes: canon.ropes.filter((_, j) => j !== i) });
        return;
      }
    }
  };

  const handleResize = (newWidth: number, newHeight: number) => {
    if (!canon || newWidth < 1 || newHeight < 1) return;
    updateJson({
      width: newWidth,
      height: newHeight,
      ropes: canon.ropes.filter((rope) => rope.every(([r, c]) => r < newHeight && c < newWidth)),
      circles: canon.circles.filter((d) => d.dr <= 2 * newHeight - 1 && d.dc <= 2 * newWidth - 1),
    });
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid zebra rope JSON. Fix the textarea or create a new grid.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => updateJson(makeEmptyCanon(10, 10))}>Create 10x10 grid</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const problems = zebraRopeFormatProblems(canon);
  const inputStyle = { width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 };

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Width:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={width} min={1}
            onChange={(e) => handleResize(Number(e.target.value), height)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Height:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={height} min={1}
            onChange={(e) => handleResize(width, Number(e.target.value))} style={inputStyle} />
        </div>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Drag through cells to draw a rope · click a grid line to cycle white → gray → black circle · right-click a rope to delete it
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

      <svg
        ref={svgRef}
        width={Math.min(svgWidth, 600)}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: "1px solid #ccc", userSelect: "none", touchAction: "none", display: "block", background: "white", cursor: "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDraft(null)}
        onContextMenu={onContextMenu}
      >
        <g transform={`translate(${PAD},${PAD})`}>
          <ZebraRopeGrid rows={height} cols={width} />
          <ZebraRopeClues canon={canon} highlight={draft && draft.length >= 2 ? draft : null} />
        </g>
      </svg>
      <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#666" }}>
        <strong>Ropes:</strong> {canon.ropes.length} · <strong>Circles:</strong> {canon.circles.length}
      </div>
    </div>
  );
}
