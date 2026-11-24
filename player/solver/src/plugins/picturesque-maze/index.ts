import { SolverPlugin } from "../../types";
import { PicturesqueMazeModel, PicturesqueMazeCanon, PicturesqueMazeEdges } from "./model";

/**
 * Picturesque Maze (type 44): the unique shortest route from the entrance to the exit.
 * solution_repr mirrors the PicturesqueMazeAnswer shape { edges: { h, v } }.
 */
export const picturesqueMazePlugin: SolverPlugin<PicturesqueMazeCanon, unknown, PicturesqueMazeEdges> = {
  puzzleType: 44,
  buildModel: (canon) => PicturesqueMazeModel.fromCanon(canon),
  serializeSolution: (edges) => ({ edges }),
};

export type { PicturesqueMazeCanon, PicturesqueMazeEdges, MazeOpening } from "./model";
export { PicturesqueMazeModel };
