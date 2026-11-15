/** BIG / GIANT size pills and the type-first grouping for Home. Mirrors the
 *  Android app's SizeTag.kt and groupTypePuzzlesByCollection. */

export type SizeTag = "BIG" | "GIANT";

interface Sized {
  puzzleType: number;
  width: number | null;
  height: number | null;
  canonRepr: Record<string, unknown>;
}

const SUDOKU = 1;
const COMBO_SUDOKU = 2;
const NONOGRAM = 6;

function tagFor(value: number, big: number, giant: number): SizeTag | null {
  if (value >= giant) return "GIANT";
  if (value >= big) return "BIG";
  return null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * - sudoku: 16x16 and up is BIG, 25x25 and up GIANT;
 * - combo sudoku: 10+ subboards BIG, 20+ GIANT;
 * - nonogram: 3000+ cells BIG, 10000+ GIANT;
 * - every other type: 1000+ cells BIG, 2000+ GIANT.
 */
export function sizeTag(p: Sized): SizeTag | null {
  const cells = (p.width ?? 0) * (p.height ?? 0);
  switch (p.puzzleType) {
    case SUDOKU: {
      const side = Math.max(p.width ?? 0, p.height ?? 0) || arrayLength(p.canonRepr?.hints);
      return tagFor(side, 16, 25);
    }
    case COMBO_SUDOKU:
      return tagFor(arrayLength(p.canonRepr?.subboards), 10, 20);
    case NONOGRAM:
      return tagFor(cells, 3000, 10000);
    default:
      return tagFor(cells, 1000, 2000);
  }
}

export interface TypeCollectionGroup<P> {
  collectionName: string;
  puzzles: P[];
}

interface Groupable {
  title: string | null;
  srcCollectionName: string | null;
}

/**
 * One type's puzzles grouped by collection: collections by name (Uncategorized
 * last), puzzles by title within each, both case-insensitive.
 */
export function groupByCollection<P extends Groupable>(puzzles: P[]): TypeCollectionGroup<P>[] {
  const groups = new Map<string | null, P[]>();
  for (const p of puzzles) {
    const key = p.srcCollectionName ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const lower = (s: string | null) => (s ?? "").toLowerCase();
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return lower(a).localeCompare(lower(b));
    })
    .map(([name, items]) => ({
      collectionName: name ?? "Uncategorized",
      puzzles: [...items].sort((a, b) => lower(a.title).localeCompare(lower(b.title))),
    }));
}
