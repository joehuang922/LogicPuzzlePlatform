import { SolverPlugin } from "../../types";
import { LitsModel, LitsCanon } from "./model";

export const litsPlugin: SolverPlugin<LitsCanon> = {
  puzzleType: 15,
  buildModel: (canon) => LitsModel.fromCanon(canon),
  // solution_repr mirrors the LITS answer shape { shaded }: a rows x cols grid of
  // 0/1 where 1 is a shaded cell. solution() already returns that grid.
  serializeSolution: (grid) => ({ shaded: grid }),
};

export type { LitsCanon };
export { LitsModel };
