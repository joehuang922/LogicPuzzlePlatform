/**
 * Mannequin Gate 2 (type 43) rules, shared by the board, editor, progress and tests.
 *
 * Gray lines run through cell centres; each lists every cell it passes through as
 * [row, col], consecutive cells being 8-neighbours. Shade cells so that:
 * - every line passes through exactly two shaded cells;
 * - two crossing lines have different gate sizes (a line's gate is the number of cells
 *   between its two shaded cells along the line). Lines cross when they share a cell or
 *   when two of their diagonal steps cross at a grid corner;
 * - all unshaded cells are orthogonally connected.
 * A cell no line passes through may be shaded too.
 */
import { MannequinGate2Canon } from "../types/canon";

export const EMPTY = 0;
export const SHADED = 1;
export const MARKED = 2;

export const cellKey = (r: number, c: number) => `c:${c},${r}`;

/** Cell states (0 empty, 1 shaded, 2 marked) from userValues keyed "c:col,row". */
export function statesFromValues(rows: number, cols: number, values: Record<string, number>): number[][] {
  const states = Array.from({ length: rows }, () => Array(cols).fill(EMPTY));
  for (const [key, val] of Object.entries(values)) {
    if (!key.startsWith("c:") || (val !== SHADED && val !== MARKED)) continue;
    const [c, r] = key.slice(2).split(",").map(Number);
    if (r >= 0 && r < rows && c >= 0 && c < cols) states[r][c] = val;
  }
  return states;
}

const at = (r: number, c: number) => `R${r + 1}C${c + 1}`;

/** Blocking format problems, the same ones the API's semanticChecks[43] rejects. */
export function formatProblems(canon: MannequinGate2Canon): string[] {
  const { rows, cols, lines } = canon;
  const problems: string[] = [];
  const steps = new Map<string, number>();
  lines.forEach((line, i) => {
    const name = `Line ${i + 1}`;
    if (line.length < 2) {
      problems.push(`${name} has fewer than 2 cells`);
      return;
    }
    const seen = new Set<string>();
    line.forEach(([r, c], k) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) problems.push(`${name}: ${at(r, c)} is off the board`);
      const key = `${r},${c}`;
      if (seen.has(key)) problems.push(`${name} visits ${at(r, c)} twice`);
      seen.add(key);
      if (k === 0) return;
      const [pr, pc] = line[k - 1];
      if (Math.max(Math.abs(r - pr), Math.abs(c - pc)) !== 1) {
        problems.push(`${name}: ${at(pr, pc)} and ${at(r, c)} aren't neighbours`);
        return;
      }
      const step = [`${pr},${pc}`, key].sort().join("|");
      const other = steps.get(step);
      if (other !== undefined && other !== i) {
        problems.push(`Lines ${other + 1} and ${i + 1} share the step ${at(pr, pc)}–${at(r, c)}`);
      }
      steps.set(step, i);
    });
  });
  return problems;
}

/** Overridable misread warnings for the editor. */
export function warnings(canon: MannequinGate2Canon): string[] {
  return canon.lines.length === 0 ? ["No lines"] : [];
}

/** Pairs [i, j] (i < j) of lines that cross: a shared cell, or diagonal steps crossing at a corner. */
export function crossingPairs(lines: number[][][]): [number, number][] {
  const cellSets = lines.map((l) => new Set(l.map(([r, c]) => `${r},${c}`)));
  // Each diagonal step keyed by the corner it passes through and its slope.
  const corners = lines.map((l) => {
    const set = new Set<string>();
    for (let k = 1; k < l.length; k++) {
      const [r1, c1] = l[k - 1];
      const [r2, c2] = l[k];
      if (Math.abs(r1 - r2) !== 1 || Math.abs(c1 - c2) !== 1) continue;
      const corner = `${Math.max(r1, r2)},${Math.max(c1, c2)}`;
      set.add(`${corner}:${(r2 - r1) * (c2 - c1)}`);
    }
    return set;
  });
  const pairs: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      let cross = [...cellSets[i]].some((k) => cellSets[j].has(k));
      if (!cross) {
        for (const k of corners[i]) {
          const [corner, slope] = k.split(":");
          if (corners[j].has(`${corner}:${-Number(slope)}`)) {
            cross = true;
            break;
          }
        }
      }
      if (cross) pairs.push([i, j]);
    }
  }
  return pairs;
}

/** Shaded cells on a line. */
export function shadedCount(line: number[][], states: number[][]): number {
  return line.filter(([r, c]) => states[r]?.[c] === SHADED).length;
}

/** The line's gate size: cells between its two shaded cells. null unless exactly two are shaded. */
export function gateSize(line: number[][], states: number[][]): number | null {
  const idx = line.flatMap(([r, c], k) => (states[r]?.[c] === SHADED ? [k] : []));
  return idx.length === 2 ? idx[1] - idx[0] - 1 : null;
}

export function linesWithTwo(canon: MannequinGate2Canon, states: number[][]): number {
  return canon.lines.filter((l) => shadedCount(l, states) === 2).length;
}

/**
 * Lines that already break a rule (for Errors on): 3+ shaded cells; every cell decided
 * with fewer than 2 shaded; or exactly 2 shaded with the same gate size as a crossing
 * line that also has exactly 2.
 */
export function badLines(canon: MannequinGate2Canon, states: number[][]): Set<number> {
  const bad = new Set<number>();
  const gates = canon.lines.map((l) => gateSize(l, states));
  canon.lines.forEach((l, i) => {
    const n = shadedCount(l, states);
    if (n > 2) bad.add(i);
    if (n < 2 && l.every(([r, c]) => (states[r]?.[c] ?? EMPTY) !== EMPTY)) bad.add(i);
  });
  for (const [i, j] of crossingPairs(canon.lines)) {
    if (gates[i] !== null && gates[i] === gates[j]) {
      bad.add(i);
      bad.add(j);
    }
  }
  return bad;
}

/** True when the unshaded cells (anything not shaded) form one non-empty orthogonally connected group. */
export function whitesConnected(states: number[][]): boolean {
  const rows = states.length;
  const cols = states[0]?.length ?? 0;
  let total = 0;
  let start: [number, number] | null = null;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (states[r][c] !== SHADED) {
        total++;
        start ??= [r, c];
      }
  if (!start) return false;
  const seen = new Set([start.join(",")]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols || states[nr][nc] === SHADED) continue;
      const k = `${nr},${nc}`;
      if (!seen.has(k)) {
        seen.add(k);
        stack.push([nr, nc]);
      }
    }
  }
  return seen.size === total;
}

/** Solved: every line has two shaded cells, crossing lines' gates differ, unshaded cells connected. */
export function validateMannequinGate2(canon: MannequinGate2Canon, states: number[][]): boolean {
  if (canon.lines.length === 0) return false;
  if (canon.lines.some((l) => shadedCount(l, states) !== 2)) return false;
  const gates = canon.lines.map((l) => gateSize(l, states));
  if (crossingPairs(canon.lines).some(([i, j]) => gates[i] === gates[j])) return false;
  return whitesConnected(states);
}
