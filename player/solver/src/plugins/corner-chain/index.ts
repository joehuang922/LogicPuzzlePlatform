import { SolverPlugin } from "../../types";
import { CornerChainModel, CornerChainCanon } from "./model";

/**
 * Corner Chain (type 30). The solution is the shaded grid (1 shaded, 0 white), stored in
 * the CornerChainAnswer shape { states }.
 */
export const cornerChainPlugin: SolverPlugin<CornerChainCanon> = {
  puzzleType: 30,
  buildModel: (canon) => CornerChainModel.fromCanon(canon),
  serializeSolution: (states) => ({ states }),
};

export type { CornerChainCanon };
export { CornerChainModel };
