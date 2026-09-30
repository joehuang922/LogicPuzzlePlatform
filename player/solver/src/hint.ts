import { CellValues, Step } from "./types";
import { getPlugin } from "./registry";

/**
 * Return the shallowest pedagogical hint for the player's current board, or null when
 * no known technique fires (caller falls back to a solution-backed reveal — "give up").
 *
 * Returns null too when the type has no hint support (no plugin, board, or ladder).
 * `canon` must be schema-valid; `values` are the player's committed entries keyed
 * "col,row".
 */
export function nextHint(puzzleType: number, canon: unknown, values: CellValues): Step | null {
  const plugin = getPlugin(puzzleType);
  if (!plugin || !plugin.buildBoard || !plugin.techniques) return null;

  const board = plugin.buildBoard(canon, values);
  // Techniques are authored easiest-first; walk in depth order and return the first hit.
  const ladder = [...plugin.techniques].sort((a, b) => a.depth - b.depth);
  for (const technique of ladder) {
    const step = technique.apply(board);
    if (step) return step;
  }
  return null;
}
