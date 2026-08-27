import { useState, useMemo, useCallback, useEffect} from "react";
import { HeyawakeCanon, HeyawakeRoom } from "../types/canon";

interface HeyawakeEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CELL_SIZE = 36;
const PAD = 12;
const EDGE_HIT = 10;

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
function makeEmptyCanon(width: number, height: number): HeyawakeCanon {
  return { width, height, rooms: [{ r: 0, c: 0, w: width, h: height, clue: null }] };
}

function computeRoomIds(canon: HeyawakeCanon): number[][] {
  const ids = Array.from({ length: canon.height }, () =>
    Array(canon.width).fill(-1)
  );
  canon.rooms.forEach((room, id) => {
    for (let r = room.r; r < room.r + room.h; r++) {
      for (let c = room.c; c < room.c + room.w; c++) {
        if (r >= 0 && r < canon.height && c >= 0 && c < canon.width) ids[r][c] = id;
      }
    }
  });
  return ids;
}

// Flood-fill cells into components across edges without a wall, then fit each
// component to its bounding-box rectangle. Returns null if any component is
// not a perfect rectangle (partition rejected).
function partitionToRooms(
  rows: number,
  cols: number,
  hWall: boolean[][],
  vWall: boolean[][],
  clueAtCell: Map<string, number>
): HeyawakeRoom[] | null {
  const comp = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let next = 0;
  const rooms: HeyawakeRoom[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (comp[r][c] >= 0) continue;
      const id = next++;
      const cells: [number, number][] = [[r, c]];
      comp[r][c] = id;
      let minR = r, maxR = r, minC = c, maxC = c;
      let count = 0;
      const stack: [number, number][] = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        count++;
        minR = Math.min(minR, cr); maxR = Math.max(maxR, cr);
        minC = Math.min(minC, cc); maxC = Math.max(maxC, cc);
        // up
        if (cr > 0 && comp[cr - 1][cc] < 0 && !hWall[cr - 1][cc]) {
          comp[cr - 1][cc] = id; stack.push([cr - 1, cc]); cells.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && comp[cr + 1][cc] < 0 && !hWall[cr][cc]) {
          comp[cr + 1][cc] = id; stack.push([cr + 1, cc]); cells.push([cr + 1, cc]);
        }
        if (cc > 0 && comp[cr][cc - 1] < 0 && !vWall[cr][cc - 1]) {
          comp[cr][cc - 1] = id; stack.push([cr, cc - 1]); cells.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && comp[cr][cc + 1] < 0 && !vWall[cr][cc]) {
          comp[cr][cc + 1] = id; stack.push([cr, cc + 1]); cells.push([cr, cc + 1]);
        }
      }
      const w = maxC - minC + 1;
      const h = maxR - minR + 1;
      // Reject non-rectangular components.
      if (count !== w * h) return null;
      const clue = clueAtCell.get(`${minR},${minC}`);
      rooms.push({ r: minR, c: minC, w, h, clue: clue ?? null });
    }
  }
  return rooms;
}

export default function HeyawakeEditor({
  initialJson,
  onChange,
}: HeyawakeEditorProps) {
  const [jsonText, setJsonText] = useState(initialJson);
  const canon = useMemo(() => parseCanon(jsonText), [jsonText]);

  useEffect(() => {
    onChange(jsonText);
  }, [jsonText, onChange]);

  const width = canon ? canon.width : 0;
  const height = canon ? canon.height : 0;
  const roomIds = useMemo(() => (canon ? computeRoomIds(canon) : []), [canon]);

  const updateJson = useCallback((c: HeyawakeCanon) => {
    setJsonText(JSON.stringify(c, null, 2));
  }, []);

  // Clue map keyed by "r,c" of each room's top-left cell.
  const clueByTopLeft = useMemo(() => {
    const m = new Map<string, number>();
    if (canon) {
      for (const room of canon.rooms) {
        if (room.clue !== null && room.clue !== undefined) {
          m.set(`${room.r},${room.c}`, room.clue);
        }
      }
    }
    return m;
  }, [canon]);

  // Cycle the clue of the room containing (r,c): none -> 0 -> 1 -> ... -> area -> none.
  const cycleClue = useCallback(
    (r: number, c: number) => {
      if (!canon) return;
      const rid = roomIds[r][c];
      if (rid < 0) return;
      const rooms = canon.rooms.map((room) => ({ ...room }));
      const room = rooms[rid];
      const area = room.w * room.h;
      const cur = room.clue ?? null;
      let nextClue: number | null;
      if (cur === null) nextClue = 0;
      else if (cur >= area) nextClue = null;
      else nextClue = cur + 1;
      room.clue = nextClue;
      updateJson({ width, height, rooms });
    },
    [canon, roomIds, width, height, updateJson]
  );

  // Toggle a wall and re-partition into rectangles; ignore if result is
  // non-rectangular.
  const toggleWall = useCallback(
    (kind: "h" | "v", r: number, c: number) => {
      if (!canon) return;
      const hWall = Array.from({ length: height - 1 }, (_, rr) =>
        Array.from({ length: width }, (_, cc) => roomIds[rr][cc] !== roomIds[rr + 1][cc])
      );
      const vWall = Array.from({ length: height }, (_, rr) =>
        Array.from({ length: width - 1 }, (_, cc) => roomIds[rr][cc] !== roomIds[rr][cc + 1])
      );
      if (kind === "h") hWall[r][c] = !hWall[r][c];
      else vWall[r][c] = !vWall[r][c];
      const rooms = partitionToRooms(height, width, hWall, vWall, clueByTopLeft);
      if (!rooms) return; // non-rectangular partition rejected
      updateJson({ width, height, rooms });
    },
    [canon, roomIds, width, height, clueByTopLeft, updateJson]
  );

  function handleResize(newWidth: number, newHeight: number) {
    if (newWidth < 1 || newHeight < 1) return;
    updateJson(makeEmptyCanon(newWidth, newHeight));
  }

  if (!canon) {
    return (
      <div style={{ border: "2px solid #c33", borderRadius: 8, padding: "1rem", background: "#fff8f8" }}>
        <p style={{ color: "#c33", margin: "0 0 1rem" }}>
          Invalid heyawake JSON. Fix the textarea below or create a new grid.
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

  const svgWidth = width * CELL_SIZE + PAD * 2;
  const svgHeight = height * CELL_SIZE + PAD * 2;

  const elements: JSX.Element[] = [];

  // Cell backgrounds.
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      elements.push(
        <rect key={`bg-${r}-${c}`} x={c * CELL_SIZE} y={r * CELL_SIZE} width={CELL_SIZE} height={CELL_SIZE} fill="#eee" />
      );
    }
  }

  // Grid lines: thick at room borders / perimeter, thin otherwise.
  for (let r = 0; r <= height; r++) {
    for (let c = 0; c < width; c++) {
      const isBorder = r === 0 || r === height;
      const isThick = isBorder || roomIds[r - 1][c] !== roomIds[r][c];
      elements.push(
        <line key={`hl-${r}-${c}`} x1={c * CELL_SIZE} y1={r * CELL_SIZE} x2={(c + 1) * CELL_SIZE} y2={r * CELL_SIZE}
          stroke={isThick ? "#333" : "#999"} strokeWidth={isThick ? 3 : 0.75} />
      );
    }
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c <= width; c++) {
      const isBorder = c === 0 || c === width;
      const isThick = isBorder || roomIds[r][c - 1] !== roomIds[r][c];
      elements.push(
        <line key={`vl-${r}-${c}`} x1={c * CELL_SIZE} y1={r * CELL_SIZE} x2={c * CELL_SIZE} y2={(r + 1) * CELL_SIZE}
          stroke={isThick ? "#333" : "#999"} strokeWidth={isThick ? 3 : 0.75} />
      );
    }
  }

  // Clue numbers in each room's top-left cell.
  for (const room of canon.rooms) {
    if (room.clue === null || room.clue === undefined) continue;
    elements.push(
      <text key={`clue-${room.r}-${room.c}`}
        x={room.c * CELL_SIZE + CELL_SIZE / 2} y={room.r * CELL_SIZE + CELL_SIZE / 2}
        textAnchor="middle" dominantBaseline="central" fontSize={CELL_SIZE * 0.5}
        fontFamily="sans-serif" fontWeight="bold" fill="black" pointerEvents="none">
        {room.clue}
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
          <input type="number" min={1} max={100} value={width}
            onChange={(e) => handleResize(Number(e.target.value) || 1, height)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Height:</label>
          <input type="number" min={1} max={100} value={height}
            onChange={(e) => handleResize(width, Number(e.target.value) || 1)}
            style={{ width: 50, padding: "0.25rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <span style={{ fontSize: "0.75rem", color: "#666", marginLeft: "auto" }}>
          Click a cell to cycle its room clue; click an edge to toggle a wall (resizing resets rooms).
        </span>
      </div>

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
