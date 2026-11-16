import { SolverPlugin } from "../../types";
import { NorinoriModel, NorinoriCanon } from "./model";

/**
 * Norinori (type 23). The solution is the shaded grid (1 shaded, 0 not), stored in the
 * NorinoriAnswer shape { states }.
 */
export const norinoriPlugin: SolverPlugin<NorinoriCanon> = {
  puzzleType: 23,
  buildModel: (canon) => NorinoriModel.fromCanon(canon),
  serializeSolution: (states) => ({ states }),
};

export type { NorinoriCanon };
export { NorinoriModel };
