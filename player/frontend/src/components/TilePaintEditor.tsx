import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { TilePaintCanon, TilePaintClue } from "../types/canon";
import { TilePaintGrid, TILE_PAINT_CELL, TILE_PAINT_PAD } from "./TilePaintBoard";
import { normalizeClueWalls, tilePaintFormatProblems, tilePaintWarnings, isTileCell } from "./tilePaintRules";

interface TilePaintEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL = TILE_PAINT_CELL;
const PAD = TILE_PAINT_PAD;

type Mode = "walls" | "clues";
type Edge = { kind: "h" | "v"; r: number; c: number };

function parseCanon(json: string): TilePaintCanon | null {
  try {
    const parsed = JSON.parse(json);
    const cells = parsed?.cells;
    if (!Array.isArray(cells) || cells.length === 0 || !Array.isArray(cells[0]) || cells[0].length === 0) return null;
    const ok = cells.every(
      (row: unknown) =>
        Array.isArray(row) &&
        row.every((cell) => cell === null || (typeof cell === "object" && "right" in cell && "down" in cell))
    );
    if (!ok || !Array.isArray(parsed.grids?.h) || !Array.isArray(parsed.grids?.v)) return null;
    return { cells, grids: { h: parsed.grids.h, v: parsed.grids.v } };
  } catch {
    return null;
  }
}

/** An empty board: a clue row on top, a clue column on the left, every tile a single cell. */
export function createEmptyTilePaint(rows: number, cols: number): TilePaintCanon {
  const cells: (TilePaintClue | null)[][] = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (r === 0 || c === 0 ? { right: null, down: null } : null))
  );
  return normalizeClueWalls({
    cells,
    grids: {
      h: Array.from({ length: rows - 1 }, () => Array(cols).fill(1)),
      v: Array.from({ length: rows }, () => Array(cols - 1).fill(1)),
    },
  });
}

/** Resize at the bottom / right; new cells are single-cell tiles. */
function resize(canon: TilePaintCanon, rows: number, cols: number): TilePaintCanon {
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => canon.cells[r]?.[c] ?? (r === 0 || c === 0 ? { right: null, down: null } : null))
  );
  const h = Array.from({ length: rows - 1 }, (_, r) => Array.from({ length: cols }, (_, c) => canon.grids.h[r]?.[c] ?? 1));
  const v = Array.from({ length: rows }, (_, r) => Array.from({ length: cols - 1 }, (_, c) => canon.grids.v[r]?.[c] ?? 1));
  // A clue whose run was cut off by the new edge keeps its number; the problems list says so.
  return normalizeClueWalls({ cells, grids: { h, v } });
}

export default function TilePaintEditor({ initialJson, onChange }: TilePaintEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newRows, setNewRows] = useState(11);
  const [newCols, setNewCols] = useState(11);
  const [mode, setMode] = useState<Mode>("walls");
  const [hover, setHover] = useState<Edge | null>(null);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const rightRef = useRef<HTMLInputElement>(null);
  const downRef = useRef<HTMLInputElement>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const rows = canon ? canon.cells.length : 0;
  const cols = canon ? canon.cells[0].length : 0;
  const svgWidth = cols * CELL + PAD * 2;
  const svgHeight = rows * CELL + PAD * 2;

  const update = useCallback((next: TilePaintCanon) => setJsonText(JSON.stringify(next)), []);

  const pointAt = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    return [((e.clientX - rect.left) * scale - PAD) / CELL, ((e.clientY - rect.top) * scale - PAD) / CELL];
  };

  // The interior edge nearest the pointer between two tile cells, if close enough.
  const edgeAt = (x: number, y: number): Edge | null => {
    if (!canon) return null;
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
    const [dist, edge] = cands[0];
    if (dist > 0.3) return null;
    const [r2, c2] = edge.kind === "h" ? [edge.r + 1, edge.c] : [edge.r, edge.c + 1];
    if (!isTileCell(canon, edge.r, edge.c) || !isTileCell(canon, r2, c2)) return null;
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
    // The upper-right triangle edits the right number, the lower-left the down number.
    const upperRight = x - c > y - r;
    if (isTileCell(canon, r, c)) {
      const cells = canon.cells.map((row) => [...row]);
      cells[r][c] = { right: null, down: null };
      update(normalizeClueWalls({ cells, grids: canon.grids }));
    }
    setSelected([r, c]);
    setTimeout(() => (upperRight ? rightRef : downRef).current?.focus(), 0);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode !== "walls") return;
    const p = pointAt(e);
    setHover(p ? edgeAt(p[0], p[1]) : null);
  };

  const selectedClue = canon && selected ? canon.cells[selected[0]]?.[selected[1]] ?? null : null;

  const setClue = (dir: "right" | "down", text: string) => {
    if (!canon || !selected || !selectedClue) return;
    const [r, c] = selected;
    const n = text.trim() === "" ? null : Number(text);
    if (n !== null && (!Number.isInteger(n) || n < 0)) return;
    const cells = canon.cells.map((row) => [...row]);
    cells[r][c] = { ...selectedClue, [dir]: n };
    update({ ...canon, cells });
  };

  const makeTile = () => {
    if (!canon || !selected) return;
    const [r, c] = selected;
    const cells = canon.cells.map((row) => [...row]);
    cells[r][c] = null;
    const grids = { h: canon.grids.h.map((row) => [...row]), v: canon.grids.v.map((row) => [...row]) };
    if (r > 0) grids.h[r - 1][c] = 1;
    if (r < rows - 1) grids.h[r][c] = 1;
    if (c > 0) grids.v[r][c - 1] = 1;
    if (c < cols - 1) grids.v[r][c] = 1;
    update(normalizeClueWalls({ cells, grids }));
    setSelected(null);
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid tile paint JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Rows:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newRows} onChange={(e) => setNewRows(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Cols:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newCols} onChange={(e) => setNewCols(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newRows >= 2 && newCols >= 2 && update(createEmptyTilePaint(newRows, newCols))}>
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

  const problems = tilePaintFormatProblems(canon);
  const warnings = tilePaintWarnings(canon);
  const marked = new Map<string, string>();
  warnings.forEach((p) => marked.set(`${p.r},${p.c}`, "#e69500"));
  problems.forEach((p) => marked.set(`${p.r},${p.c}`, "#c33"));

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

  const field = (dir: "right" | "down", ref: React.RefObject<HTMLInputElement>) => (
    <label style={{ fontSize: "0.85rem", display: "flex", gap: "0.3rem", alignItems: "center" }}>
      {dir === "right" ? "Right" : "Down"}:
      <input
        ref={ref}
        type="number"
        min={0}
        value={selectedClue?.[dir] ?? ""}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setClue(dir, e.target.value)}
        style={{ width: 55, padding: "0.2rem" }}
      />
    </label>
  );

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {modeButton("walls", "Walls")}
          {modeButton("clues", "Clue cells")}
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
            ? "Click an edge between two tile cells to toggle its wall"
            : "Click a cell to make it a clue cell; click its upper-right / lower-left half to edit that number"}
        </div>
      </div>

      {mode === "clues" && selected && selectedClue && (
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.75rem" }}>
          <span style={{ fontSize: "0.85rem" }}>
            Clue cell R{selected[0] + 1}C{selected[1] + 1}
          </span>
          {field("right", rightRef)}
          {field("down", downRef)}
          <button onClick={makeTile} style={{ fontSize: "0.8rem" }}>
            Make tile cell
          </button>
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
          <TilePaintGrid
            canon={canon}
            highlight={mode === "clues" && selected ? new Set([`${selected[0]},${selected[1]}`]) : undefined}
          />
          {[...marked].map(([key, color]) => {
            const [r, c] = key.split(",").map(Number);
            return (
              <rect
                key={`p-${key}`}
                x={c * CELL + 3}
                y={r * CELL + 3}
                width={CELL - 6}
                height={CELL - 6}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray="4 2"
                pointerEvents="none"
              />
            );
          })}
          {hover && (
            <line
              x1={hover.kind === "h" ? hover.c * CELL : (hover.c + 1) * CELL}
              y1={hover.kind === "h" ? (hover.r + 1) * CELL : hover.r * CELL}
              x2={hover.kind === "h" ? (hover.c + 1) * CELL : (hover.c + 1) * CELL}
              y2={hover.kind === "h" ? (hover.r + 1) * CELL : (hover.r + 1) * CELL}
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
