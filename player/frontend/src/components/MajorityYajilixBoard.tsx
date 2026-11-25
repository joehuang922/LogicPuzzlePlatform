import { MajorityYajilixCanon } from "../types/canon";
import { LoopClueBoard } from "./YajilixBoard";
import { brokenClues, validateMajorityYajilix } from "./majorityYajilixRules";

interface MajorityYajilixBoardProps {
  canon: MajorityYajilixCanon;
  initialUserValues?: Record<string, number>;
  onValuesChange?: (values: Record<string, number>) => void;
  onComplete?: () => void;
  readonly?: boolean;
  liveValidate?: boolean;
}

/** Yajilix's board with letter-only clues and the majority rule. */
export default function MajorityYajilixBoard(props: MajorityYajilixBoardProps) {
  return <LoopClueBoard {...props} validate={validateMajorityYajilix} findBroken={brokenClues} />;
}
