import { SolverPlugin } from "../../types";
import { NonogramModel, NonogramCanon, solveLine } from "./model";
import { NonogramBoard } from "./board";
import { NONOGRAM_TECHNIQUES, revealStep } from "./techniques";

export const nonogramPlugin: SolverPlugin<NonogramCanon, NonogramBoard> = {
  puzzleType: 6,
  buildModel: (canon) => NonogramModel.fromCanon(canon),
  // solution_repr mirrors the Nonogram answer shape { cells }: a rows x cols grid of
  // 0/1 where 1 is a filled cell. solution() already returns that grid.
  serializeSolution: (grid) => ({ cells: grid }),
  buildBoard: (canon, values) => NonogramBoard.build(canon, values),
  techniques: NONOGRAM_TECHNIQUES,
};

export type { NonogramCanon };
export { NonogramModel, NonogramBoard, solveLine, revealStep as nonogramRevealStep };
