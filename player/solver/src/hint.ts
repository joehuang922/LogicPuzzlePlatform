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

/**
 * The next *answer* for the player's board: like `nextHint`, but a step that only rules
 * out candidates (locked candidates, naked pair, ...) is applied to a scratch copy of
 * the candidates and the ladder runs again, until a rung places a digit. The returned
 * step is that placement alone, technique "next-answer" (focus on its cell; `depth` is
 * the deepest rung used), so the player is shown where the next digit goes, not the
 * candidate bookkeeping that found it. A single found without eliminations is returned
 * as `nextHint` gives it.
 *
 * Null when the type can't carry eliminations forward (no `withEliminations`) or the
 * ladder runs dry before a placement; the caller falls back to a solution reveal.
 */
export function nextPlacement(puzzleType: number, canon: unknown, values: CellValues): Step | null {
  const plugin = getPlugin(puzzleType);
  if (!plugin || !plugin.buildBoard || !plugin.techniques || !plugin.withEliminations) return null;

  const ladder = [...plugin.techniques].sort((a, b) => a.depth - b.depth);
  let board = plugin.buildBoard(canon, values);
  let depth = 0;
  let eliminated = false;
  // Every elimination step strikes at least one candidate, so this ends; the cap is a
  // backstop against a technique that reports a no-op.
  for (let round = 0; round < 1000; round++) {
    let step: Step | null = null;
    for (const technique of ladder) {
      step = technique.apply(board);
      if (step) break;
    }
    if (!step) return null;
    depth = Math.max(depth, step.depth);
    if (step.placement) {
      if (!eliminated) return step;
      const { cell, value } = step.placement;
      return {
        technique: "next-answer",
        focusCells: [cell],
        placement: step.placement,
        explanation: plugin.describePlacement?.(cell, value) ?? step.explanation,
        depth,
      };
    }
    if (!step.eliminations?.length) return null;
    board = plugin.withEliminations(board, step.eliminations);
    eliminated = true;
  }
  return null;
}
