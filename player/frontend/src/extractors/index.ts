import { AnswerExtractor, PuzzleDefinition } from "../types/puzzle";
import { sudokuExtractor } from "./sudoku";
import { comboSudokuExtractor } from "./comboSudoku";
import { nurimazeExtractor } from "./nurimaze";

const extractorRegistry = new Map<number, AnswerExtractor>();

function registerExtractor(extractor: AnswerExtractor) {
  extractorRegistry.set(extractor.puzzleType, extractor);
}

registerExtractor(sudokuExtractor);
registerExtractor(comboSudokuExtractor);
registerExtractor(nurimazeExtractor);

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
