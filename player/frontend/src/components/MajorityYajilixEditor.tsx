import { MajorityYajilixCanon } from "../types/canon";
import { LoopClueEditor, LoopClueEditorConfig } from "./YajilixEditor";
import { majorityYajilixFormatProblems, majorityYajilixWarnings } from "./majorityYajilixRules";

interface MajorityYajilixEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

const CONFIG: LoopClueEditorConfig = {
  name: "majority yajilix",
  withNumbers: false,
  formatProblems: majorityYajilixFormatProblems,
  warnings: (canon) => majorityYajilixWarnings(canon as MajorityYajilixCanon),
};

/** Yajilix's editor without numbers: letter and arrow per clue. */
export default function MajorityYajilixEditor({ initialJson, onChange }: MajorityYajilixEditorProps) {
  return <LoopClueEditor initialJson={initialJson} onChange={onChange} config={CONFIG} />;
}
