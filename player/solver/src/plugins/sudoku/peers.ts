// Precomputed peer sets for a standard 9x9 Sudoku. Cell index = row * 9 + col.
// A cell's peers are the other cells sharing its row, column, or 3x3 box (20 each).

export const PEERS: number[][] = (() => {
  const peers: number[][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const set = new Set<number>();
      for (let k = 0; k < 9; k++) {
        set.add(r * 9 + k); // row
        set.add(k * 9 + c); // col
      }
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) {
          set.add((br + dr) * 9 + (bc + dc)); // box
        }
      }
      set.delete(r * 9 + c); // not a peer of itself
      peers.push([...set]);
    }
  }
  return peers;
})();
