import { AnswerExtractor } from "../types/puzzle";
import { lRingExtractor } from "./lRing";

/** Perfect L-Ring (type 42) stores its loop exactly as L-Ring does: {edges: {h, v}}. */
export const perfectLRingExtractor: AnswerExtractor = {
  puzzleType: 42,
  extract: lRingExtractor.extract,
};
