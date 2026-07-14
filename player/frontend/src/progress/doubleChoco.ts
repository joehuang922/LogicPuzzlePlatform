import { PuzzleDefinition } from "../types/puzzle";
import { DoubleChocoCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeDoubleChocoProgress: ProgressCalculator = {
  puzzleType: 4,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as DoubleChocoCanon;

    const rows = canonRepr.cells.length;
    const cols = canonRepr.cells[0].length;
    const totalCells = rows * cols;

    if (totalCells === 0) return 0;

    // Build the grid of borders from userValues
    const h: number[][] = Array.from({ length: rows - 1 }, () => Array(cols).fill(0));
    const v: number[][] = Array.from({ length: rows }, () => Array(cols - 1).fill(0));

    for (const [key, val] of Object.entries(userValues)) {
      if (key.startsWith("h:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows - 1 && c < cols) h[r][c] = val;
      } else if (key.startsWith("v:")) {
        const [r, c] = key.slice(2).split(",").map(Number);
        if (r < rows && c < cols - 1) v[r][c] = val;
      }
    }

    // Find connected rooms using flood-fill
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    let cellsInValidRooms = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (visited[r][c]) continue;

        // BFS to find the room
        const queue: [number, number][] = [[r, c]];
        const roomCells: [number, number][] = [];
        visited[r][c] = true;

        while (queue.length > 0) {
          const [cr, cc] = queue.shift()!;
          roomCells.push([cr, cc]);

          // Check 4 neighbors - can move if no border between them
          // Up: row cr-1, check h[cr-1][cc]
          if (cr > 0 && !visited[cr - 1][cc] && h[cr - 1][cc] === 0) {
            visited[cr - 1][cc] = true;
            queue.push([cr - 1, cc]);
          }
          // Down: check h[cr][cc]
          if (cr < rows - 1 && !visited[cr + 1][cc] && h[cr][cc] === 0) {
            visited[cr + 1][cc] = true;
            queue.push([cr + 1, cc]);
          }
          // Left: check v[cr][cc-1]
          if (cc > 0 && !visited[cr][cc - 1] && v[cr][cc - 1] === 0) {
            visited[cr][cc - 1] = true;
            queue.push([cr, cc - 1]);
          }
          // Right: check v[cr][cc]
          if (cc < cols - 1 && !visited[cr][cc + 1] && v[cr][cc] === 0) {
            visited[cr][cc + 1] = true;
            queue.push([cr, cc + 1]);
          }
        }

        // A room is "established" if it has equal gray and white cells
        let whiteCells = 0;
        let grayCells = 0;
        for (const [rr, rc] of roomCells) {
          const [color] = canonRepr.cells[rr][rc];
          if (color === 0) whiteCells++;
          else grayCells++;
        }

        if (whiteCells === grayCells && whiteCells > 0) {
          cellsInValidRooms += roomCells.length;
        }
      }
    }

    return (cellsInValidRooms / totalCells) * 100;
  },
};
