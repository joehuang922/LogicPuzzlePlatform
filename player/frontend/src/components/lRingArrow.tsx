/** A bold filled arrow like the print, centred at (cx, cy) in a box of side `size`. */
export function LRingArrow({ dir, cx, cy, size, fill = "#222" }: { dir: number; cx: number; cy: number; size: number; fill?: string }) {
  const s = size / 2;
  // Pointing up; rotated clockwise by 90 degrees per step (1 up, 2 right, 3 down, 4 left).
  const pts = [
    [0, -s],
    [s * 0.85, -s * 0.05],
    [s * 0.32, -s * 0.05],
    [s * 0.32, s],
    [-s * 0.32, s],
    [-s * 0.32, -s * 0.05],
    [-s * 0.85, -s * 0.05],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(" ");
  return (
    <polygon
      points={pts}
      fill={fill}
      transform={`translate(${cx},${cy}) rotate(${(dir - 1) * 90})`}
      pointerEvents="none"
    />
  );
}
