import { SinkaminoCanon } from "../types/canon";

export const WHITE = 0;
export const BLACK = 1;
export const GIVEN = 2;

// Player states.
export const UNSET = 0;
export const SQUARE = 1;
export const MARKED = 2;

/**
 * Problems that make a board unrepresentable as a sinkamino (also enforced by the API's
 * semanticChecks): a trail off the grid, a step between cells that aren't neighbours, a
 * trail over a black cell, or a trail shorter than 2 cells. Positions are 1-based.
 */
export function sinkaminoFormatProblems(canon: SinkaminoCanon): string[] {
  const problems: string[] = [];
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  canon.arrows.forEach((trail, i) => {
    const name = `Arrow ${i + 1}`;
    if (trail.length < 2) problems.push(`${name} is shorter than 2 cells`);
    trail.forEach(([r, c], j) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) {
        problems.push(`${name} leaves the grid at R${r + 1}C${c + 1}`);
        return;
      }
      if (canon.cells[r][c] === BLACK) problems.push(`${name} crosses the black cell R${r + 1}C${c + 1}`);
      if (j > 0) {
        const [pr, pc] = trail[j - 1];
        if (Math.abs(pr - r) + Math.abs(pc - c) !== 1) {
          problems.push(`${name} jumps from R${pr + 1}C${pc + 1} to R${r + 1}C${c + 1}`);
        }
      }
    });
  });
  return problems;
}

/** Cells of an island, as "r,c" strings, normalised to its bounding box's top-left. */
function normalise(cells: [number, number][]): Set<string> {
  const minR = Math.min(...cells.map(([r]) => r));
  const minC = Math.min(...cells.map(([, c]) => c));
  return new Set(cells.map(([r, c]) => `${r - minR},${c - minC}`));
}

/** True when `next` is `prev`'s shape, in the same orientation, plus one square. */
export function evolvesFrom(prev: [number, number][], next: [number, number][]): boolean {
  if (next.length !== prev.length + 1) return false;
  const target = normalise(prev);
  for (let i = 0; i < next.length; i++) {
    const rest = next.filter((_, j) => j !== i);
    const shape = normalise(rest);
    if (shape.size === target.size && [...shape].every((k) => target.has(k))) return true;
  }
  return false;
}

/**
 * Validate a completed sinkamino. `states[r][c]` is the player's state (1 = square);
 * given squares count as squares, unset and marked cells as empty.
 *  1. No square on a black cell.
 *  2. Every island has exactly one square on a trail cell (over all trails).
 *  3. Every trail crosses at least 2 islands.
 *  4. Along each trail, each island is the previous one's shape (same orientation) plus
 *     one square.
 */
export function validateSinkamino(canon: SinkaminoCanon, states: number[][]): boolean {
  const rows = canon.cells.length;
  const cols = canon.cells[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return false;
  if (sinkaminoFormatProblems(canon).length > 0) return false;

  const isSquare = (r: number, c: number) => {
    const cell = canon.cells[r][c];
    if (cell === GIVEN) return true;
    return cell === WHITE && states[r]?.[c] === SQUARE;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (canon.cells[r][c] === BLACK && states[r]?.[c] === SQUARE) return false;
    }
  }

  // Label islands.
  const island = Array.from({ length: rows }, () => Array<number>(cols).fill(-1));
  const islands: [number, number][][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isSquare(r, c) || island[r][c] >= 0) continue;
      const id = islands.length;
      const members: [number, number][] = [];
      const stack: [number, number][] = [[r, c]];
      island[r][c] = id;
      while (stack.length > 0) {
        const [cr, cc] = stack.pop()!;
        members.push([cr, cc]);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && island[nr][nc] < 0 && isSquare(nr, nc)) {
            island[nr][nc] = id;
            stack.push([nr, nc]);
          }
        }
      }
      islands.push(members);
    }
  }
  if (islands.length === 0) return false;

  const crossings = Array<number>(islands.length).fill(0);
  for (const trail of canon.arrows) {
    const order: number[] = [];
    for (const [r, c] of trail) {
      const id = island[r][c];
      if (id < 0) continue;
      crossings[id]++;
      order.push(id);
    }
    if (order.length < 2) return false;
    for (let i = 1; i < order.length; i++) {
      if (!evolvesFrom(islands[order[i - 1]], islands[order[i]])) return false;
    }
  }
  return crossings.every((n) => n === 1);
}
