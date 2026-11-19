import { SolverPlugin } from "../../types";
import { ShikakuModel, ShikakuCanon, ShikakuSolution } from "./model";

/** Shikaku (type 22). solution() already returns the ShikakuAnswer shape { rects }. */
export const shikakuPlugin: SolverPlugin<ShikakuCanon, unknown, ShikakuSolution> = {
  puzzleType: 22,
  buildModel: (canon) => ShikakuModel.fromCanon(canon),
  serializeSolution: (solution) => solution,
};

export type { ShikakuCanon, ShikakuSolution, ShikakuRect } from "./model";
export { ShikakuModel };
