import { SolverPlugin } from "../../types";
import { RippleEffectModel, RippleEffectCanon } from "./model";

/**
 * Ripple Effect (type 25). The solution is the full number grid, stored in the
 * RippleEffectAnswer shape { numbers }.
 */
export const rippleEffectPlugin: SolverPlugin<RippleEffectCanon> = {
  puzzleType: 25,
  buildModel: (canon) => RippleEffectModel.fromCanon(canon),
  serializeSolution: (numbers) => ({ numbers }),
};

export type { RippleEffectCanon };
export { RippleEffectModel };
