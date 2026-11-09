// Balance Link rules, shared by the board, the progress calculator and the editor.

export const EMPTY = 0;
export const BLACK = 1;

export const SHAPES = [
  { id: 1, name: "Circle" },
  { id: 2, name: "Square" },
  { id: 3, name: "Diamond" },
  { id: 4, name: "Triangle ▲" },
  { id: 5, name: "Triangle ▼" },
  { id: 6, name: "Star" },
  { id: 7, name: "4-point star" },
] as const;

export const isSymbol = (v: number) => v >= 10;
export const symbolShape = (v: number) => Math.floor(v / 10);
export const symbolIsBlack = (v: number) => v % 10 === 1;
export const symbolCode = (shape: number, black: boolean) => shape * 10 + (black ? 1 : 0);

export type Point = [number, number]; // [row, col]

export interface Edges {
  h: number[][];
  v: number[][];
}

function linked(edges: Edges, rows: number, cols: number, r: number, c: number): Point[] {
  const ns: Point[] = [];
  if (c > 0 && edges.h[r]?.[c - 1] === 1) ns.push([r, c - 1]);
  if (c < cols - 1 && edges.h[r]?.[c] === 1) ns.push([r, c + 1]);
  if (r > 0 && edges.v[r - 1]?.[c] === 1) ns.push([r - 1, c]);
  if (r < rows - 1 && edges.v[r]?.[c] === 1) ns.push([r + 1, c]);
  return ns;
}

/**
 * The mirror that swaps a line's two ends, as a point map, or null when no grid mirror
 * can: the ends must share a row (vertical mirror), a column (horizontal mirror) or a
 * 45° diagonal (diagonal mirror). Those are the only mirrors that map a grid path onto
 * itself, so a line with any other ends can't be balanced.
 */
function mirrorFor([r0, c0]: Point, [rn, cn]: Point): ((p: Point) => Point) | null {
  if (r0 === rn) return ([r, c]) => [r, c0 + cn - c];
  if (c0 === cn) return ([r, c]) => [r0 + rn - r, c];
  if (rn - r0 === cn - c0) {
    const k = (r0 + c0 + rn + cn) / 2; // mirror r + c = k
    return ([r, c]) => [k - c, k - r];
  }
  if (rn - r0 === c0 - cn) {
    const k = (r0 - c0 + rn - cn) / 2; // mirror r - c = k
    return ([r, c]) => [c + k, r - k];
  }
  return null;
}

/** True when the line P0..Pn is line-symmetric about its midpoint: R(Pi) = P(n-i). */
export function isBalanced(points: Point[]): boolean {
  if (points.length < 2) return false;
  const n = points.length - 1;
  const mirror = mirrorFor(points[0], points[n]);
  if (!mirror) return false;
  return points.every((p, i) => {
    const [mr, mc] = mirror(p);
    return mr === points[n - i][0] && mc === points[n - i][1];
  });
}

export interface TracedLine {
  points: Point[];
  // Both ends are symbols of the same code.
  matched: boolean;
  balanced: boolean;
}

/**
 * Every line that starts at a symbol: followed along the drawn segments until it reaches
 * another symbol or stops. Each line is reported once, from its first end in reading
 * order.
 */
export function traceLines(cells: number[][], edges: Edges): TracedLine[] {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const seen = new Set<string>();
  const lines: TracedLine[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isSymbol(cells[r][c]) || seen.has(`${r},${c}`)) continue;
      const first = linked(edges, rows, cols, r, c);
      if (first.length !== 1) continue;
      const points: Point[] = [[r, c]];
      let prev: Point = [r, c];
      let cur: Point = first[0];
      while (true) {
        points.push(cur);
        if (isSymbol(cells[cur[0]][cur[1]])) break;
        const next = linked(edges, rows, cols, cur[0], cur[1]).filter(
          ([nr, nc]) => !(nr === prev[0] && nc === prev[1])
        );
        if (next.length !== 1 || points.length > rows * cols) break;
        prev = cur;
        cur = next[0];
      }
      const [er, ec] = points[points.length - 1];
      seen.add(`${r},${c}`);
      seen.add(`${er},${ec}`);
      const matched = (er !== r || ec !== c) && cells[er][ec] === cells[r][c];
      lines.push({ points, matched, balanced: matched && isBalanced(points) });
    }
  }
  return lines;
}

/** Cells holding a symbol that sits on a matched, balanced line. */
export function finishedSymbols(cells: number[][], edges: Edges): number {
  return traceLines(cells, edges).filter((l) => l.matched && l.balanced).length * 2;
}

/**
 * A full solution: no segment touches a black cell, every symbol has exactly one
 * segment and every other cell 0 or 2, every line joins two identical symbols and is
 * balanced, and there are no loops.
 */
export function validateBalanceLink(cells: number[][], edges: Edges): boolean {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return false;
  let symbols = 0;
  let used = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const deg = linked(edges, rows, cols, r, c).length;
      const v = cells[r][c];
      if (v === BLACK && deg > 0) return false;
      if (isSymbol(v)) {
        symbols++;
        if (deg !== 1) return false;
      } else if (deg !== 0 && deg !== 2) {
        return false;
      }
      if (deg > 0) used++;
    }
  }
  if (symbols === 0) return false;
  const lines = traceLines(cells, edges);
  if (lines.length * 2 !== symbols || !lines.every((l) => l.matched && l.balanced)) return false;
  // Every used cell lies on a traced line; anything else is a loop.
  const onLines = lines.reduce((n, l) => n + l.points.length, 0);
  return onLines === used;
}
