/**
 * The shape the sudoku-family hint ladder reasons over: cells, and units (rows, columns,
 * boxes) whose cells must hold different digits. Plain sudoku is one NxN instance
 * (9x9 by default, up to 30x30); a
 * combo sudoku is several 9x9 boards whose shared rooms are one box unit and whose
 * shared cells sit in every overlapping board's row and column.
 */
export type UnitKind = "row" | "col" | "box";

export interface Geometry {
  /** Number of cells; cell ids are 0..size-1. */
  size: number;
  /** Units in the order the ladder scans them. Each holds `digits` cell ids. */
  units: number[][];
  /** Digits run 1..digits (9 for a standard board, room width x height in general). */
  digits: number;
  kinds: UnitKind[];
  /** Per cell, the indices of the units containing it. */
  cellUnits: number[][];
  /** Per cell, every other cell sharing a unit with it. */
  peers: number[][];
  /** The client key of a cell, "col,row". */
  key(id: number): string;
  /** Human label for a cell, e.g. "R4C4". */
  cellLabel(id: number): string;
  /** Human label for a unit, e.g. "row 3" or "board 2 box 5". */
  unitLabel(u: number): string;
}

/** Fill in `cellUnits` and `peers` from units. */
export function geometry(
  size: number,
  units: number[][],
  kinds: UnitKind[],
  key: (id: number) => string,
  cellLabel: (id: number) => string,
  unitLabel: (u: number) => string
): Geometry {
  const cellUnits: number[][] = Array.from({ length: size }, () => []);
  const peerSets = Array.from({ length: size }, () => new Set<number>());
  units.forEach((unit, u) => {
    for (const id of unit) {
      cellUnits[id].push(u);
      for (const other of unit) if (other !== id) peerSets[id].add(other);
    }
  });
  const digits = units[0]?.length ?? 9;
  return { size, units, digits, kinds, cellUnits, peers: peerSets.map((s) => [...s]), key, cellLabel, unitLabel };
}

/**
 * A read-only candidate board: each cell's digit (0 = empty) and, for each empty cell,
 * the digits its peers leave legal. Reasons from committed digits only; the player's
 * pencil marks are ignored.
 */
export class UnitBoard {
  constructor(
    readonly geo: Geometry,
    /** values[id] = 1..digits for a filled cell, 0 for empty. */
    readonly values: number[],
    /** candidates[id] = sorted legal digits for an empty cell; [] for a filled cell. */
    readonly candidates: number[][]
  ) {}

  static build(geo: Geometry, values: number[]): UnitBoard {
    const candidates = values.map((v, id) => {
      if (v !== 0) return [];
      const taken = new Set<number>();
      for (const peer of geo.peers[id]) if (values[peer] !== 0) taken.add(values[peer]);
      const legal: number[] = [];
      for (let d = 1; d <= geo.digits; d++) if (!taken.has(d)) legal.push(d);
      return legal;
    });
    return new UnitBoard(geo, values, candidates);
  }

  isEmpty(id: number): boolean {
    return this.values[id] === 0;
  }

  /** A copy with `eliminations` struck from the candidates (values unchanged). */
  withEliminations(eliminations: { cell: number; digits: number[] }[]): UnitBoard {
    const candidates = this.candidates.map((c) => c.slice());
    for (const { cell, digits } of eliminations) {
      candidates[cell] = candidates[cell].filter((d) => !digits.includes(d));
    }
    return new UnitBoard(this.geo, this.values, candidates);
  }
}
