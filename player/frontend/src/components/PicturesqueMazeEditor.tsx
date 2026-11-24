import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MazeOpening, PicturesqueMazeCanon } from "../types/canon";
import { MAZE_CELL, MAZE_PAD, OpeningMarker, WALL_COLOR, mazeWallPath } from "./PicturesqueMazeBoard";
import {
  Cell,
  openingCell,
  picturesqueMazeFormatProblems,
  picturesqueMazeWarnings,
  solveMaze,
  tiedRouteCells,
  warningMessages,
} from "./picturesqueMazeRules";

interface PicturesqueMazeEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL = MAZE_CELL;
const PAD = MAZE_PAD;
const SIDES = ["top", "bottom", "left", "right"];

type Target =
  | { kind: "h" | "v"; r: number; c: number }
  | { kind: "border"; opening: MazeOpening };

function isOpening(o: unknown): o is MazeOpening {
  const x = o as MazeOpening;
  return !!x && SIDES.includes(x.side) && Number.isInteger(x.index);
}

function parseCanon(json: string): PicturesqueMazeCanon | null {
  try {
    const p = JSON.parse(json);
    if (!Number.isInteger(p?.width) || !Number.isInteger(p?.height) || p.width < 2 || p.height < 2) return null;
    if (!Array.isArray(p.walls?.h) || !Array.isArray(p.walls?.v)) return null;
    if (!isOpening(p.entrance) || !isOpening(p.exit)) return null;
    return { width: p.width, height: p.height, walls: { h: p.walls.h, v: p.walls.v }, entrance: p.entrance, exit: p.exit };
  } catch {
    return null;
  }
}

/** An empty board: no interior walls, entrance top-left, exit bottom-right. */
export function createEmptyPicturesqueMaze(width: number, height: number): PicturesqueMazeCanon {
  return {
    width,
    height,
    walls: {
      h: Array.from({ length: height - 1 }, () => Array(width).fill(0)),
      v: Array.from({ length: height }, () => Array(width - 1).fill(0)),
    },
    entrance: { side: "top", index: 0 },
    exit: { side: "bottom", index: width - 1 },
  };
}

/** Resize at the bottom / right; new edges are walls, openings that fall off move to index 0. */
function resize(canon: PicturesqueMazeCanon, width: number, height: number): PicturesqueMazeCanon {
  const fit = (o: MazeOpening): MazeOpening =>
    openingCell(o, width, height) ? o : { side: o.side, index: 0 };
  return {
    width,
    height,
    walls: {
      h: Array.from({ length: height - 1 }, (_, r) => Array.from({ length: width }, (_, c) => canon.walls.h[r]?.[c] ?? 1)),
      v: Array.from({ length: height }, (_, r) => Array.from({ length: width - 1 }, (_, c) => canon.walls.v[r]?.[c] ?? 1)),
    },
    entrance: fit(canon.entrance),
    exit: fit(canon.exit),
  };
}

const cellRects = (cells: Cell[]) =>
  cells.map(([r, c]) => `M${c * CELL + 2} ${r * CELL + 2}h${CELL - 4}v${CELL - 4}h${4 - CELL}z`).join("");

export default function PicturesqueMazeEditor({ initialJson, onChange }: PicturesqueMazeEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const [newW, setNewW] = useState(20);
  const [newH, setNewH] = useState(20);
  const [hover, setHover] = useState<Target | null>(null);
  const [showRoute, setShowRoute] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  // Drag-painting walls: the value the first toggled edge took.
  const paintRef = useRef<number | null>(null);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const update = useCallback((next: PicturesqueMazeCanon) => setJsonText(JSON.stringify(next)), []);

  const width = canon?.width ?? 0;
  const height = canon?.height ?? 0;
  const svgWidth = width * CELL + PAD * 2;
  const svgHeight = height * CELL + PAD * 2;

  const pointAt = (e: React.PointerEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = svgWidth / rect.width;
    return [((e.clientX - rect.left) * scale - PAD) / CELL, ((e.clientY - rect.top) * scale - PAD) / CELL];
  };

  // The edge nearest the pointer (interior wall or border opening), if close enough.
  const targetAt = (x: number, y: number): Target | null => {
    const c = Math.floor(x);
    const r = Math.floor(y);
    const fx = x - c;
    const fy = y - r;
    const cands: [number, "top" | "bottom" | "left" | "right"][] = [
      [fy, "top"],
      [1 - fy, "bottom"],
      [fx, "left"],
      [1 - fx, "right"],
    ];
    cands.sort((a, b) => a[0] - b[0]);
    const [dist, dir] = cands[0];
    if (dist > 0.3) return null;
    if (dir === "top" || dir === "bottom") {
      if (c < 0 || c >= width) return null;
      const line = dir === "top" ? r : r + 1; // horizontal line index 0..height
      if (line === 0) return { kind: "border", opening: { side: "top", index: c } };
      if (line === height) return { kind: "border", opening: { side: "bottom", index: c } };
      if (line < 0 || line > height) return null;
      return { kind: "h", r: line - 1, c };
    }
    if (r < 0 || r >= height) return null;
    const line = dir === "left" ? c : c + 1;
    if (line === 0) return { kind: "border", opening: { side: "left", index: r } };
    if (line === width) return { kind: "border", opening: { side: "right", index: r } };
    if (line < 0 || line > width) return null;
    return { kind: "v", r, c: line - 1 };
  };

  const setWall = (t: Target, value: number) => {
    if (!canon || t.kind === "border") return;
    if (canon.walls[t.kind][t.r][t.c] === value) return;
    const walls = { h: canon.walls.h.map((row) => [...row]), v: canon.walls.v.map((row) => [...row]) };
    walls[t.kind][t.r][t.c] = value;
    update({ ...canon, walls });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canon) return;
    const p = pointAt(e);
    if (!p) return;
    const t = targetAt(p[0], p[1]);
    if (!t) return;
    if (t.kind === "border") {
      const asExit = e.shiftKey || e.button === 2;
      update({ ...canon, [asExit ? "exit" : "entrance"]: t.opening });
      return;
    }
    const value = canon.walls[t.kind][t.r][t.c] === 1 ? 0 : 1;
    paintRef.current = value;
    setWall(t, value);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pointAt(e);
    const t = p ? targetAt(p[0], p[1]) : null;
    setHover(t);
    if (paintRef.current !== null && t && t.kind !== "border") setWall(t, paintRef.current);
  };

  if (!canon) {
    return (
      <div style={{ padding: "1rem", border: "2px solid #c33", borderRadius: 8, background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>Invalid picturesque maze JSON. Fix the textarea or create a new board.</p>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ fontSize: "0.85rem" }}>Width:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newW} onChange={(e) => setNewW(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <label style={{ fontSize: "0.85rem" }}>Height:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} value={newH} onChange={(e) => setNewH(Number(e.target.value))} style={{ width: 50 }} min={2} />
          <button onClick={() => newW >= 2 && newH >= 2 && update(createEmptyPicturesqueMaze(newW, newH))}>Create Empty Board</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
        />
      </div>
    );
  }

  const problems = picturesqueMazeFormatProblems(canon);
  const warnings = picturesqueMazeWarnings(canon);
  const warningText = warningMessages(warnings);
  const tied = problems.length ? tiedRouteCells(canon) : [];
  const { route } = solveMaze(canon);

  const sizeButton = (label: string, title: string, w: number, h: number) => (
    <button
      title={title}
      disabled={w < 2 || h < 2}
      onClick={() => update(resize(canon, w, h))}
      style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
    >
      {label}
    </button>
  );

  let hoverD = "";
  if (hover) {
    if (hover.kind === "h") hoverD = `M${hover.c * CELL} ${(hover.r + 1) * CELL}h${CELL}`;
    else if (hover.kind === "v") hoverD = `M${(hover.c + 1) * CELL} ${hover.r * CELL}v${CELL}`;
    if (hover.kind === "border") {
      const { side, index } = hover.opening;
      if (side === "top") hoverD = `M${index * CELL} 0h${CELL}`;
      if (side === "bottom") hoverD = `M${index * CELL} ${height * CELL}h${CELL}`;
      if (side === "left") hoverD = `M0 ${index * CELL}v${CELL}`;
      if (side === "right") hoverD = `M${width * CELL} ${index * CELL}v${CELL}`;
    }
  }

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", fontSize: "0.8rem" }}>
          Rows {height}
          {sizeButton("+", "Add a row at the bottom", width, height + 1)}
          {sizeButton("−", "Remove the bottom row", width, height - 1)}
          Cols {width}
          {sizeButton("+", "Add a column at the right", width + 1, height)}
          {sizeButton("−", "Remove the right column", width - 1, height)}
        </div>
        <label style={{ fontSize: "0.8rem", display: "flex", gap: "0.3rem", alignItems: "center" }}>
          <input type="checkbox" checked={showRoute} onChange={(e) => setShowRoute(e.target.checked)} />
          Show route
        </label>
        <div style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click or drag along edges to toggle walls · click the border to move the entrance, shift-click / right-click to move the exit
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
      {warningText.length > 0 && (
        <div style={{ color: "#a66b00", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Check:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {warningText.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <div style={{ overflow: "auto", maxHeight: "75vh" }}>
        <svg
          ref={svgRef}
          width={svgWidth}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ border: "1px solid #ccc", userSelect: "none", touchAction: "none", display: "block", background: "white", cursor: "pointer" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (paintRef.current = null)}
          onPointerCancel={() => (paintRef.current = null)}
          onPointerLeave={() => setHover(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <g transform={`translate(${PAD},${PAD})`}>
            {showRoute && route && (
              <path
                d={route.map(([r, c]) => `M${c * CELL} ${r * CELL}h${CELL}v${CELL}h${-CELL}z`).join("")}
                fill="#cfe3f7"
                pointerEvents="none"
              />
            )}
            <path d={cellRects(warnings.loopCells)} fill="none" stroke="#e69500" strokeWidth={1.5} strokeDasharray="3 2" pointerEvents="none" />
            <path d={cellRects(warnings.unreachable)} fill="#fbe7c4" pointerEvents="none" />
            <path d={cellRects(tied)} fill="none" stroke="#c33" strokeWidth={2} pointerEvents="none" />
            {/* Faint lattice so empty edges can be aimed at */}
            <path
              d={[
                ...Array.from({ length: height - 1 }, (_, i) => `M0 ${(i + 1) * CELL}h${width * CELL}`),
                ...Array.from({ length: width - 1 }, (_, i) => `M${(i + 1) * CELL} 0v${height * CELL}`),
              ].join("")}
              stroke="#e6e6e6"
              strokeWidth={1}
              pointerEvents="none"
            />
            <path d={mazeWallPath(canon)} stroke={WALL_COLOR} strokeWidth={3} strokeLinecap="square" fill="none" pointerEvents="none" />
            {hoverD && <path d={hoverD} stroke="#4a90d9" strokeWidth={5} strokeOpacity={0.6} pointerEvents="none" />}
            <OpeningMarker canon={canon} opening={canon.entrance} inward color="#2a7a2a" />
            <OpeningMarker canon={canon} opening={canon.exit} inward={false} color="#c33" />
          </g>
        </svg>
      </div>
    </div>
  );
}
