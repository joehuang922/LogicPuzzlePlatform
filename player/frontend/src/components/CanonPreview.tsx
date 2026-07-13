import SudokuBoard from "./SudokuBoard";
import ComboSudokuBoard from "./ComboSudokuBoard";
import NurimazeBoard from "./NurimazeBoard";
import DoubleChocoBoard from "./DoubleChocoBoard";
import SlitherlinkBoard from "./SlitherlinkBoard";
import NonogramBoard from "./NonogramBoard";
import { NurimazeCanon, DoubleChocoCanon, SlitherlinkCanon, NonogramCanon } from "../types/canon";

export default function CanonPreview({ puzzleType, canonRepr }: { puzzleType: number; canonRepr: string }) {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(canonRepr);
  } catch {
    return null;
  }

  if (puzzleType === 1 && parsed.hints) {
    return <SudokuBoard hints={parsed.hints as number[][]} />;
  }
  if (puzzleType === 2 && parsed.subboards) {
    return <ComboSudokuBoard subboards={parsed.subboards as { x: number; y: number; hints: number[][] }[]} />;
  }
  if (puzzleType === 3 && parsed.cells && parsed.grids) {
    return <NurimazeBoard canon={parsed as unknown as NurimazeCanon} readonly />;
  }
  if (puzzleType === 4 && parsed.cells) {
    return <DoubleChocoBoard canon={parsed as unknown as DoubleChocoCanon} readonly />;
  }
  if (puzzleType === 5 && parsed.cells) {
    return <SlitherlinkBoard canon={parsed as unknown as SlitherlinkCanon} readonly />;
  }
  if (puzzleType === 6 && parsed.rowClues && parsed.colClues) {
    return <NonogramBoard canon={parsed as unknown as NonogramCanon} readonly />;
  }
  return <p style={{ color: "#666", fontSize: "0.85rem" }}>No preview available for this puzzle type.</p>;
}
