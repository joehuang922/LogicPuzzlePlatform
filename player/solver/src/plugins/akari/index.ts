import { SolverPlugin } from "../../types";
import { AkariModel, AkariCanon } from "./model";

/**
 * Akari (type 18). The solution is the bulb grid (1 bulb, 0 none; walls 0), stored in the
 * AkariAnswer shape { states }.
 */
export const akariPlugin: SolverPlugin<AkariCanon> = {
  puzzleType: 18,
  buildModel: (canon) => AkariModel.fromCanon(canon),
  serializeSolution: (states) => ({ states }),
};

export type { AkariCanon };
export { AkariModel };
