import { SolverPlugin } from "../../types";
import { PencilsModel, PencilsCanon, PencilsSolution } from "./model";

/**
 * Pencils (type 8). solution() already returns the PencilsAnswer shape
 * { trails, heads, edges }: trail segments, the heads the player places (given heads stay
 * in the canon), and walls around every body.
 */
export const pencilsPlugin: SolverPlugin<PencilsCanon, unknown, PencilsSolution> = {
  puzzleType: 8,
  buildModel: (canon) => PencilsModel.fromCanon(canon),
  serializeSolution: (solution) => solution,
};

export type { PencilsCanon, PencilsSolution };
export { PencilsModel };
