import { PuzzleDefinition } from "../types/puzzle";
import { HellGolfCanon } from "../types/canon";
import { ProgressCalculator } from "./index";

export const computeHellGolfProgress: ProgressCalculator = {
  puzzleType: 19,

  compute(puzzle: PuzzleDefinition, userValues: Record<string, number>): number {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HellGolfCanon;

    const cols = canonRepr.lakes[0].length;
    const totalBalls = canonRepr.balls.length;
    if (totalBalls === 0) return 0;

    const goalSet = new Set(canonRepr.goals.map(([r, c]) => `${r},${c}`));

    // Recover the last stop of each ball's trail from `t:<ballIdx>:<stepIdx>`
    // keys (encoded cell = r*cols + c + 1). A ball counts as done once its
    // final stop is a goal cell.
    const lastStep: Map<number, number> = new Map();
    const lastCell: Map<number, [number, number]> = new Map();
    for (const [key, val] of Object.entries(userValues)) {
      if (!key.startsWith("t:") || val === 0) continue;
      const [ballStr, stepStr] = key.slice(2).split(":");
      const ballIdx = Number(ballStr);
      const stepIdx = Number(stepStr);
      if (stepIdx >= (lastStep.get(ballIdx) ?? 0)) {
        lastStep.set(ballIdx, stepIdx);
        const encoded = val - 1;
        lastCell.set(ballIdx, [Math.floor(encoded / cols), encoded % cols]);
      }
    }

    let onGoal = 0;
    for (let i = 0; i < totalBalls; i++) {
      const cell = lastCell.get(i);
      if (cell && goalSet.has(`${cell[0]},${cell[1]}`)) onGoal++;
    }

    return (onGoal / totalBalls) * 100;
  },
};
