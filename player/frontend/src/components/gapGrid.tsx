// Print-style "gap grid" layout shared by sudoku variants whose clues sit between
// neighbouring cells (unequal sudoku, and later variants): each cell is a separate
// outlined square, the clue lives in the gap between two squares, and each 3x3 box
// sits on a tinted backing plate (checkerboard of two tints) so boxes read as groups.

export const GAP_CELL = 40;
export const GAP = 16;
export const PITCH = GAP_CELL + GAP;
// Size of the 9x9 board, from the first cell's outer edge to the last cell's.
export const GAP_BOARD = 9 * GAP_CELL + 8 * GAP;

export const cellX = (col: number) => col * PITCH;
export const cellY = (row: number) => row * PITCH;
export const cellCx = (col: number) => col * PITCH + GAP_CELL / 2;
export const cellCy = (row: number) => row * PITCH + GAP_CELL / 2;

// Dark vs near-white so the box a gap belongs to reads at a glance; the signs (#3a2430)
// stay legible on both. Keep in sync with Android BOX_TINTS / MINI_TINTS.
const BOX_TINTS = ["#c9b8cf", "#f5f2f6"];
const PLATE_MARGIN = GAP / 2;

/** Tinted backing plates for the nine 3x3 boxes. Plates meet in the middle of the
 * gap between boxes; neighbouring plates differ in tint. */
export function BoxPlates() {
  const plates: JSX.Element[] = [];
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const x = bc === 0 ? -PLATE_MARGIN : cellX(bc * 3) - GAP / 2;
      const y = br === 0 ? -PLATE_MARGIN : cellY(br * 3) - GAP / 2;
      const x2 = bc === 2 ? GAP_BOARD + PLATE_MARGIN : cellX(bc * 3 + 3) - GAP / 2;
      const y2 = br === 2 ? GAP_BOARD + PLATE_MARGIN : cellY(br * 3 + 3) - GAP / 2;
      plates.push(
        <rect
          key={`plate-${br}-${bc}`}
          x={x}
          y={y}
          width={x2 - x}
          height={y2 - y}
          fill={BOX_TINTS[(br + bc) % 2]}
        />
      );
    }
  }
  return <g pointerEvents="none">{plates}</g>;
}

/** Centre of the gap to the right of (row, col). */
export const rightGapCenter = (row: number, col: number) => ({
  x: cellX(col) + GAP_CELL + GAP / 2,
  y: cellCy(row),
});

/** Centre of the gap below (row, col). */
export const downGapCenter = (row: number, col: number) => ({
  x: cellCx(col),
  y: cellY(row) + GAP_CELL + GAP / 2,
});

/**
 * An inequality chevron in a gap. `horizontal` gaps hold < / >, vertical gaps hold
 * ∧ / ∨. `sign` 1 = the first cell (left / upper) is smaller, so the tip faces it;
 * 2 = the first cell is larger. 0 draws nothing.
 */
export function InequalitySign({
  cx,
  cy,
  horizontal,
  sign,
  color = "#3a2430",
}: {
  cx: number;
  cy: number;
  horizontal: boolean;
  sign: number;
  color?: string;
}) {
  if (sign !== 1 && sign !== 2) return null;
  const depth = GAP * 0.28; // half-extent along the gap axis
  const spread = GAP * 0.42; // half-extent across it
  // dir = -1: tip toward the first cell (left / up); +1: toward the second.
  const dir = sign === 1 ? -1 : 1;
  const points = horizontal
    ? [
        [cx - dir * depth, cy - spread],
        [cx + dir * depth, cy],
        [cx - dir * depth, cy + spread],
      ]
    : [
        [cx - spread, cy - dir * depth],
        [cx, cy + dir * depth],
        [cx + spread, cy - dir * depth],
      ];
  return (
    <polyline
      points={points.map((p) => p.join(",")).join(" ")}
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    />
  );
}
