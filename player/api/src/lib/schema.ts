import Ajv, { ValidateFunction } from "ajv";
import sudokuSchema from "../../../../schemas/canon/sudoku.json";
import comboSudokuSchema from "../../../../schemas/canon/combo-sudoku.json";
import nurimazeSchema from "../../../../schemas/canon/nurimaze.json";
import doubleChocoSchema from "../../../../schemas/canon/double-choco.json";
import slitherlinkSchema from "../../../../schemas/canon/slitherlink.json";
import nonogramSchema from "../../../../schemas/canon/nonogram.json";
import masyuSchema from "../../../../schemas/canon/masyu.json";
import pencilsSchema from "../../../../schemas/canon/pencils.json";

const ajv = new Ajv();

const validators: Record<number, ValidateFunction> = {
  1: ajv.compile(sudokuSchema),
  2: ajv.compile(comboSudokuSchema),
  3: ajv.compile(nurimazeSchema),
  4: ajv.compile(doubleChocoSchema),
  5: ajv.compile(slitherlinkSchema),
  6: ajv.compile(nonogramSchema),
  7: ajv.compile(masyuSchema),
  8: ajv.compile(pencilsSchema),
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
