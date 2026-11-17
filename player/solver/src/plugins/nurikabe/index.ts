import { SolverPlugin } from "../../types";
import { NurikabeModel, NurikabeCanon } from "./model";

/**
 * Nurikabe (type 24). The solution is the sea grid (1 sea, 0 island), stored in the
 * NurikabeAnswer shape { states }.
 */
export const nurikabePlugin: SolverPlugin<NurikabeCanon> = {
  puzzleType: 24,
  buildModel: (canon) => NurikabeModel.fromCanon(canon),
  serializeSolution: (states) => ({ states }),
};

export type { NurikabeCanon };
export { NurikabeModel };
