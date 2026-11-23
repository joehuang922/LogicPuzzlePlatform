import LRingEditor from "./LRingEditor";

interface PerfectLRingEditorProps {
  initialJson: string;
  onChange: (json: string) => void;
}

/**
 * Perfect L-Ring (type 42) has L-Ring's question, so it has L-Ring's editor: click a cell
 * to cycle empty -> up -> right -> down -> left. Every rectangular grid is a valid layout;
 * "no arrows" and arrows pointing off the board are overridable warnings.
 */
export default function PerfectLRingEditor({ initialJson, onChange }: PerfectLRingEditorProps) {
  return <LRingEditor initialJson={initialJson} onChange={onChange} label="Perfect L-Ring" />;
}
