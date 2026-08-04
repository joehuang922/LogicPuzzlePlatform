import { AnswerExtractor, PuzzleDefinition } from "../types/puzzle";
import { sudokuExtractor } from "./sudoku";
import { comboSudokuExtractor } from "./comboSudoku";
import { nurimazeExtractor } from "./nurimaze";
import { doubleChocoExtractor } from "./doubleChoco";
import { slitherlinkExtractor } from "./slitherlink";
import { nonogramExtractor } from "./nonogram";
import { masyuExtractor } from "./masyu";
import { pencilsExtractor } from "./pencils";
import { nuritwinExtractor } from "./nuritwin";
import { slalomExtractor } from "./slalom";
import { shakashakaExtractor } from "./shakashaka";
import { kakuroExtractor } from "./kakuro";
import { yajilinExtractor } from "./yajilin";
import { fillominoExtractor } from "./fillomino";
import { litsExtractor } from "./lits";
import { chocoBananaExtractor } from "./chocoBanana";

const extractorRegistry = new Map<number, AnswerExtractor>();

function registerExtractor(extractor: AnswerExtractor) {
  extractorRegistry.set(extractor.puzzleType, extractor);
}

registerExtractor(sudokuExtractor);
registerExtractor(comboSudokuExtractor);
registerExtractor(nurimazeExtractor);
registerExtractor(doubleChocoExtractor);
registerExtractor(slitherlinkExtractor);
registerExtractor(nonogramExtractor);
registerExtractor(masyuExtractor);
registerExtractor(pencilsExtractor);
registerExtractor(nuritwinExtractor);
registerExtractor(slalomExtractor);
registerExtractor(shakashakaExtractor);
registerExtractor(kakuroExtractor);
registerExtractor(yajilinExtractor);
registerExtractor(fillominoExtractor);
registerExtractor(litsExtractor);
registerExtractor(chocoBananaExtractor);

export function getExtractor(puzzleType: number): AnswerExtractor | undefined {
  return extractorRegistry.get(puzzleType);
}

export function extractAnswer(
  puzzle: PuzzleDefinition,
  userValues: Record<string, number>
): Record<string, unknown> {
  const extractor = extractorRegistry.get(puzzle.puzzleType);
  if (!extractor) {
    throw new Error(`No answer extractor for puzzle type ${puzzle.puzzleType}`);
  }
  return extractor.extract(puzzle, userValues);
}
