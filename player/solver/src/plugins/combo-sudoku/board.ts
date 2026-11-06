import { CellValues } from "../../types";
import { Geometry, UnitBoard, UnitKind, geometry } from "../sudoku/units";
import { ComboSudokuCanon } from "./model";

/**
 * The hint geometry of a combo sudoku: every covered cell (ids in reading order, top
 * row first), each board's rows and columns, and its boxes, a room two boards share
 * counted once. Labels use global coordinates ("R7C13"); a unit names its board.
 */
export function comboGeometry(canon: ComboSudokuCanon): Geometry {
  const covered = new Map<string, [number, number]>();
  for (const sb of canon.subboards) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) covered.set(`${3 * sb.x + c},${3 * sb.y + r}`, [3 * sb.x + c, 3 * sb.y + r]);
    }
  }
  const cells = [...covered.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const ids = new Map(cells.map(([c, r], id) => [`${c},${r}`, id]));
  const at = (c: number, r: number) => ids.get(`${c},${r}`)!;

  const units: number[][] = [];
  const kinds: UnitKind[] = [];
  const labels: string[] = [];
  const boards = canon.subboards;
  const multi = boards.length > 1;
  const boardName = (i: number) => (multi ? `board ${i + 1} ` : "");
  boards.forEach((sb, i) => {
    for (let r = 0; r < 9; r++) {
      units.push(Array.from({ length: 9 }, (_, c) => at(3 * sb.x + c, 3 * sb.y + r)));
      kinds.push("row");
      labels.push(`${boardName(i)}row ${r + 1}`);
    }
  });
  boards.forEach((sb, i) => {
    for (let c = 0; c < 9; c++) {
      units.push(Array.from({ length: 9 }, (_, r) => at(3 * sb.x + c, 3 * sb.y + r)));
      kinds.push("col");
      labels.push(`${boardName(i)}column ${c + 1}`);
    }
  });
  const seenRooms = new Set<string>();
  boards.forEach((sb, i) => {
    for (let k = 0; k < 9; k++) {
      const rx = sb.x + (k % 3);
      const ry = sb.y + Math.floor(k / 3);
      if (seenRooms.has(`${rx},${ry}`)) continue;
      seenRooms.add(`${rx},${ry}`);
      const box: number[] = [];
      for (let d = 0; d < 9; d++) box.push(at(3 * rx + (d % 3), 3 * ry + Math.floor(d / 3)));
      units.push(box);
      kinds.push("box");
      labels.push(`${boardName(i)}box ${k + 1}`);
    }
  });

  const cellLabel = (id: number) => `R${cells[id][1] + 1}C${cells[id][0] + 1}`;
  return geometry(
    cells.length,
    units,
    kinds,
    (id) => `${cells[id][0]},${cells[id][1]}`,
    cellLabel,
    (u) => labels[u]
  );
}

/** Givens (merged across boards) win; otherwise the player's entry at global "col,row". */
export function buildComboBoard(canon: ComboSudokuCanon, entered: CellValues): UnitBoard {
  const geo = comboGeometry(canon);
  const givens = new Map<string, number>();
  for (const sb of canon.subboards) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = sb.hints[r]?.[c] ?? 0;
        if (v >= 1 && v <= 9) givens.set(`${3 * sb.x + c},${3 * sb.y + r}`, v);
      }
    }
  }
  const values = Array.from({ length: geo.size }, (_, id) => {
    const key = geo.key(id);
    const v = givens.get(key) ?? entered[key] ?? 0;
    return v >= 1 && v <= 9 ? v : 0;
  });
  return UnitBoard.build(geo, values);
}
