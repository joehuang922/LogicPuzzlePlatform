import { ZebraRopeCanon, ZebraRopeCircle } from "../types/canon";

// Cell states: 0 = unset, 1 = shaded, 2 = marked unshaded. For checking a finished
// board, unset and marked both count as unshaded.
export const UNSET = 0;
export const SHADED = 1;
export const MARKED = 2;

// The cells a circle touches: 2 for an edge midpoint, 4 for a corner.
export function circleCells({ dr, dc }: ZebraRopeCircle): [number, number][] {
  const rs = dr % 2 === 1 ? [(dr - 1) / 2] : [dr / 2 - 1, dr / 2];
  const cs = dc % 2 === 1 ? [(dc - 1) / 2] : [dc / 2 - 1, dc / 2];
  return rs.flatMap((r) => cs.map((c) => [r, c] as [number, number]));
}

// Whether a circle's majority holds: 0 = white (more unshaded), 1 = black (more
// shaded), 2 = gray (equal).
export function circleHolds(color: number, shaded: number, unshaded: number): boolean {
  if (color === 1) return shaded > unshaded;
  if (color === 0) return unshaded > shaded;
  return shaded === unshaded;
}

// Whether a rope's cells (true = shaded, in rope order) are all unshaded, all shaded,
// or alternate.
export function ropeHolds(shaded: boolean[]): boolean {
  if (shaded.every((s) => s) || shaded.every((s) => !s)) return true;
  return shaded.every((s, i) => i === 0 || s !== shaded[i - 1]);
}

export function validateZebraRope(canon: ZebraRopeCanon, states: number[][]): boolean {
  const isShaded = (r: number, c: number) => states[r]?.[c] === SHADED;
  for (const circle of canon.circles) {
    const cells = circleCells(circle);
    const shaded = cells.filter(([r, c]) => isShaded(r, c)).length;
    if (!circleHolds(circle.color, shaded, cells.length - shaded)) return false;
  }
  for (const rope of canon.ropes) {
    if (!ropeHolds(rope.map(([r, c]) => isShaded(r, c)))) return false;
  }
  return true;
}

// Clues already broken by the decided cells (shaded or marked), whatever the unset
// cells become. Unset cells don't count as unshaded here, so nothing is flagged early.
export function brokenClues(
  canon: ZebraRopeCanon,
  states: number[][]
): { circles: Set<number>; ropes: Set<number> } {
  const circles = new Set<number>();
  canon.circles.forEach((circle, i) => {
    let shaded = 0;
    let unshaded = 0;
    let open = 0;
    for (const [r, c] of circleCells(circle)) {
      const s = states[r]?.[c] ?? UNSET;
      if (s === SHADED) shaded++;
      else if (s === MARKED) unshaded++;
      else open++;
    }
    const impossible =
      circle.color === 1
        ? shaded + open <= unshaded
        : circle.color === 0
          ? unshaded + open <= shaded
          : Math.abs(shaded - unshaded) > open;
    if (impossible) circles.add(i);
  });

  const ropes = new Set<number>();
  canon.ropes.forEach((rope, i) => {
    const decided: [number, boolean][] = [];
    rope.forEach(([r, c], j) => {
      const s = states[r]?.[c] ?? UNSET;
      if (s !== UNSET) decided.push([j, s === SHADED]);
    });
    const allShaded = decided.every(([, s]) => s);
    const allUnshaded = decided.every(([, s]) => !s);
    // Alternating: two decided cells match exactly when their distance is even.
    const alternating = decided.every(
      ([j, s]) => (s === decided[0][1]) === ((j - decided[0][0]) % 2 === 0)
    );
    if (!allShaded && !allUnshaded && !alternating) ropes.add(i);
  });
  return { circles, ropes };
}

// Problems that make a canon unusable (the API rejects the same ones). The editor lists
// them and blocks saving.
export function zebraRopeFormatProblems(canon: ZebraRopeCanon): string[] {
  const { width, height, ropes, circles } = canon;
  const problems: string[] = [];
  ropes.forEach((rope, i) => {
    if (rope.length < 2) problems.push(`Rope ${i + 1} has fewer than 2 cells`);
    const seen = new Set<string>();
    rope.forEach(([r, c], j) => {
      if (r < 0 || r >= height || c < 0 || c >= width) {
        problems.push(`Rope ${i + 1} leaves the grid at R${r + 1}C${c + 1}`);
      }
      const key = `${r},${c}`;
      if (seen.has(key)) problems.push(`Rope ${i + 1} passes R${r + 1}C${c + 1} twice`);
      seen.add(key);
      if (j > 0) {
        const [pr, pc] = rope[j - 1];
        if (Math.max(Math.abs(pr - r), Math.abs(pc - c)) !== 1) {
          problems.push(`Rope ${i + 1} jumps from R${pr + 1}C${pc + 1} to R${r + 1}C${c + 1}`);
        }
      }
    });
  });
  const seen = new Set<string>();
  for (const { dr, dc } of circles) {
    if (dr < 1 || dc < 1 || dr > 2 * height - 1 || dc > 2 * width - 1) {
      problems.push(`Circle at (${dr},${dc}) is off the grid's interior lines`);
    } else if (dr % 2 === 1 && dc % 2 === 1) {
      problems.push(`Circle at (${dr},${dc}) is at a cell centre`);
    }
    const key = `${dr},${dc}`;
    if (seen.has(key)) problems.push(`Two circles at (${dr},${dc})`);
    seen.add(key);
  }
  return problems;
}
