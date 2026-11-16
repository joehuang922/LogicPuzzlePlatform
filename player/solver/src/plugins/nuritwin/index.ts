import { SolverPlugin } from "../../types";
import { NuritwinModel, NuritwinCanon } from "./model";

/**
 * Nuritwin (type 9). The solution is the shaded grid (1 shaded, 0 not), stored in the
 * NuritwinAnswer shape { states }.
 */
export const nuritwinPlugin: SolverPlugin<NuritwinCanon> = {
  puzzleType: 9,
  buildModel: (canon) => NuritwinModel.fromCanon(canon),
  serializeSolution: (states) => ({ states }),
};

export type { NuritwinCanon };
export { NuritwinModel };
