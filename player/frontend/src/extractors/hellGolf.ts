import { PuzzleDefinition, AnswerExtractor } from "../types/puzzle";
import { HellGolfCanon } from "../types/canon";

export const hellGolfExtractor: AnswerExtractor = {
  puzzleType: 19,

  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>) {
    const canonRepr = (typeof puzzle.canonRepr === "string"
      ? JSON.parse(puzzle.canonRepr)
      : puzzle.canonRepr) as HellGolfCanon;

    const cols = canonRepr.lakes[0].length;

    // Each trail starts at its ball's origin; further stops are recovered from
    // `t:<ballIdx>:<stepIdx>` keys (encoded cell = r*cols + c + 1).
    const stepsByBall: Map<number, Map<number, [number, number]>> = new Map();
    for (const [key, val] of Object.entries(userValues)) {
      if (!key.startsWith("t:") || val === 0) continue;
      const [ballStr, stepStr] = key.slice(2).split(":");
      const ballIdx = Number(ballStr);
      const stepIdx = Number(stepStr);
      const encoded = val - 1;
      const r = Math.floor(encoded / cols);
      const c = encoded % cols;
      if (!stepsByBall.has(ballIdx)) stepsByBall.set(ballIdx, new Map());
      stepsByBall.get(ballIdx)!.set(stepIdx, [r, c]);
    }

    const trails = canonRepr.balls.map((ball, i) => {
      const path: number[][] = [[ball.r, ball.c]];
      const steps = stepsByBall.get(i);
      if (steps) {
        const ordered = [...steps.keys()].sort((a, b) => a - b);
        for (const step of ordered) path.push(steps.get(step)!);
      }
      return { path };
    });

    return { trails };
  },
};
