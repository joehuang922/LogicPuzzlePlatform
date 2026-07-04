import Ajv, { ValidateFunction } from "ajv";
import sudokuSchema from "../../../../schemas/canon/sudoku.json";
import comboSudokuSchema from "../../../../schemas/canon/combo-sudoku.json";

const ajv = new Ajv();

const validators: Record<number, ValidateFunction> = {
  1: ajv.compile(sudokuSchema),
  2: ajv.compile(comboSudokuSchema),
};

export function validateCanon(puzzleType: number, data: unknown): void {
  const validate = validators[puzzleType];
  if (!validate) {
    throw new Error(`No schema registered for puzzle type ${puzzleType}`);
  }
  if (!validate(data)) {
    const errors = ajv.errorsText(validate.errors);
    throw new Error(`Invalid canonRepr for puzzle type ${puzzleType}: ${errors}`);
  }
}
