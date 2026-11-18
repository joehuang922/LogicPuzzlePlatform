import { SolverPlugin } from "../../types";
import { FillominoModel, FillominoCanon, FillominoSolution } from "./model";

/**
 * Fillomino (type 14). solution() already returns the FillominoAnswer shape
 * { numbers, edges }, the walls drawn wherever the numbers change.
 */
export const fillominoPlugin: SolverPlugin<FillominoCanon, unknown, FillominoSolution> = {
  puzzleType: 14,
  buildModel: (canon) => FillominoModel.fromCanon(canon),
  serializeSolution: (solution) => solution,
};

export type { FillominoCanon, FillominoSolution };
export { FillominoModel };
