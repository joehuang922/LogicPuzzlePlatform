import { SolverPlugin } from "../../types";
import { ZebraRopeModel, ZebraRopeCanon } from "./model";

/**
 * Zebra Rope (type 36): rope modes (all same / alternating) and circle majority bounds,
 * propagated with failed-literal probing, then search. Registered for the gate only (no
 * hint board yet). The solution is the shaded grid in the answer shape { states }.
 */
export const zebraRopePlugin: SolverPlugin<ZebraRopeCanon> = {
  puzzleType: 36,
  buildModel: (canon) => ZebraRopeModel.fromCanon(canon),
  serializeSolution: (states) => ({ states }),
};

export type { ZebraRopeCanon };
export { ZebraRopeModel };
