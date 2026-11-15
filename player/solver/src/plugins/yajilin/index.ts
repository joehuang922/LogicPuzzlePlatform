import { SolverPlugin } from "../../types";
import { YajilinModel, YajilinCanon, YajilinSolution } from "./model";

/**
 * Yajilin (type 13). solution() already returns the YajilinAnswer shape
 * { blacks, edges: { h, v } }, which is stored as solution_repr as is.
 */
export const yajilinPlugin: SolverPlugin<YajilinCanon, unknown, YajilinSolution> = {
  puzzleType: 13,
  buildModel: (canon) => YajilinModel.fromCanon(canon),
  serializeSolution: (solution) => solution,
};

export type { YajilinCanon, YajilinSolution };
export { YajilinModel };
