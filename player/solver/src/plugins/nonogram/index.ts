import { SolverPlugin } from "../../types";
import { NonogramModel, NonogramCanon, solveLine } from "./model";

export const nonogramPlugin: SolverPlugin<NonogramCanon> = {
  puzzleType: 6,
  buildModel: (canon) => NonogramModel.fromCanon(canon),
  // solution_repr mirrors the Nonogram answer shape { cells }: a rows x cols grid of
  // 0/1 where 1 is a filled cell. solution() already returns that grid.
  serializeSolution: (grid) => ({ cells: grid }),
};

export type { NonogramCanon };
export { NonogramModel, solveLine };
