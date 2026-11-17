/**
 * Connectivity for shading puzzles whose cells of one colour must form a single
 * orthogonally connected region (Nuritwin's shaded cells, Hitori's unshaded cells).
 *
 * `state[x]` is UNDECIDED (-1) or a colour; `colour` is the one that must connect. Every
 * `colour` cell must reach every other through cells not of the opposite colour, and an
 * undecided cell that is the only link between them (an articulation point with `colour`
 * cells on both sides) must itself be `colour`. Returns null when the cells of `colour`
 * can no longer connect, else the undecided cells to force to `colour`. One iterative
 * Tarjan pass from a `colour` root.
 */
export function connectivityCuts(neighbours: number[][], state: Int8Array, colour: number): number[] | null {
  const n = state.length;
  let total = 0;
  let root = -1;
  for (let x = 0; x < n; x++) {
    if (state[x] === colour) {
      total++;
      if (root < 0) root = x;
    }
  }
  if (total <= 1) return [];

  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const below = new Int32Array(n); // `colour` cells in the DFS subtree
  const parent = new Int32Array(n).fill(-1);
  const iter = new Int32Array(n);
  const stack = new Int32Array(n);
  const cut: number[] = [];
  let sp = 0;
  let time = 0;
  disc[root] = low[root] = time++;
  below[root] = 1;
  stack[sp++] = root;
  while (sp > 0) {
    const x = stack[sp - 1];
    const nb = neighbours[x];
    if (iter[x] < nb.length) {
      const y = nb[iter[x]++];
      if (state[y] !== -1 && state[y] !== colour) continue; // the opposite colour blocks
      if (disc[y] < 0) {
        disc[y] = low[y] = time++;
        below[y] = state[y] === colour ? 1 : 0;
        parent[y] = x;
        stack[sp++] = y;
      } else if (y !== parent[x] && disc[y] < low[x]) {
        low[x] = disc[y];
      }
      continue;
    }
    sp--;
    if (sp > 0) {
      const p = stack[sp - 1];
      if (low[x] < low[p]) low[p] = low[x];
      below[p] += below[x];
      // x's subtree hangs off p alone: if it holds `colour` cells and so does the rest of
      // the board, p must be `colour` to join them.
      if (low[x] >= disc[p] && below[x] > 0 && below[x] < total && state[p] === -1) cut.push(p);
    }
  }
  return below[root] === total ? cut : null;
}
