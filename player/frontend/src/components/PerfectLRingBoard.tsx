import { PerfectLRingCanon, PerfectLRingAnswer } from "../types/canon";
import LRingBoard from "./LRingBoard";

interface PerfectLRingBoardProps {
  canon: PerfectLRingCanon;
  initialAnswer?: PerfectLRingAnswer | null;
  onAnswerChange?: (answer: PerfectLRingAnswer) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

/**
 * Perfect L-Ring (type 42): L-Ring's board with the corner rule on. Wherever the loop
 * turns in a cell without an arrow, its two arms may not differ by exactly one.
 */
export default function PerfectLRingBoard(props: PerfectLRingBoardProps) {
  return <LRingBoard {...props} perfect />;
}
