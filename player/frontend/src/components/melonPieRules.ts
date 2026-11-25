import { MelonPieCanon } from "../types/canon";

// Melon Pie (type 49). Segments between grid points: "h:r,c" joins (r, c)-(r, c+1),
// "v:r,c" joins (r, c)-(r+1, c); value 1 = drawn, 2 = × mark (no line).
export const LINE = 1;
export const CROSS = 2;

export interface Segments {
  h: number[][]; // (height + 1) x width
  v: number[][]; // height x (width + 1)
}

export interface MelonPieProblem {
  message: string;
  r: number;
  c: number;
}

export function emptySegments(canon: MelonPieCanon): Segments {
  return {
    h: Array.from({ length: canon.height + 1 }, () => Array<number>(canon.width).fill(0)),
    v: Array.from({ length: canon.height }, () => Array<number>(canon.width + 1).fill(0)),
  };
}

export function fromValues(canon: MelonPieCanon, values: Record<string, number>): Segments {
  const seg = emptySegments(canon);
  for (const [key, val] of Object.entries(values)) {
    if (val !== LINE && val !== CROSS) continue;
    const kind = key.slice(0, 2);
    const [r, c] = key.slice(2).split(",").map(Number);
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0) continue;
    if (kind === "h:" && r <= canon.height && c < canon.width) seg.h[r][c] = val;
    else if (kind === "v:" && r < canon.height && c <= canon.width) seg.v[r][c] = val;
  }
  return seg;
}

export function toValues(seg: Segments): Record<string, number> {
  const values: Record<string, number> = {};
  seg.h.forEach((row, r) => row.forEach((x, c) => (x === LINE || x === CROSS) && (values[`h:${r},${c}`] = x)));
  seg.v.forEach((row, r) => row.forEach((x, c) => (x === LINE || x === CROSS) && (values[`v:${r},${c}`] = x)));
  return values;
}

type Point = [number, number];

/** The drawn segments at a point, as the neighbouring points they lead to. */
export function neighbours(canon: MelonPieCanon, seg: Segments, r: number, c: number): Point[] {
  const out: Point[] = [];
  if (c > 0 && seg.h[r]?.[c - 1] === LINE) out.push([r, c - 1]);
  if (c < canon.width && seg.h[r]?.[c] === LINE) out.push([r, c + 1]);
  if (r > 0 && seg.v[r - 1]?.[c] === LINE) out.push([r - 1, c]);
  if (r < canon.height && seg.v[r]?.[c] === LINE) out.push([r + 1, c]);
  return out;
}

function circleMap(canon: MelonPieCanon): Map<string, number> {
  return new Map(canon.circles.map((k) => [`${k.r},${k.c}`, k.color]));
}

function segKey(a: Point, b: Point): string {
  const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
  return p[0] === q[0] ? `h:${p[0]},${p[1]}` : `v:${p[0]},${p[1]}`;
}

export interface Strand {
  from: Point; // a circle
  to: Point | null; // the circle it reaches, or null when it stops (dead end, branch, loop)
  segments: string[]; // segment keys walked
}

/**
 * Follow the line from the circle at `from`: through a 2-segment point it takes the other
 * segment, through a 4-segment point (a crossing) it goes straight. It stops at a circle,
 * or with `to: null` at a point with 1 or 3 segments, a circle with no single segment, or
 * after visiting more segments than exist (a loop can't happen from a circle, but guard).
 */
export function strandFrom(canon: MelonPieCanon, seg: Segments, from: Point): Strand {
  const circles = circleMap(canon);
  const first = neighbours(canon, seg, from[0], from[1]);
  if (first.length !== 1) return { from, to: null, segments: [] };
  const segments: string[] = [];
  let prev = from;
  let cur = first[0];
  const limit = 2 * (canon.width + 1) * (canon.height + 1);
  for (let step = 0; step < limit; step++) {
    segments.push(segKey(prev, cur));
    if (circles.has(`${cur[0]},${cur[1]}`)) return { from, to: cur, segments };
    const nb = neighbours(canon, seg, cur[0], cur[1]);
    let next: Point | undefined;
    if (nb.length === 2) {
      next = nb.find(([r, c]) => r !== prev[0] || c !== prev[1]);
    } else if (nb.length === 4) {
      next = [2 * cur[0] - prev[0], 2 * cur[1] - prev[1]];
    }
    if (!next) return { from, to: null, segments };
    prev = cur;
    cur = next;
  }
  return { from, to: null, segments };
}

function drawnCount(seg: Segments): number {
  let n = 0;
  seg.h.forEach((row) => row.forEach((x) => x === LINE && n++));
  seg.v.forEach((row) => row.forEach((x) => x === LINE && n++));
  return n;
}

/** All drawn segments joined into one piece through shared points. */
export function connected(canon: MelonPieCanon, seg: Segments): boolean {
  const pts: Point[] = [];
  for (let r = 0; r <= canon.height; r++) {
    for (let c = 0; c <= canon.width; c++) if (neighbours(canon, seg, r, c).length > 0) pts.push([r, c]);
  }
  if (pts.length === 0) return false;
  const seen = new Set([`${pts[0][0]},${pts[0][1]}`]);
  const stack = [pts[0]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    for (const [nr, nc] of neighbours(canon, seg, r, c)) {
      const k = `${nr},${nc}`;
      if (!seen.has(k)) {
        seen.add(k);
        stack.push([nr, nc]);
      }
    }
  }
  return seen.size === pts.length;
}

/** The four rules: pairs of same-coloured circles, no branches or loose ends, one connected whole. */
export function validateMelonPie(canon: MelonPieCanon, seg: Segments): boolean {
  if (canon.circles.length === 0) return false;
  const circles = circleMap(canon);
  for (let r = 0; r <= canon.height; r++) {
    for (let c = 0; c <= canon.width; c++) {
      const d = neighbours(canon, seg, r, c).length;
      if (circles.has(`${r},${c}`) ? d !== 1 : d !== 0 && d !== 2 && d !== 4) return false;
    }
  }
  const covered = new Set<string>();
  for (const k of canon.circles) {
    const s = strandFrom(canon, seg, [k.r, k.c]);
    if (!s.to || circles.get(`${s.to[0]},${s.to[1]}`) !== k.color) return false;
    s.segments.forEach((x) => covered.add(x));
  }
  if (covered.size !== drawnCount(seg)) return false; // a loop without circles
  return connected(canon, seg);
}

export interface Broken {
  circles: Set<number>; // index into canon.circles
  points: Set<string>; // "r,c" of a plain point with 3 segments
}

/** What the drawn lines already break (Errors: On). */
export function brokenClues(canon: MelonPieCanon, seg: Segments): Broken {
  const circles = new Set<number>();
  const index = new Map(canon.circles.map((k, i) => [`${k.r},${k.c}`, i]));
  canon.circles.forEach((k, i) => {
    if (neighbours(canon, seg, k.r, k.c).length > 1) {
      circles.add(i);
      return;
    }
    const s = strandFrom(canon, seg, [k.r, k.c]);
    if (s.to) {
      const j = index.get(`${s.to[0]},${s.to[1]}`)!;
      if (canon.circles[j].color !== k.color) {
        circles.add(i);
        circles.add(j);
      }
    }
  });
  const points = new Set<string>();
  for (let r = 0; r <= canon.height; r++) {
    for (let c = 0; c <= canon.width; c++) {
      if (!index.has(`${r},${c}`) && neighbours(canon, seg, r, c).length === 3) points.add(`${r},${c}`);
    }
  }
  return { circles, points };
}

/** Circles whose strand reaches a circle of the same colour, over all circles, 0-100. */
export function melonPieProgress(canon: MelonPieCanon, seg: Segments): number {
  if (canon.circles.length === 0) return 0;
  const circles = circleMap(canon);
  let done = 0;
  for (const k of canon.circles) {
    const s = strandFrom(canon, seg, [k.r, k.c]);
    if (s.to && circles.get(`${s.to[0]},${s.to[1]}`) === k.color) done++;
  }
  return (done / canon.circles.length) * 100;
}

/** Format problems: what the API's semanticChecks rejects. A board with any can't be saved. */
export function melonPieFormatProblems(canon: MelonPieCanon): MelonPieProblem[] {
  const problems: MelonPieProblem[] = [];
  const seen = new Set<string>();
  for (const { r, c } of canon.circles) {
    const at = { r: Math.min(r, canon.height), c: Math.min(c, canon.width) };
    if (r < 0 || c < 0 || r > canon.height || c > canon.width) {
      problems.push({ message: `Circle at (${r},${c}) is off the lattice`, ...at });
    }
    const key = `${r},${c}`;
    if (seen.has(key)) problems.push({ message: `Two circles at (${r},${c})`, ...at });
    seen.add(key);
  }
  return problems;
}

const COLOR_NAMES = ["white", "black", "gray"];

/** Misread warnings: suspicious but saveable once overridden. */
export function melonPieWarnings(canon: MelonPieCanon): MelonPieProblem[] {
  const warnings: MelonPieProblem[] = [];
  if (canon.circles.length === 0) warnings.push({ message: "No circles", r: 0, c: 0 });
  for (let color = 0; color < 3; color++) {
    const n = canon.circles.filter((k) => k.color === color).length;
    if (n % 2 === 1) warnings.push({ message: `${n} ${COLOR_NAMES[color]} circles can't pair up`, r: 0, c: 0 });
  }
  return warnings;
}
