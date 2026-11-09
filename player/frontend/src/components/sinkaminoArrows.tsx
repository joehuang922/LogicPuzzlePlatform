// Arrow trails for the sinkamino board and editor: a polyline through cell centres with
// a filled triangular head on the last cell.

const ARROW_COLOR = "#222";

export function ArrowTrail({
  trail,
  cellSize,
  color = ARROW_COLOR,
}: {
  trail: number[][];
  cellSize: number;
  color?: string;
}) {
  if (trail.length < 2) return null;
  const pt = ([r, c]: number[]) => [c * cellSize + cellSize / 2, r * cellSize + cellSize / 2];
  const pts = trail.map(pt);
  const [hx, hy] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  const len = Math.hypot(hx - px, hy - py) || 1;
  const ux = (hx - px) / len;
  const uy = (hy - py) / len;
  // Head: tip just past the head cell's centre, base back toward the previous cell.
  const tipX = hx + ux * cellSize * 0.2;
  const tipY = hy + uy * cellSize * 0.2;
  const baseX = tipX - ux * cellSize * 0.4;
  const baseY = tipY - uy * cellSize * 0.4;
  const w = cellSize * 0.17;
  const line = [...pts.slice(0, -1), [baseX, baseY]];
  return (
    <g pointerEvents="none">
      <polyline
        points={line.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="miter"
      />
      <polygon
        points={`${tipX},${tipY} ${baseX - uy * w},${baseY + ux * w} ${baseX + uy * w},${baseY - ux * w}`}
        fill={color}
      />
    </g>
  );
}
