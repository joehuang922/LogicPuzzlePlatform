import { SolverPlugin } from "../../types";
import { KakuroModel, KakuroCanon } from "./model";

export const kakuroPlugin: SolverPlugin<KakuroCanon> = {
  puzzleType: 12,
  buildModel: (canon) => KakuroModel.fromCanon(canon),
  // solution_repr mirrors KakuroAnswer: a rows x cols grid of digits with 0 at clue
  // cells (solution() already fills clue cells with 0).
  serializeSolution: (grid) => ({ values: grid }),
};

export type { KakuroCanon };
export { KakuroModel };
