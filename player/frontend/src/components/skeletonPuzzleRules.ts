/**
 * Skeleton Puzzle (type 35) rules, shared by the board, editor, extractor, progress and
 * tests.
 *
 * Cells: 1 = a cell, 0 = not a cell. A slot is a maximal across or down run of 2+ cells;
 * slots are numbered across first in reading order, then down in reading order, from the
 * canon alone. The player places whole words: userValues "p:<slot>" -> word index + 1.
 * Small kana are written full-size and words compare after that normalisation.
 */
import { SkeletonPuzzleCanon, SkeletonPuzzlePlacement } from "../types/canon";

export type Dir = "across" | "down";

export interface Slot {
  index: number;
  r: number;
  c: number;
  dir: Dir;
  length: number;
  /** The slot's cells in reading order, as [r, c]. */
  cells: [number, number][];
}

/** Kana a word may hold: hiragana, katakana (small ones included), ー and iteration marks. Mirrors the API. */
export const KANA = /^[ぁ-ゖゝゞァ-ヺー-ヾ]+$/;

const SMALL_TO_LARGE: Record<string, string> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", っ: "つ", ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ", ゕ: "か", ゖ: "け",
  ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ", ッ: "ツ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ヮ: "ワ", ヵ: "カ", ヶ: "ケ",
};

/** The word's letters as written on the board: small kana full-size. */
export function boardLetters(word: string): string[] {
  return [...word].map((ch) => SMALL_TO_LARGE[ch] ?? ch);
}

export function isCell(cells: number[][], r: number, c: number): boolean {
  return cells[r]?.[c] === 1;
}

export function findSlots(cells: number[][]): Slot[] {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const slots: Slot[] = [];
  const push = (r: number, c: number, dir: Dir, length: number) => {
    if (length < 2) return;
    const run: [number, number][] = Array.from({ length }, (_, i) => (dir === "across" ? [r, c + i] : [r + i, c]));
    slots.push({ index: 0, r, c, dir, length, cells: run });
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isCell(cells, r, c) || isCell(cells, r, c - 1)) continue;
      let len = 0;
      while (isCell(cells, r, c + len)) len++;
      push(r, c, "across", len);
    }
  }
  const down: Slot[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isCell(cells, r, c) || isCell(cells, r - 1, c)) continue;
      let len = 0;
      while (isCell(cells, r + len, c)) len++;
      if (len >= 2) {
        down.push({ index: 0, r, c, dir: "down", length: len, cells: Array.from({ length: len }, (_, i) => [r + i, c]) });
      }
    }
  }
  return [...slots, ...down].map((s, index) => ({ ...s, index }));
}

/** Slots through (r, c), across first. */
export function slotsAt(slots: Slot[], r: number, c: number): Slot[] {
  return slots.filter((s) => s.cells.some(([sr, sc]) => sr === r && sc === c));
}

/** slot index -> word index, from userValues "p:<slot>" -> word index + 1. */
export function placementsFromValues(values: Record<string, number>, slotCount: number, wordCount: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const [key, v] of Object.entries(values)) {
    if (!key.startsWith("p:")) continue;
    const slot = Number(key.slice(2));
    const word = v - 1;
    if (Number.isInteger(slot) && slot >= 0 && slot < slotCount && word >= 0 && word < wordCount) out.set(slot, word);
  }
  return out;
}

/**
 * The letter in each cell, "" where no placed word covers it. A cell covered by two
 * words that disagree (only possible from a hand-edited answer) holds the across word's.
 */
export function boardGrid(canon: SkeletonPuzzleCanon, slots: Slot[], placed: Map<number, number>): string[][] {
  const grid = canon.cells.map((row) => row.map(() => ""));
  for (const slot of [...slots].reverse()) {
    const w = placed.get(slot.index);
    if (w === undefined) continue;
    const letters = boardLetters(canon.words[w].word);
    slot.cells.forEach(([r, c], i) => {
      grid[r][c] = letters[i] ?? "";
    });
  }
  return grid;
}

/** Words that could go in [slot]: its length, unused elsewhere, agreeing with letters already there. */
export function candidates(canon: SkeletonPuzzleCanon, slots: Slot[], placed: Map<number, number>, slot: Slot): number[] {
  const others = new Map(placed);
  others.delete(slot.index);
  const used = new Set(others.values());
  const grid = boardGrid(canon, slots, others);
  return canon.words.flatMap((w, i) => {
    if (used.has(i)) return [];
    const letters = boardLetters(w.word);
    if (letters.length !== slot.length) return [];
    const fits = slot.cells.every(([r, c], k) => grid[r][c] === "" || grid[r][c] === letters[k]);
    return fits ? [i] : [];
  });
}

export function filledCells(canon: SkeletonPuzzleCanon, slots: Slot[], placed: Map<number, number>): number {
  return boardGrid(canon, slots, placed).flat().filter((ch) => ch !== "").length;
}

export function countCells(cells: number[][]): number {
  return cells.flat().filter((v) => v === 1).length;
}

/** Every word placed once, every slot filled, and crossing words agree. */
export function isSolved(canon: SkeletonPuzzleCanon, slots: Slot[], placed: Map<number, number>): boolean {
  if (slots.length === 0 || placed.size !== slots.length || canon.words.length !== slots.length) return false;
  if (new Set(placed.values()).size !== placed.size) return false;
  const seen = new Map<string, string>();
  for (const slot of slots) {
    const w = placed.get(slot.index);
    if (w === undefined) return false;
    const letters = boardLetters(canon.words[w].word);
    if (letters.length !== slot.length) return false;
    for (let k = 0; k < slot.length; k++) {
      const key = slot.cells[k].join(",");
      const prev = seen.get(key);
      if (prev !== undefined && prev !== letters[k]) return false;
      seen.set(key, letters[k]);
    }
  }
  return true;
}

export function placementsToAnswer(slots: Slot[], placed: Map<number, number>): SkeletonPuzzlePlacement[] {
  return slots.flatMap((s) => {
    const w = placed.get(s.index);
    return w === undefined ? [] : [{ word: w, r: s.r, c: s.c, dir: s.dir }];
  });
}

/** Format problems: block create/save (the API's semanticChecks rejects the same). */
export function formatProblems(canon: SkeletonPuzzleCanon): string[] {
  const problems: string[] = [];
  const slots = findSlots(canon.cells);
  const slotLengths = new Map<number, number>();
  for (const s of slots) slotLengths.set(s.length, (slotLengths.get(s.length) ?? 0) + 1);
  const wordLengths = new Map<number, number>();
  canon.words.forEach(({ word }, i) => {
    if (!KANA.test(word)) problems.push(`Word ${i + 1} "${word}" must be kana (and ー) only`);
    const len = [...word].length;
    if (len < 2) problems.push(`Word ${i + 1} "${word}" is under 2 letters`);
    wordLengths.set(len, (wordLengths.get(len) ?? 0) + 1);
  });
  const lengths = [...new Set([...slotLengths.keys(), ...wordLengths.keys()])].sort((a, b) => a - b);
  for (const len of lengths) {
    const s = slotLengths.get(len) ?? 0;
    const w = wordLengths.get(len) ?? 0;
    if (s !== w) problems.push(`${s} slot${s === 1 ? "" : "s"} of length ${len} but ${w} word${w === 1 ? "" : "s"} of ${len} letter${len === 1 ? "" : "s"}`);
  }
  for (const m of canon.marks ?? []) {
    if (!isCell(canon.cells, m.r, m.c)) problems.push(`Mark ${m.label} at R${m.r + 1}C${m.c + 1} is not on a cell`);
  }
  return problems;
}

/** Overridable misread warnings: cells in no slot. */
export function warnings(canon: SkeletonPuzzleCanon): string[] {
  const slots = findSlots(canon.cells);
  const covered = new Set(slots.flatMap((s) => s.cells.map(([r, c]) => `${r},${c}`)));
  const out: string[] = [];
  canon.cells.forEach((row, r) => row.forEach((v, c) => {
    if (v === 1 && !covered.has(`${r},${c}`)) out.push(`R${r + 1}C${c + 1} is a cell in no slot`);
  }));
  return out;
}

/** Parse the editor's word text: one word per line, optional "(hint)" (full- or half-width). */
export function parseWordLines(text: string): { word: string; hint?: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const m = line.match(/^(.*?)\s*[（(](.*)[)）]\s*$/);
      if (!m) return { word: line };
      return m[2].trim() ? { word: m[1].trim(), hint: m[2].trim() } : { word: m[1].trim() };
    });
}

export function wordLines(words: { word: string; hint?: string }[]): string {
  return words.map((w) => (w.hint ? `${w.word} (${w.hint})` : w.word)).join("\n");
}
