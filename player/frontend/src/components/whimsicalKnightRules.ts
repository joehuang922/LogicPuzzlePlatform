import { WhimsicalKnightCanon, WhimsicalKnightPoint } from "../types/canon";

// A dot (row, col) and a segment between two dots, the smaller dot first.
export type Dot = [number, number];
export type Segment = [Dot, Dot];

// Every step a segment may take from a dot: orthogonal, then knight's moves.
export const STEPS: Dot[] = [
  [0, 1], [1, 0], [0, -1], [-1, 0],
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

export function normalize(a: Dot, b: Dot): Segment {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
}

/** The userValues key of a segment: "s:r1,c1,r2,c2", smaller dot first. */
export function segmentKey(a: Dot, b: Dot): string {
  const [p, q] = normalize(a, b);
  return `s:${p[0]},${p[1]},${q[0]},${q[1]}`;
}

export function parseSegmentKey(key: string): Segment | null {
  const m = /^s:(\d+),(\d+),(\d+),(\d+)$/.exec(key);
  if (!m) return null;
  const [r1, c1, r2, c2] = m.slice(1).map(Number);
  return normalize([r1, c1], [r2, c2]);
}

export function isKnight([a, b]: Segment): boolean {
  const dr = Math.abs(a[0] - b[0]);
  const dc = Math.abs(a[1] - b[1]);
  return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
}

/** Whether two dots may be joined: orthogonal neighbours or a knight's move apart. */
export function isStep(a: Dot, b: Dot): boolean {
  const dr = Math.abs(a[0] - b[0]);
  const dc = Math.abs(a[1] - b[1]);
  return dr + dc === 1 || (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
}

/** The two cells (row, col) of a knight segment's 1x2 rectangle. */
export function knightCells([a, b]: Segment): Dot[] {
  const r0 = Math.min(a[0], b[0]);
  const c0 = Math.min(a[1], b[1]);
  return Math.abs(a[1] - b[1]) === 2 ? [[r0, c0], [r0, c0 + 1]] : [[r0, c0], [r0 + 1, c0]];
}

/** A knight segment over a gray square. */
export function overGray(canon: WhimsicalKnightCanon, seg: Segment): boolean {
  return isKnight(seg) && knightCells(seg).some(([r, c]) => canon.gray[r]?.[c] === 1);
}

function orient(a: Dot, b: Dot, c: Dot): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/**
 * Whether two segments meet anywhere but a shared end dot. Segments never pass through
 * a dot (a knight's move has no lattice point inside), so two that share an end can only
 * meet there.
 */
export function crosses(s: Segment, t: Segment): boolean {
  const shared = s.some((p) => t.some((q) => p[0] === q[0] && p[1] === q[1]));
  if (shared) return false;
  const [p1, p2] = s;
  const [p3, p4] = t;
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  const within = (a: Dot, b: Dot, c: Dot) =>
    orient(a, b, c) === 0 &&
    Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  return within(p3, p4, p1) || within(p3, p4, p2) || within(p1, p2, p3) || within(p1, p2, p4);
}

/** Segments drawn by the player, from userValues ("s:..." -> 1). */
export function segmentsOf(values: Record<string, number>): Segment[] {
  const out: Segment[] = [];
  for (const [key, v] of Object.entries(values)) {
    if (v !== 1) continue;
    const seg = parseSegmentKey(key);
    if (seg) out.push(seg);
  }
  return out;
}

/** Direction vectors (from the dot) of the segments ending at a dot. */
function dirsAt(segs: Segment[], [r, c]: Dot): Dot[] {
  const dirs: Dot[] = [];
  for (const [a, b] of segs) {
    if (a[0] === r && a[1] === c) dirs.push([b[0] - r, b[1] - c]);
    else if (b[0] === r && b[1] === c) dirs.push([a[0] - r, a[1] - c]);
  }
  return dirs;
}

const isDot = ({ dr, dc }: WhimsicalKnightPoint) => dr % 2 === 0 && dc % 2 === 0;

/**
 * Whether a clue holds: a circle on a dot (2 segments, opposite) or on a midpoint (a
 * segment whose midpoint it is), a square on a dot (2 segments, perpendicular).
 */
export function clueHolds(kind: "circle" | "square", p: WhimsicalKnightPoint, segs: Segment[]): boolean {
  if (kind === "circle" && !isDot(p)) {
    return segs.some(([a, b]) => a[0] + b[0] === p.dr && a[1] + b[1] === p.dc);
  }
  const dirs = dirsAt(segs, [p.dr / 2, p.dc / 2]);
  if (dirs.length !== 2) return false;
  const [u, v] = dirs;
  if (kind === "circle") return u[0] === -v[0] && u[1] === -v[1];
  return u[0] * v[0] + u[1] * v[1] === 0;
}

/**
 * Clues already broken by the drawn segments, whatever else is drawn: a dot clue with 3+
 * segments, or 2 that don't go straight (circle) / turn square (square).
 */
export function clueBroken(kind: "circle" | "square", p: WhimsicalKnightPoint, segs: Segment[]): boolean {
  if (kind === "circle" && !isDot(p)) return false;
  const dirs = dirsAt(segs, [p.dr / 2, p.dc / 2]);
  if (dirs.length > 2) return true;
  return dirs.length === 2 && !clueHolds(kind, p, segs);
}

export function allClues(canon: WhimsicalKnightCanon): ["circle" | "square", WhimsicalKnightPoint][] {
  return [
    ...canon.circles.map((p) => ["circle", p] as ["circle", WhimsicalKnightPoint]),
    ...canon.squares.map((p) => ["square", p] as ["square", WhimsicalKnightPoint]),
  ];
}

/** Indices of segments that cross another or are a knight over gray. */
export function badSegments(canon: WhimsicalKnightCanon, segs: Segment[]): Set<number> {
  const bad = new Set<number>();
  segs.forEach((s, i) => {
    if (overGray(canon, s)) bad.add(i);
    for (let j = i + 1; j < segs.length; j++) {
      if (crosses(s, segs[j])) {
        bad.add(i);
        bad.add(j);
      }
    }
  });
  return bad;
}

export function validateWhimsicalKnight(canon: WhimsicalKnightCanon, segs: Segment[]): boolean {
  if (segs.length === 0) return false;
  const inBounds = (d: Dot) => d[0] >= 0 && d[0] < canon.rows && d[1] >= 0 && d[1] < canon.cols;
  if (segs.some(([a, b]) => !inBounds(a) || !inBounds(b) || !isStep(a, b))) return false;
  if (badSegments(canon, segs).size > 0) return false;

  // Every used dot has exactly two segments, and they form one connected loop.
  const adj = new Map<string, string[]>();
  for (const [a, b] of segs) {
    const ka = `${a[0]},${a[1]}`;
    const kb = `${b[0]},${b[1]}`;
    adj.set(ka, [...(adj.get(ka) ?? []), kb]);
    adj.set(kb, [...(adj.get(kb) ?? []), ka]);
  }
  for (const nbrs of adj.values()) if (nbrs.length !== 2) return false;
  const start = adj.keys().next().value as string;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const n of adj.get(stack.pop()!)!) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  if (seen.size !== adj.size) return false;

  return allClues(canon).every(([kind, p]) => clueHolds(kind, p, segs));
}

/** Satisfied clues / all clues * 100 (0 when there are no clues). */
export function whimsicalKnightProgress(canon: WhimsicalKnightCanon, segs: Segment[]): number {
  const clues = allClues(canon);
  if (clues.length === 0) return 0;
  const ok = clues.filter(([kind, p]) => clueHolds(kind, p, segs)).length;
  return (ok / clues.length) * 100;
}

// Problems that make a canon unusable (the API rejects the same ones). The editor lists
// them and blocks saving.
export function whimsicalKnightFormatProblems(canon: WhimsicalKnightCanon): string[] {
  const { rows, cols, gray } = canon;
  const problems: string[] = [];
  if (gray.length !== rows - 1 || gray.some((row) => row.length !== cols - 1)) {
    problems.push(`Gray grid must be ${rows - 1}x${cols - 1}`);
  }
  const seen = new Set<string>();
  for (const [kind, { dr, dc }] of allClues(canon)) {
    const at = `${kind} at (${dr},${dc})`;
    if (dr < 0 || dc < 0 || dr > 2 * (rows - 1) || dc > 2 * (cols - 1)) problems.push(`The ${at} is outside the lattice`);
    else if (dr % 2 === 1 && dc % 2 === 1) problems.push(`The ${at} is in a cell`);
    else if (kind === "square" && (dr % 2 === 1 || dc % 2 === 1)) problems.push(`The ${at} is not on a dot`);
    const key = `${dr},${dc}`;
    if (seen.has(key)) problems.push(`Two clues at (${dr},${dc})`);
    seen.add(key);
  }
  return problems;
}
