/**
 * Title normalizer for a collection's questions. Parsers name questions with a
 * number ("12", "Q12. Name", "第12問"); without leading zeros, title sorting reads
 * 1, 10, 11, ..., 2, 20. A pattern like "Q<number>. <text>" rewrites every
 * numbered title with its number zero-padded to the widest number in the set.
 *
 * A title splits at its first number: what comes before it is dropped (the
 * pattern supplies it), what follows it, past any separator, is the text.
 * Titles with no number are left alone.
 */

export const NUMBER_TOKEN = "<number>";
export const TEXT_TOKEN = "<text>";

export interface ParsedTitle {
  prefix: string;
  number: number;
  digits: string;
  separator: string;
  text: string;
}

const NUMBER_RE = /[0-9０-９]+/;
const SEPARATOR_RE = /^[\s.:：．、。,，\-–—)）]*/;

function toAscii(digits: string): string {
  return digits.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

export function parseTitle(title: string | null): ParsedTitle | null {
  if (!title) return null;
  const m = NUMBER_RE.exec(title);
  if (!m) return null;
  const digits = toAscii(m[0]);
  const rest = title.slice(m.index + m[0].length);
  const separator = SEPARATOR_RE.exec(rest)![0];
  return {
    prefix: title.slice(0, m.index),
    number: parseInt(digits, 10),
    digits,
    separator,
    text: rest.slice(separator.length).trim(),
  };
}

/** A pattern must hold exactly one <number>; <text> is optional. */
export function patternError(pattern: string): string | null {
  const n = pattern.split(NUMBER_TOKEN).length - 1;
  if (n === 0) return `Pattern needs ${NUMBER_TOKEN}`;
  if (n > 1) return `Pattern can hold only one ${NUMBER_TOKEN}`;
  if (pattern.split(TEXT_TOKEN).length - 1 > 1) return `Pattern can hold only one ${TEXT_TOKEN}`;
  return null;
}

/** The pattern most numbered titles already follow, e.g. "Q<number>. <text>". */
export function suggestPattern(titles: (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const t of titles) {
    const p = parseTitle(t);
    if (!p) continue;
    const shape = p.prefix + NUMBER_TOKEN + (p.text ? p.separator + TEXT_TOKEN : "");
    counts.set(shape, (counts.get(shape) ?? 0) + 1);
  }
  let best = NUMBER_TOKEN;
  let bestCount = 0;
  for (const [shape, c] of counts) {
    if (c > bestCount) {
      best = shape;
      bestCount = c;
    }
  }
  return best;
}

export interface TitleItem {
  id: string;
  puzzleType: number;
  title: string | null;
}

export interface TitleChange {
  id: string;
  puzzleType: number;
  oldTitle: string | null;
  newTitle: string | null;
  /** A rename leaves two questions of the same type with the same title. */
  conflict: boolean;
}

/**
 * Apply the pattern to every item. Numbers are padded to the widest number among
 * all numbered titles; when the pattern has no <text>, a title's text is dropped.
 * Items without a number keep their title. Conflicts are checked per puzzle type
 * (different types may share a title) against every final title, renamed or not.
 */
export function normalizeTitles(items: TitleItem[], pattern: string): TitleChange[] {
  const parsed = items.map((it) => parseTitle(it.title));
  const width = Math.max(1, ...parsed.map((p) => (p ? String(p.number).length : 1)));
  const changes = items.map((it, i) => {
    const p = parsed[i];
    let newTitle = it.title;
    if (p) {
      const num = String(p.number).padStart(width, "0");
      newTitle = pattern.replace(NUMBER_TOKEN, num).replace(TEXT_TOKEN, p.text).trim();
    }
    return { id: it.id, puzzleType: it.puzzleType, oldTitle: it.title, newTitle, conflict: false };
  });
  const seen = new Map<string, TitleChange[]>();
  for (const c of changes) {
    if (!c.newTitle) continue;
    const key = `${c.puzzleType}\u0000${c.newTitle}`;
    (seen.get(key) ?? seen.set(key, []).get(key)!).push(c);
  }
  for (const group of seen.values()) {
    // Duplicates the normalizer didn't touch were there before; not its conflict.
    if (group.length > 1 && group.some((c) => c.newTitle !== c.oldTitle)) {
      group.forEach((c) => (c.conflict = true));
    }
  }
  return changes;
}
