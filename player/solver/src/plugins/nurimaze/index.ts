import { SolverPlugin } from "../../types";
import { NurimazeModel, NurimazeCanon } from "./model";

/**
 * Nurimaze (type 3). The solution is the answer's `states` grid (1 black, 2 white),
 * which `solution()` already returns.
 */
export const nurimazePlugin: SolverPlugin<NurimazeCanon> = {
  puzzleType: 3,
  buildModel: (canon) => NurimazeModel.fromCanon(canon),
  serializeSolution: (grid) => ({ states: grid }),
};

export type { NurimazeCanon };
export { NurimazeModel };
