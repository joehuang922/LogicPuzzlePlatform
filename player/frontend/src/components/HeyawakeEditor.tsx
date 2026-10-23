import { useState, useMemo, useCallback, useEffect} from "react";
import { HeyawakeCanon, HeyawakeRoom } from "../types/canon";

interface HeyawakeEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const EDGE_HIT = 10;

// The editor works on walls, not rooms, so a layout can pass through shapes the canon
// can't hold (an L-shaped room, a half-drawn split, two clues after a merge). Rooms are
// whatever the walls enclose; such format problems are listed and tinted, and the
// server refuses to store a canon whose rooms don't tile the grid.
interface Layout {
  width: number;
  height: number;
  // hWall[r][c]: wall under (r,c); (height-1) x width.
  hWall: boolean[][];
  // vWall[r][c]: wall right of (r,c); height x (width-1).
  vWall: boolean[][];
  // Clue per cell, keyed "r,c".
  clues: Record<string, number>;
}

interface Region {
  cells: [number, number][]; // reading order
  r: number;
  c: number;
  w: number;
  h: number;
  clueCells: string[];
}

function parseCanon(json: string): HeyawakeCanon | null {
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed.width === "number" &&
      typeof parsed.height === "number" &&
      Array.isArray(parsed.rooms)
    ) {
      return parsed as HeyawakeCanon;
    }
  } catch {}
  return null;
}

// One room covering the whole grid.
function makeEmptyLayout(width: number, height: number): Layout {
  return {
    width,
    height,
    hWall: Array.from({ length: height - 1 }, () => Array(width).fill(false)),
    vWall: Array.from({ length: height }, () => Array(width - 1).fill(false)),
    clues: {},
  };
}

// Walls wherever two cells fall in different rooms (a later room wins an overlap; cells
// no room covers group together), each clue on its room's top-left cell.
function layoutFromCanon(canon: HeyawakeCanon): Layout {
  const { width, height } = canon;
  const ids = Array.from({ length: height }, () => Array(width).fill(-1));
  canon.rooms.forEach((room, id) => {
    for (let r = room.r; r < room.r + room.h; r++) {
      for (let c = room.c; c < room.c + room.w; c++) {
        if (r >= 0 && r < height && c >= 0 && c < width) ids[r][c] = id;
      }
    }
  });
  const clues: Record<string, number> = {};
  for (const room of canon.rooms) {
    if (room.clue === null || room.clue === undefined) continue;
    if (room.r >= 0 && room.r < height && room.c >= 0 && room.c < width) clues[`${room.r},${room.c}`] = room.clue;
  }
  return {
    width,
    height,
    hWall: Array.from({ length: height - 1 }, (_, r) => Array.from({ length: width }, (_, c) => ids[r][c] !== ids[r + 1][c])),
    vWall: Array.from({ length: height }, (_, r) => Array.from({ length: width - 1 }, (_, c) => ids[r][c] !== ids[r][c + 1])),
    clues,
  };
}

// Flood-fill cells into regions across edges without a wall, numbered in reading order.
function analyze(layout: Layout) {
  const { width, height, hWall, vWall, clues } = layout;
  const ids = Array.from({ length: height }, () => Array<number>(width).fill(-1));
  const regions: Region[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (ids[r][c] >= 0) continue;
      const id = regions.length;
      ids[r][c] = id;
      const cells: [number, number][] = [];
      const stack: [number, number][] = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        cells.push([cr, cc]);
        const visit = (nr: number, nc: number, open: boolean) => {
          if (open && ids[nr][nc] < 0) { ids[nr][nc] = id; stack.push([nr, nc]); }
        };
        if (cr > 0) visit(cr - 1, cc, !hWall[cr - 1][cc]);
        if (cr < height - 1) visit(cr + 1, cc, !hWall[cr][cc]);
        if (cc > 0) visit(cr, cc - 1, !vWall[cr][cc - 1]);
        if (cc < width - 1) visit(cr, cc + 1, !vWall[cr][cc]);
      }
      cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const rs = cells.map((x) => x[0]);
      const cs = cells.map((x) => x[1]);
      const minR = Math.min(...rs), minC = Math.min(...cs);
      regions.push({
        cells,
        r: minR,
        c: minC,
        w: Math.max(...cs) - minC + 1,
        h: Math.max(...rs) - minR + 1,
        clueCells: cells.map(([cr, cc]) => `${cr},${cc}`).filter((k) => k in clues),
      });
    }
  }

  // A wall with the same region on both sides closes nothing off.
  const dangling = new Set<number>();
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (r < height - 1 && hWall[r][c] && ids[r][c] === ids[r + 1][c]) dangling.add(ids[r][c]);
      if (c < width - 1 && vWall[r][c] && ids[r][c] === ids[r][c + 1]) dangling.add(ids[r][c]);
    }
  }

  const problems: string[] = [];
  const bad = new Set<number>();
  regions.forEach((room, id) => {
    const at = `R${room.cells[0][0] + 1}C${room.cells[0][1] + 1}`;
    if (room.cells.length !== room.w * room.h) { problems.push(`Room at ${at} isn't a rectangle`); bad.add(id); }
    if (room.clueCells.length > 1) { problems.push(`Room at ${at} has ${room.clueCells.length} clues`); bad.add(id); }
    if (dangling.has(id)) { problems.push(`Room at ${at} has a wall that doesn't close off a room`); bad.add(id); }
  });
  return { ids, regions, bad, problems };
}

// Each room as its region's bounding box. Only right when there are no problems: an
// L-shaped region comes out as overlapping rooms, which the server rejects.
function canonFromLayout(layout: Layout, regions: Region[]): HeyawakeCanon {
  const rooms: HeyawakeRoom[] = regions.map((room) => ({
    r: room.r,
    c: room.c,
    w: room.w,
    h: room.h,
    clue: room.clueCells.length ? layout.clues[room.clueCells[0]] : null,
  }));
  return { width: layout.width, height: layout.height, rooms };
}

export default function HeyawakeEditor({
  initialJson,
  onChange,
}: HeyawakeEditorProps) {
  // The raw text only matters while it doesn't parse (the fallback textarea).
  const [jsonText, setJsonText] = useState(initialJson);
  const [layout, setLayout] = useState<Layout | null>(() => {
    const canon = parseCanon(initialJson);
    return canon ? layoutFromCanon(canon) : null;
  });
  const analysis = useMemo(() => (layout ? analyze(layout) : null), [layout]);

  useEffect(() => {
    if (layout && analysis) onChange(JSON.stringify(canonFromLayout(layout, analysis.regions), null, 2));
    else onChange(jsonText);
  }, [layout, analysis, jsonText, onChange]);

  // Cycle the clue of the room containing (r,c): none -> 0 -> 1 -> ... -> area -> none.
  // The room keeps one clue, on the cell that held one, else its first cell.
  const cycleClue = useCallback(
    (r: number, c: number) => {
      if (!layout || !analysis) return;
      const room = analysis.regions[analysis.ids[r][c]];
      const cur = room.clueCells.length ? layout.clues[room.clueCells[0]] : null;
      const area = room.cells.length;
      const next = cur === null ? 0 : cur >= area ? null : cur + 1;
      const clues = { ...layout.clues };
      for (const k of room.clueCells) delete clues[k];
      if (next !== null) clues[room.clueCells[0] ?? `${room.cells[0][0]},${room.cells[0][1]}`] = next;
      setLayout({ ...layout, clues });
    },
    [layout, analysis]
  );

  // Flip one wall segment; any interim shape is allowed.
  const toggleWall = useCallback(
    (kind: "h" | "v", r: number, c: number) => {
      if (!layout) return;
      const flip = (grid: boolean[][]) => grid.map((row, rr) => (rr === r ? row.map((v, cc) => (cc === c ? !v : v)) : row));
      setLayout(kind === "h" ? { ...layout, hWall: flip(layout.hWall) } : { ...layout, vWall: flip(layout.vWall) });
    },
    [layout]
  );

  function handleResize(newWidth: number, newHeight: number) {
    if (newWidth < 1 || newHeight < 1) return;
    setLayout(makeEmptyLayout(newWidth, newHeight));
  }

  if (!layout || !analysis) {
    return (
      <div style={{ border: "2px solid #c33", borderRadius: 8, padding: "1rem", background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid heyawake JSON. Fix the textarea below or create a new grid.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={() => setLayout(makeEmptyLayout(10, 10))}>Create 10x10 grid</button>
        </div>
        <textarea
          style={{ width: "100%", minHeight: 200, fontFamily: "monospace", fontSize: "0.8rem", padding: "0.5rem" }}
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            const canon = parseCanon(e.target.value);
            if (canon) setLayout(layoutFromCanon(canon));
          }}
        />
      </div>
    );
  }

  const { width, height, hWall, vWall, clues } = layout;
  const { ids, bad, problems } = analysis;
  const svgWidth = width * CELL_SIZE + PAD * 2;
  const svgHeight = height * CELL_SIZE + PAD * 2;

  const elements: JSX.Element[] = [];

  // Cell backgrounds; rooms with a format problem tinted red.
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      elements.push(
        <rect key={`bg-${r}-${c}`} x={c * CELL_SIZE} y={r * CELL_SIZE} width={CELL_SIZE} height={CELL_SIZE}
          fill={bad.has(ids[r][c]) ? "#fdd" : "#eee"} />
      );
    }
  }

  // Grid lines: thick at walls / perimeter, thin otherwise; a wall inside one room is red.
  const stroke = (wall: boolean, dangling: boolean) => (dangling ? "#d33" : wall ? "#333" : "#999");
  for (let r = 0; r <= height; r++) {
    for (let c = 0; c < width; c++) {
      const isBorder = r === 0 || r === height;
      const wall = isBorder || hWall[r - 1][c];
      const dangling = !isBorder && wall && ids[r - 1][c] === ids[r][c];
      elements.push(
        <line key={`hl-${r}-${c}`} x1={c * CELL_SIZE} y1={r * CELL_SIZE} x2={(c + 1) * CELL_SIZE} y2={r * CELL_SIZE}
          stroke={stroke(wall, dangling)} strokeWidth={wall ? 3 : 0.75} />
      );
    }
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c <= width; c++) {
      const isBorder = c === 0 || c === width;
      const wall = isBorder || vWall[r][c - 1];
      const dangling = !isBorder && wall && ids[r][c - 1] === ids[r][c];
      elements.push(
        <line key={`vl-${r}-${c}`} x1={c * CELL_SIZE} y1={r * CELL_SIZE} x2={c * CELL_SIZE} y2={(r + 1) * CELL_SIZE}
          stroke={stroke(wall, dangling)} strokeWidth={wall ? 3 : 0.75} />
      );
    }
  }

  // Clue numbers on the cells they're pinned to.
  for (const [key, clue] of Object.entries(clues)) {
    const [r, c] = key.split(",").map(Number);
    if (r >= height || c >= width) continue;
    elements.push(
      <text key={`clue-${key}`}
        x={c * CELL_SIZE + CELL_SIZE / 2} y={r * CELL_SIZE + CELL_SIZE / 2}
        textAnchor="middle" dominantBaseline="central" fontSize={CELL_SIZE * 0.5}
        fontFamily="sans-serif" fontWeight="bold" fill="black" pointerEvents="none">
        {clue}
      </text>
    );
  }

  // Cell-center click targets (clue cycle).
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      elements.push(
        <rect key={`cc-${r}-${c}`}
          x={c * CELL_SIZE + EDGE_HIT / 2} y={r * CELL_SIZE + EDGE_HIT / 2}
          width={CELL_SIZE - EDGE_HIT} height={CELL_SIZE - EDGE_HIT}
          fill="transparent" style={{ cursor: "pointer" }} onClick={() => cycleClue(r, c)} />
      );
    }
  }
  // Interior edge click targets (wall toggle).
  for (let r = 0; r < height - 1; r++) {
    for (let c = 0; c < width; c++) {
      elements.push(
        <rect key={`he-${r}-${c}`}
          x={c * CELL_SIZE} y={(r + 1) * CELL_SIZE - EDGE_HIT / 2}
          width={CELL_SIZE} height={EDGE_HIT}
          fill="transparent" style={{ cursor: "pointer" }} onClick={() => toggleWall("h", r, c)} />
      );
    }
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width - 1; c++) {
      elements.push(
        <rect key={`ve-${r}-${c}`}
          x={(c + 1) * CELL_SIZE - EDGE_HIT / 2} y={r * CELL_SIZE}
          width={EDGE_HIT} height={CELL_SIZE}
          fill="transparent" style={{ cursor: "pointer" }} onClick={() => toggleWall("v", r, c)} />
      );
    }
  }

  return (
    <div style={{ border: "2px solid #4a90d9", borderRadius: 8, padding: "1rem", background: "#f8fbff" }}>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Width:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} min={1} max={100} value={width}
            onChange={(e) => handleResize(Number(e.target.value) || 1, height)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Height:</label>
          <input type="number" onFocus={(e) => e.currentTarget.select()} min={1} max={100} value={height}
            onChange={(e) => handleResize(width, Number(e.target.value) || 1)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <span style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click a cell to cycle its room clue; click an edge to toggle a wall (resizing resets rooms).
        </span>
      </div>

      {problems.length > 0 && (
        <div style={{ color: "#c33", fontSize: "0.8rem", marginBottom: "0.75rem" }}>
          <strong>Fix before saving — rooms must be rectangles with at most one clue:</strong>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0 }}>
          <svg width={Math.min(svgWidth, 600)} viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ border: "1px solid #ccc", userSelect: "none", display: "block", background: "white" }}>
            <g transform={`translate(${PAD},${PAD})`}>{elements}</g>
          </svg>
        </div>

      </div>

    </div>
  );
}
