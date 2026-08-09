import Ajv, { ValidateFunction } from "ajv";
import sudokuSchema from "../../../../schemas/canon/sudoku.json";
import comboSudokuSchema from "../../../../schemas/canon/combo-sudoku.json";
import nurimazeSchema from "../../../../schemas/canon/nurimaze.json";
import doubleChocoSchema from "../../../../schemas/canon/double-choco.json";
import slitherlinkSchema from "../../../../schemas/canon/slitherlink.json";
import nonogramSchema from "../../../../schemas/canon/nonogram.json";
import masyuSchema from "../../../../schemas/canon/masyu.json";
import pencilsSchema from "../../../../schemas/canon/pencils.json";
import nuritwinSchema from "../../../../schemas/canon/nuritwin.json";
import slalomSchema from "../../../../schemas/canon/slalom.json";
import shakashakaSchema from "../../../../schemas/canon/shakashaka.json";
import kakuroSchema from "../../../../schemas/canon/kakuro.json";
import yajilinSchema from "../../../../schemas/canon/yajilin.json";
import fillominoSchema from "../../../../schemas/canon/fillomino.json";
import litsSchema from "../../../../schemas/canon/lits.json";
import chocoBananaSchema from "../../../../schemas/canon/choco-banana.json";
import numberLinkSchema from "../../../../schemas/canon/number-link.json";
import akariSchema from "../../../../schemas/canon/akari.json";
import hellGolfSchema from "../../../../schemas/canon/hell-golf.json";
import tentaishowSchema from "../../../../schemas/canon/tentaishow.json";
import heyawakeSchema from "../../../../schemas/canon/heyawake.json";

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
  9: ajv.compile(nuritwinSchema),
  10: ajv.compile(slalomSchema),
  11: ajv.compile(shakashakaSchema),
  12: ajv.compile(kakuroSchema),
  13: ajv.compile(yajilinSchema),
  14: ajv.compile(fillominoSchema),
  15: ajv.compile(litsSchema),
  16: ajv.compile(chocoBananaSchema),
  17: ajv.compile(numberLinkSchema),
  18: ajv.compile(akariSchema),
  19: ajv.compile(hellGolfSchema),
  20: ajv.compile(tentaishowSchema),
  21: ajv.compile(heyawakeSchema),
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
