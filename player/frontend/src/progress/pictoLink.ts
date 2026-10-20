import { PuzzleDefinition } from "../types/puzzle";
import { PictoLinkCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

// "Clues correctly linked": the share of clue cells that belong to a complete,
// correct path. A value-n>=2 endpoint counts once it is joined to a matching
// partner by a non-branching path of exactly n cells; a 1-clue counts once it is
// filled as a single. Mirrors the board's completion check, scored per clue cell
// (both endpoints of a correct pair count) so the bar climbs as pairs are solved.
export const computePictoLinkProgress: ProgressCalculator = {
  puzzleType: 27,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as PictoLinkCanon;

    const cells = canonRepr.cells;
    const rows = cells.length;
    const cols = cells[0]?.length ?? 0;
    if (rows === 0 || cols === 0) return 0;

    const h: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));
    const v: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
    const singleSet = new Set<number>();

    for (const [key, val] of Object.entries(userValues)) {
      if (val === 0) continue;
      if (key.startsWith("h:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r >= 0 && r < rows && c >= 0 && c < cols - 1) h[r][c] = 1;
      } else if (key.startsWith("v:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r >= 0 && r < rows - 1 && c >= 0 && c < cols) v[r][c] = 1;
      } else if (key.startsWith("s:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r >= 0 && r < rows && c >= 0 && c < cols) singleSet.add(r * cols + c);
      }
    }

    const degreeOf = (r: number, c: number): number => {
      let d = 0;
      if (c > 0 && h[r][c - 1] === 1) d++;
      if (c < cols - 1 && h[r][c] === 1) d++;
      if (r > 0 && v[r - 1][c] === 1) d++;
      if (r < rows - 1 && v[r][c] === 1) d++;
      return d;
    };
    const neighbors = (r: number, c: number): [number, number][] => {
      const ns: [number, number][] = [];
      if (c > 0 && h[r][c - 1] === 1) ns.push([r, c - 1]);
      if (c < cols - 1 && h[r][c] === 1) ns.push([r, c + 1]);
      if (r > 0 && v[r - 1][c] === 1) ns.push([r - 1, c]);
      if (r < rows - 1 && v[r][c] === 1) ns.push([r + 1, c]);
      return ns;
    };

    let totalClues = 0;
    let linkedClues = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = cells[r][c];
        if (val === 0) continue;
        totalClues++;

        if (val === 1) {
          if (singleSet.has(r * cols + c) && degreeOf(r, c) === 0) linkedClues++;
          continue;
        }

        // Endpoint of a value-n>=2 clue: trace its path and verify the far end
        // is a matching clue reached in exactly n cells, with no branch en route.
        if (degreeOf(r, c) !== 1) continue;
        let prevR = -1, prevC = -1;
        let curR = r, curC = c;
        let count = 0;
        let ok = true;
        while (true) {
          count++;
          if (count > val) { ok = false; break; } // overshot the required length
          if (cells[curR][curC] >= 2 && !(curR === r && curC === c)) break; // reached a clue
          const ns = neighbors(curR, curC).filter(([nr, nc]) => !(nr === prevR && nc === prevC));
          // Interior cells must pass straight through (exactly one onward step).
          if (ns.length !== 1) { ok = false; break; }
          prevR = curR; prevC = curC;
          [curR, curC] = ns[0];
        }
        if (ok && count === val && cells[curR][curC] === val && !(curR === r && curC === c)) {
          linkedClues++;
        }
      }
    }

    if (totalClues === 0) return 0;
    return (linkedClues / totalClues) * 100;
  },
};
