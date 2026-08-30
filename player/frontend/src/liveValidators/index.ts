import { PuzzleDefinition } from "../types/puzzle";
import { nonogramLiveValidator } from "./nonogram";
import { masyuLiveValidator } from "./masyu";

// A namespaced annotation key. The namespace ("cell", "clue", "edge", "dot", ...)
// and its encoding are a private contract between a puzzle type's validator and
// its board — the board tests membership for the namespaces it renders and
// ignores the rest. This lets a validator flag not just board cells but clue
// numbers, edges, dots, region borders, etc.
//   e.g. "cell:3,4", "clue:row:5:2", "clue:col:3:0", "edge:h:3,4"
export type AnnotationKey = string;

export interface LiveValidationResult {
  errors: Set<AnnotationKey>;
}

export interface LiveValidator {
  puzzleType: number;
  validate(puzzle: PuzzleDefinition, userValues: Record<string, number>): LiveValidationResult;
}

const registry = new Map<number, LiveValidator>();

function register(validator: LiveValidator) {
  registry.set(validator.puzzleType, validator);
}

register(nonogramLiveValidator);
register(masyuLiveValidator);

const EMPTY: LiveValidationResult = { errors: new Set() };

// Compute the live-validation annotations for a puzzle's current answer.
// Puzzle types without a registered validator are a no-op (no annotations),
// so the feature lights up per type as validators are implemented.
export function computeLiveValidation(
  puzzle: PuzzleDefinition,
  userValues: Record<string, number>
): LiveValidationResult {
  const validator = registry.get(puzzle.puzzleType);
  if (!validator) return EMPTY;
  return validator.validate(puzzle, userValues);
}
