import { SolverPlugin } from "../../types";
import { HeyawakeModel, HeyawakeCanon } from "./model";

/**
 * Heyawake (type 21). The solution is the shaded grid (1 shaded, 0 not), stored in the
 * HeyawakeAnswer shape { states }.
 */
export const heyawakePlugin: SolverPlugin<HeyawakeCanon> = {
  puzzleType: 21,
  buildModel: (canon) => HeyawakeModel.fromCanon(canon),
  serializeSolution: (states) => ({ states }),
};

export type { HeyawakeCanon };
export { HeyawakeModel };
