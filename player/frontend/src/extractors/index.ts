import { AnswerExtractor, PuzzleDefinition } from "../types/puzzle";
import { sudokuExtractor } from "./sudoku";
import { comboSudokuExtractor } from "./comboSudoku";

const extractorRegistry = new Map<number, AnswerExtractor>();

function registerExtractor(extractor: AnswerExtractor) {
  extractorRegistry.set(extractor.puzzleType, extractor);
}

registerExtractor(sudokuExtractor);
registerExtractor(comboSudokuExtractor);

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
