import { PuzzleDefinition } from "../types/puzzle";

/**
 * The "on track" check, the web twin of Android's PuzzleEngine.matchesSolution: true
 * while every mark the player has made agrees with the puzzle's stored solution
 * (auto-solve `solutionRepr`), false as soon as one doesn't. Unmarked cells never
 * count against it, so a partial board can be on track. It reports no *where*, only
 * *whether*: a player who has gone wrong steps back with Undo until it turns true.
 *
 * Null when the type has no check or the puzzle has no stored solution (types without
 * a solver, puzzles the gate couldn't prove unique) or one whose shape doesn't fit the
 * puzzle. Values use each board's own keys (the same as Android's userValues).
 */
export function matchesSolution(puzzle: PuzzleDefinition, values: Record<string, number>): boolean | null {
  const check = CHECKS[puzzle.puzzleType];
  if (!check) return null;
  const solution = parse(puzzle.solutionRepr);
  if (!solution) return null;
  const expected = check(parse(puzzle.canonRepr) ?? {}, solution);
  if (!expected) return null;
  for (const [key, value] of Object.entries(values)) {
    const verdict = expected(key, value);
    if (verdict === false) return false;
  }
  return true;
}

type Json = Record<string, unknown>;
/** Does mark `value` at `key` agree with the solution? null: not a mark the check reads. */
type Expect = (key: string, value: number) => boolean | null;

function parse(repr: unknown): Json | null {
  const obj = typeof repr === "string" ? JSON.parse(repr) : repr;
  return obj && typeof obj === "object" ? (obj as Json) : null;
}

/** `value` as a rows x cols grid of integers, or null. */
function grid(value: unknown, rows: number, cols: number): number[][] | null {
  if (!Array.isArray(value) || value.length !== rows) return null;
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== cols || !row.every(Number.isInteger)) return null;
  }
  return value as number[][];
}

/** "a,b" (after an optional "x:" prefix) -> [a, b]; null for any other key. */
function pair(key: string, prefix = ""): [number, number] | null {
  if (!key.startsWith(prefix)) return null;
  const m = /^(\d+),(\d+)$/.exec(key.slice(prefix.length));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** A digit entered at "col,row" must be the solution's digit there (notes ignored). */
function digits(sol: number[][]): Expect {
  return (key, value) => {
    const cr = pair(key);
    if (!cr || value < 1 || value > 9) return null;
    return sol[cr[1]]?.[cr[0]] === value;
  };
}

/** A two-state mark: `on` must be 1 in the solution, `off` must be 0. */
function onOff(sol: number[][], prefix: string, on: number, off: number, rowFirst: boolean): Expect {
  return (key, value) => {
    const ab = pair(key, prefix);
    if (!ab || (value !== on && value !== off)) return null;
    const [r, c] = rowFirst ? ab : [ab[1], ab[0]];
    const want = sol[r]?.[c];
    if (want === undefined) return null;
    return want === (value === on ? 1 : 0);
  };
}

const CHECKS: Record<number, (canon: Json, solution: Json) => Expect | null> = {
  // Sudoku: { hints: 9x9 }.
  1: (_canon, s) => {
    const sol = grid(s.hints, 9, 9);
    return sol && digits(sol);
  },
  // Combo sudoku: { subboards: [{ x, y, answers: 9x9 }] }, one per canon board.
  2: (canon, s) => {
    const boards = canon.subboards as { x: number; y: number }[] | undefined;
    const solved = s.subboards as { x: number; y: number; answers: unknown }[] | undefined;
    if (!Array.isArray(boards) || !Array.isArray(solved) || boards.length !== solved.length) return null;
    const byCell = new Map<string, number>();
    for (const [i, sb] of solved.entries()) {
      const answers = grid(sb?.answers, 9, 9);
      if (!answers || sb.x !== boards[i].x || sb.y !== boards[i].y) return null;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) byCell.set(`${3 * sb.x + c},${3 * sb.y + r}`, answers[r][c]);
      }
    }
    return (key, value) => (byCell.has(key) && value >= 1 && value <= 9 ? byCell.get(key) === value : null);
  },
  // Slitherlink: { edges: { h: (rows+1) x cols, v: rows x (cols+1) } }; "h:row,col" /
  // "v:row,col" -> 1 line, 2 cross.
  5: (canon, s) => {
    const cells = canon.cells as unknown[][] | undefined;
    const edges = s.edges as Json | undefined;
    if (!Array.isArray(cells) || !Array.isArray(cells[0]) || !edges) return null;
    const rows = cells.length;
    const cols = cells[0].length;
    const h = grid(edges.h, rows + 1, cols);
    const v = grid(edges.v, rows, cols + 1);
    if (!h || !v) return null;
    const checkH = onOff(h, "h:", 1, 2, true);
    const checkV = onOff(v, "v:", 1, 2, true);
    return (key, value) => (key.startsWith("h:") ? checkH(key, value) : checkV(key, value));
  },
  // Nonogram: { cells: rows x cols of 0/1 }; "col,row" -> 1 filled, 2 crossed.
  6: (canon, s) => {
    const rows = (canon.rowClues as unknown[] | undefined)?.length ?? 0;
    const cols = (canon.colClues as unknown[] | undefined)?.length ?? 0;
    const sol = grid(s.cells, rows, cols);
    return sol && onOff(sol, "", 1, 2, false);
  },
  // Kakuro: { values: rows x cols, 0 off the white cells }.
  12: (canon, s) => {
    const cells = canon.cells as unknown[][] | undefined;
    if (!Array.isArray(cells) || !Array.isArray(cells[0])) return null;
    const sol = grid(s.values, cells.length, cells[0].length);
    return sol && digits(sol);
  },
  // LITS: { shaded: rows x cols of 0/1 }; "c:col,row" -> 1 shaded, 2 marked unshaded.
  15: (canon, s) => {
    const g = canon.grids as { h?: unknown[]; v?: unknown[][] } | undefined;
    if (!g?.h || !Array.isArray(g.v?.[0])) return null;
    const sol = grid(s.shaded, g.h.length + 1, g.v[0].length + 1);
    return sol && onOff(sol, "c:", 1, 2, false);
  },
};
