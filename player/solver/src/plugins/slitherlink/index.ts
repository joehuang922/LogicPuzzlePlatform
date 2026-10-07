import { SolverPlugin } from "../../types";
import { SlitherlinkModel, SlitherlinkCanon, SlitherlinkEdges } from "./model";

export const slitherlinkPlugin: SolverPlugin<SlitherlinkCanon, unknown, SlitherlinkEdges> = {
  puzzleType: 5,
  buildModel: (canon) => SlitherlinkModel.fromCanon(canon),
  // solution_repr mirrors the SlitherlinkAnswer shape { edges: { h, v } }. solution()
  // already returns the two edge grids, so this just wraps them.
  serializeSolution: (edges) => ({ edges }),
};

export type { SlitherlinkCanon, SlitherlinkEdges };
export { SlitherlinkModel };
