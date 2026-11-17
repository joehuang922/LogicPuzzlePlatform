import { SolverPlugin } from "../../types";
import { HitoriModel, HitoriCanon } from "./model";

/**
 * Hitori (type 26). The solution is the shaded grid (1 shaded, 0 not), stored in the
 * HitoriAnswer shape { states }.
 */
export const hitoriPlugin: SolverPlugin<HitoriCanon> = {
  puzzleType: 26,
  buildModel: (canon) => HitoriModel.fromCanon(canon),
  serializeSolution: (states) => ({ states }),
};

export type { HitoriCanon };
export { HitoriModel };
