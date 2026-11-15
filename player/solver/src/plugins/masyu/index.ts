import { SolverPlugin } from "../../types";
import { MasyuModel, MasyuCanon, MasyuEdges } from "./model";

/**
 * Masyu (type 7). solution_repr mirrors the MasyuAnswer shape { edges: { h, v } };
 * solution() already returns the two edge grids, so this just wraps them.
 */
export const masyuPlugin: SolverPlugin<MasyuCanon, unknown, MasyuEdges> = {
  puzzleType: 7,
  buildModel: (canon) => MasyuModel.fromCanon(canon),
  serializeSolution: (edges) => ({ edges }),
};

export type { MasyuCanon, MasyuEdges };
export { MasyuModel };
