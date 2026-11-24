import { SolverPlugin } from "../../types";
import { IrregularNonogramModel, IrregularNonogramCanon } from "./model";

/**
 * Irregular Nonogram (type 45): Nonogram's line solver, propagation, probing and search
 * over the board's clued segments. Registered for the gate only (no hint board yet).
 */
export const irregularNonogramPlugin: SolverPlugin<IrregularNonogramCanon> = {
  puzzleType: 45,
  buildModel: (canon) => IrregularNonogramModel.fromCanon(canon),
  // solution_repr mirrors the answer shape { cells }.
  serializeSolution: (grid) => ({ cells: grid }),
};

export type { IrregularNonogramCanon };
export { IrregularNonogramModel };
