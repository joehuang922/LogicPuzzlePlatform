import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MazeOpening, PicturesqueMazeAnswer, PicturesqueMazeCanon } from "../types/canon";
import { ROOM_SHADE } from "./boardColors";
import {
  Cell,
  edgesFromPath,
  isPicturesqueMazeSolved,
  pathEndsInDeadEnd,
  pathFromEdges,
  stepToward,
} from "./picturesqueMazeRules";

interface PicturesqueMazeBoardProps {
  canon: PicturesqueMazeCanon;
  initialAnswer?: PicturesqueMazeAnswer | null;
  onAnswerChange?: (answer: PicturesqueMazeAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

export const MAZE_CELL = 24;
export const MAZE_PAD = 22;
export const WALL_COLOR = "#222";
const WALL_WIDTH = 3;
const PATH_LINE = "#fff";
const ERROR_COLOR = "#d33";
const THUMB_BG = "#d9d9d9";
const THUMB_MAX = 160;

/** One SVG path `d` for every wall, the outer border included except the openings. */
export function mazeWallPath(canon: PicturesqueMazeCanon, cell = MAZE_CELL): string {
  const { width, height, walls, entrance, exit } = canon;
  const parts: string[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) =>
    parts.push(`M${x1 * cell} ${y1 * cell}L${x2 * cell} ${y2 * cell}`);
  for (let r = 0; r < height - 1; r++) {
    for (let c = 0; c < width; c++) if (walls.h[r]?.[c]) seg(c, r + 1, c + 1, r + 1);
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width - 1; c++) if (walls.v[r]?.[c]) seg(c + 1, r, c + 1, r + 1);
  }
  const isOpening = (side: MazeOpening["side"], i: number) =>
    (entrance.side === side && entrance.index === i) || (exit.side === side && exit.index === i);
  for (let c = 0; c < width; c++) {
    if (!isOpening("top", c)) seg(c, 0, c + 1, 0);
    if (!isOpening("bottom", c)) seg(c, height, c + 1, height);
  }
  for (let r = 0; r < height; r++) {
    if (!isOpening("left", r)) seg(0, r, 0, r + 1);
    if (!isOpening("right", r)) seg(width, r, width, r + 1);
  }
  return parts.join("");
}

/** A ▼-style marker just outside an opening, pointing into (entrance) or out of (exit) the board. */
export function OpeningMarker({
  canon,
  opening,
  inward,
  color = WALL_COLOR,
  cell = MAZE_CELL,
}: {
  canon: PicturesqueMazeCanon;
  opening: MazeOpening;
  inward: boolean;
  color?: string;
  cell?: number;
}) {
  const { width, height } = canon;
  const s = cell * 0.32;
  let cx: number;
  let cy: number;
  // Direction pointing into the board.
  let dx = 0;
  let dy = 0;
  switch (opening.side) {
    case "top": cx = (opening.index + 0.5) * cell; cy = -cell * 0.45; dy = 1; break;
    case "bottom": cx = (opening.index + 0.5) * cell; cy = height * cell + cell * 0.45; dy = -1; break;
    case "left": cx = -cell * 0.45; cy = (opening.index + 0.5) * cell; dx = 1; break;
    case "right": cx = width * cell + cell * 0.45; cy = (opening.index + 0.5) * cell; dx = -1; break;
  }
  if (!inward) { dx = -dx; dy = -dy; }
  // Tip, then the two back corners.
  const tip = [cx + dx * s, cy + dy * s];
  const b1 = [cx - dx * s - dy * s, cy - dy * s - dx * s];
  const b2 = [cx - dx * s + dy * s, cy - dy * s + dx * s];
  return <polygon points={`${tip.join(",")} ${b1.join(",")} ${b2.join(",")}`} fill={color} pointerEvents="none" />;
}

/** Path cells as a picture: black on gray, the same cells Android's thumbnail shows. */
export function MazePreview({ width, height, cells }: { width: number; height: number; cells: Cell[] }) {
  const t = Math.max(3, Math.min(8, Math.floor(THUMB_MAX / width), Math.floor(THUMB_MAX / height)));
  return (
    <svg
      width={t * width}
      height={t * height}
      viewBox={`0 0 ${t * width} ${t * height}`}
      style={{ border: "1px solid #aaa", background: THUMB_BG, display: "block" }}
      shapeRendering="crispEdges"
    >
      <path d={cells.map(([r, c]) => `M${c * t} ${r * t}h${t}v${t}h${-t}z`).join("")} fill="#000" />
    </svg>
  );
}

export default function PicturesqueMazeBoard({
  canon,
  initialAnswer,
  onAnswerChange,
  onComplete,
  readonly,
  liveValidate,
}: PicturesqueMazeBoardProps) {
  const { width, height } = canon;
  const svgWidth = width * MAZE_CELL + MAZE_PAD * 2;
  const svgHeight = height * MAZE_CELL + MAZE_PAD * 2;

  const [path, setPath] = useState<Cell[]>(() => pathFromEdges(canon, initialAnswer?.edges));
  const completedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  // Drag state: the path index pressed, and whether the pointer has moved yet.
  const dragRef = useRef<{ index: number; moved: boolean } | null>(null);

  useEffect(() => {
    const edges = edgesFromPath(path, width, height);
    onAnswerChange?.({ edges });
    if (!completedRef.current && isPicturesqueMazeSolved(canon, edges)) {
      completedRef.current = true;
      onComplete?.();
    }
  }, [path, canon, width, height, onAnswerChange, onComplete]);

  const wallD = useMemo(() => mazeWallPath(canon), [canon]);
  const pathIndex = useMemo(() => {
    const m = new Map<number, number>();
    path.forEach(([r, c], i) => m.set(r * width + c, i));
    return m;
  }, [path, width]);
  const deadEnd = liveValidate && pathEndsInDeadEnd(canon, path);

  /** Pointer position in fractional cell units: [row, col]. */
  const pointAt = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const scale = svgWidth / rect.width;
      return [
        ((clientY - rect.top) * scale - MAZE_PAD) / MAZE_CELL,
        ((clientX - rect.left) * scale - MAZE_PAD) / MAZE_CELL,
      ];
    },
    [svgWidth],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readonly) return;
    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;
    const r = Math.floor(p[0]);
    const c = Math.floor(p[1]);
    const index = pathIndex.get(r * width + c);
    if (index === undefined) return;
    dragRef.current = { index, moved: false };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = pointAt(e.clientX, e.clientY);
    if (!p) return;
    const pr = Math.floor(p[0]);
    const pc = Math.floor(p[1]);
    let next = path;
    if (!drag.moved) {
      const [ar, ac] = path[drag.index];
      if (ar === pr && ac === pc) return;
      drag.moved = true;
      next = path.slice(0, drag.index + 1);
    }
    // Walk the end toward the pointer one open step at a time.
    for (let guard = 0; guard < 64; guard++) {
      const end = next[next.length - 1];
      if (end[0] === pr && end[1] === pc) break;
      const step = stepToward(canon, end, p[0], p[1]);
      if (!step) break;
      const before = next[next.length - 2];
      if (before && before[0] === step[0] && before[1] === step[1]) {
        next = next.slice(0, -1);
        continue;
      }
      if (next.some(([r, c]) => r === step[0] && c === step[1])) break;
      next = [...next, step];
    }
    if (next !== path) setPath(next);
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    // A tap on a path cell cuts the path after it (on the entrance: clears it).
    if (drag && !drag.moved) setPath((prev) => prev.slice(0, drag.index + 1));
  };

  const linePoints = path.map(([r, c]) => `${(c + 0.5) * MAZE_CELL},${(r + 0.5) * MAZE_CELL}`).join(" ");
  const end = path[path.length - 1];
  const drawn = path.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {!readonly && <MazePreview width={width} height={height} cells={drawn ? path : []} />}
      <div style={{ maxWidth: svgWidth, width: "100%" }}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ userSelect: "none", display: "block", touchAction: "none", background: "#fff" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <g transform={`translate(${MAZE_PAD},${MAZE_PAD})`}>
            {drawn && (
              <path
                d={path.map(([r, c]) => `M${c * MAZE_CELL} ${r * MAZE_CELL}h${MAZE_CELL}v${MAZE_CELL}h${-MAZE_CELL}z`).join("")}
                fill={ROOM_SHADE}
                pointerEvents="none"
              />
            )}
            {drawn && (
              <polyline
                points={linePoints}
                fill="none"
                stroke={PATH_LINE}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                pointerEvents="none"
              />
            )}
            {end && !readonly && (
              <circle
                cx={(end[1] + 0.5) * MAZE_CELL}
                cy={(end[0] + 0.5) * MAZE_CELL}
                r={MAZE_CELL * 0.18}
                fill={PATH_LINE}
                stroke={WALL_COLOR}
                strokeWidth={1}
                pointerEvents="none"
              />
            )}
            {deadEnd && end && (
              <rect
                x={end[1] * MAZE_CELL + 2}
                y={end[0] * MAZE_CELL + 2}
                width={MAZE_CELL - 4}
                height={MAZE_CELL - 4}
                fill="none"
                stroke={ERROR_COLOR}
                strokeWidth={2.5}
                pointerEvents="none"
              />
            )}
            <path d={wallD} stroke={WALL_COLOR} strokeWidth={WALL_WIDTH} strokeLinecap="square" fill="none" pointerEvents="none" />
            <OpeningMarker canon={canon} opening={canon.entrance} inward />
            <OpeningMarker canon={canon} opening={canon.exit} inward={false} />
          </g>
        </svg>
      </div>
    </div>
  );
}
