import { ProgressCalculator } from "./index";
import { computeLRingProgress } from "./lRing";

/**
 * Perfect L-Ring (type 42): satisfied arrows / all arrows, as in L-Ring. The corner rule
 * counts only for completion and Errors.
 */
export const computePerfectLRingProgress: ProgressCalculator = {
  puzzleType: 42,
  compute: computeLRingProgress.compute,
};
