import { CellValues } from "../../types";
import { NonogramCanon, Spec, buildSpec, solveLine, UNKNOWN, EMPTY, FILLED } from "./model";

// Client cell states (NonogramAnswer.cells / the "col,row" values map).
export const CLIENT_FILLED = 1;
export const CLIENT_CROSSED = 2;

/**
 * The hint board: the puzzle's lines plus the player's marks, in solver cell states
 * (a filled cell is FILLED, a crossed cell EMPTY, anything else UNKNOWN). Cell ids are
 * the solver convention `row * cols + col`; lines are indexed 0..rows-1 for rows, then
 * rows..rows+cols-1 for columns (see {@link Spec}).
 *
 * Per-line deductions are computed once, lazily, and shared by every technique.
 */
export class NonogramBoard {
  private lineResults: (number[] | null)[] | null = null;

  private constructor(
    readonly spec: Spec,
    readonly state: Int8Array
  ) {}

  static build(canon: NonogramCanon, values: CellValues): NonogramBoard {
    const spec = buildSpec(canon);
    const state = new Int8Array(spec.rows * spec.cols).fill(UNKNOWN);
    for (let r = 0; r < spec.rows; r++) {
      for (let c = 0; c < spec.cols; c++) {
        const v = values[`${c},${r}`];
        if (v === CLIENT_FILLED) state[r * spec.cols + c] = FILLED;
        else if (v === CLIENT_CROSSED) state[r * spec.cols + c] = EMPTY;
      }
    }
    return new NonogramBoard(spec, state);
  }

  get lineCount(): number {
    return this.spec.rows + this.spec.cols;
  }

  /** The line solver's verdict on line `l` from the player's marks: null = contradictory. */
  solvedLine(l: number): number[] | null {
    if (!this.lineResults) {
      this.lineResults = this.spec.lineCells.map((ids, i) =>
        solveLine(
          ids.map((id) => this.state[id]),
          this.spec.blocks[i]
        )
      );
    }
    return this.lineResults[l];
  }

  /** The cells line `l` settles that the player hasn't marked yet, as solver states. */
  deductions(l: number): { cell: number; value: number }[] {
    const solved = this.solvedLine(l);
    if (!solved) return [];
    const out: { cell: number; value: number }[] = [];
    this.spec.lineCells[l].forEach((id, i) => {
      if (this.state[id] === UNKNOWN && solved[i] !== UNKNOWN) out.push({ cell: id, value: solved[i] });
    });
    return out;
  }

  unknownCount(l: number): number {
    return this.spec.lineCells[l].filter((id) => this.state[id] === UNKNOWN).length;
  }

  focusLine(l: number): { axis: "row" | "col"; index: number } {
    return l < this.spec.rows ? { axis: "row", index: l } : { axis: "col", index: l - this.spec.rows };
  }

  /** "Row 3 (clue 2 1)" — 1-based, matching the board's coordinate labels. */
  lineLabel(l: number): string {
    const { rows, blocks } = this.spec;
    const name = l < rows ? `Row ${l + 1}` : `Column ${l - rows + 1}`;
    const clue = blocks[l].length > 0 ? blocks[l].join(" ") : "0";
    return `${name} (clue ${clue})`;
  }

  /** "row 3, column 5" — 1-based. */
  cellLabel(id: number): string {
    const { cols } = this.spec;
    return `row ${Math.floor(id / cols) + 1}, column ${(id % cols) + 1}`;
  }
}

/** A solver cell state as the client's mark: FILLED -> 1 (fill), EMPTY -> 2 (cross). */
export function toClient(value: number): number {
  return value === FILLED ? CLIENT_FILLED : CLIENT_CROSSED;
}
