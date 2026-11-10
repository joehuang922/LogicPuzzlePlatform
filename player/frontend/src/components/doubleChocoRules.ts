/**
 * Double Choco rules, shared by the board (completion) and progress.
 *
 * cells[r][c] = [color, number]: color 0 = white, 1 = gray; number 0 = no clue.
 * hGrids: (rows-1) x cols, 1 = border between (r,c) and (r+1,c).
 * vGrids: rows x (cols-1), 1 = border between (r,c) and (r,c+1).
 */

type Coord = [number, number];

export function computeRooms(
  rows: number,
  cols: number,
  hGrids: number[][],
  vGrids: number[][]
): number[][] {
  const roomIds: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1));
  let nextId = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (roomIds[r][c] >= 0) continue;
      const id = nextId++;
      const queue: Coord[] = [[r, c]];
      roomIds[r][c] = id;
      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        if (cr > 0 && roomIds[cr - 1][cc] < 0 && hGrids[cr - 1][cc] === 0) {
          roomIds[cr - 1][cc] = id;
          queue.push([cr - 1, cc]);
        }
        if (cr < rows - 1 && roomIds[cr + 1][cc] < 0 && hGrids[cr][cc] === 0) {
          roomIds[cr + 1][cc] = id;
          queue.push([cr + 1, cc]);
        }
        if (cc > 0 && roomIds[cr][cc - 1] < 0 && vGrids[cr][cc - 1] === 0) {
          roomIds[cr][cc - 1] = id;
          queue.push([cr, cc - 1]);
        }
        if (cc < cols - 1 && roomIds[cr][cc + 1] < 0 && vGrids[cr][cc] === 0) {
          roomIds[cr][cc + 1] = id;
          queue.push([cr, cc + 1]);
        }
      }
    }
  }
  return roomIds;
}

function normalizeShape(coords: Coord[]): string {
  if (coords.length === 0) return "";
  const minR = Math.min(...coords.map(([r]) => r));
  const minC = Math.min(...coords.map(([, c]) => c));
  const normalized = coords.map(([r, c]) => [r - minR, c - minC] as Coord);
  normalized.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return normalized.map(([r, c]) => `${r},${c}`).join("|");
}

function allRotationsAndReflections(coords: Coord[]): string[] {
  const variants: string[] = [];
  let current = coords;
  for (let rot = 0; rot < 4; rot++) {
    variants.push(normalizeShape(current));
    variants.push(normalizeShape(current.map(([r, c]) => [r, -c] as Coord)));
    current = current.map(([r, c]) => [c, -r] as Coord);
  }
  return variants;
}

function isConnected(coords: Coord[]): boolean {
  if (coords.length <= 1) return true;
  const set = new Set(coords.map(([r, c]) => `${r},${c}`));
  const visited = new Set<string>([`${coords[0][0]},${coords[0][1]}`]);
  const queue: Coord[] = [coords[0]];
  while (queue.length > 0) {
    const [cr, cc] = queue.pop()!;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const key = `${cr + dr},${cc + dc}`;
      if (set.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([cr + dr, cc + dc]);
      }
    }
  }
  return visited.size === coords.length;
}

/**
 * Ids of rooms that satisfy every per-room rule:
 *  1. equally many, and at least one, white and gray cells,
 *  2. the white cells are connected, and so are the gray cells,
 *  3. the white shape equals the gray shape up to rotation/reflection,
 *  4. every clue in the room equals its per-color cell count.
 */
export function validRoomIds(cells: [number, number][][], roomIds: number[][]): Set<number> {
  const rooms = new Map<number, { whites: Coord[]; grays: Coord[]; clues: number[] }>();
  for (let r = 0; r < roomIds.length; r++) {
    for (let c = 0; c < roomIds[r].length; c++) {
      const id = roomIds[r][c];
      if (!rooms.has(id)) rooms.set(id, { whites: [], grays: [], clues: [] });
      const room = rooms.get(id)!;
      const [color, num] = cells[r][c];
      (color === 0 ? room.whites : room.grays).push([r, c]);
      if (num > 0) room.clues.push(num);
    }
  }

  const valid = new Set<number>();
  for (const [id, { whites, grays, clues }] of rooms) {
    if (whites.length !== grays.length || whites.length === 0) continue;
    if (!isConnected(whites) || !isConnected(grays)) continue;
    if (!allRotationsAndReflections(grays).includes(normalizeShape(whites))) continue;
    if (clues.some((n) => n !== whites.length)) continue;
    valid.add(id);
  }
  return valid;
}

/** Every room valid and every drawn border separates two different rooms. */
export function validateSolution(
  cells: [number, number][][],
  hGrids: number[][],
  vGrids: number[][]
): boolean {
  const rows = cells.length;
  const cols = cells[0].length;
  const roomIds = computeRooms(rows, cols, hGrids, vGrids);
  const roomCount = new Set(roomIds.flat()).size;
  if (validRoomIds(cells, roomIds).size !== roomCount) return false;

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      if (hGrids[r][c] === 1 && roomIds[r][c] === roomIds[r + 1][c]) return false;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      if (vGrids[r][c] === 1 && roomIds[r][c] === roomIds[r][c + 1]) return false;
    }
  }
  return true;
}
