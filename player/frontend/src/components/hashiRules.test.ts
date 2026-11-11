import { describe, it, expect } from "vitest";
import {
  bridgeCount, bridgesFromValues, emptyBridges, hashiWarnings, islandState, neighbour,
  satisfiedIslands, validateHashi, withBridge, wouldCross,
} from "./hashiRules";

// Four 2s on the corners of a 3x3 lattice: a ring of single bridges.
const square = [
  [2, 0, 2],
  [0, 0, 0],
  [2, 0, 2],
];
const TL = { r: 0, c: 0 };
const TR = { r: 0, c: 2 };
const BL = { r: 2, c: 0 };
const BR = { r: 2, c: 2 };

describe("Hashi rules", () => {
  it("finds the nearest island along a line", () => {
    expect(neighbour(square, TL, 0, 1)).toEqual(TR);
    expect(neighbour(square, TL, 1, 0)).toEqual(BL);
    expect(neighbour(square, TL, -1, 0)).toBeNull();
  });

  it("fills every segment of a bridge", () => {
    const b = withBridge(emptyBridges(3, 3), TL, TR, 2);
    expect(b.h[0]).toEqual([2, 2]);
    expect(bridgeCount(b, TL, TR)).toBe(2);
    expect(bridgeCount(b, TR, TL)).toBe(2);
  });

  it("accepts the ring of single bridges", () => {
    let b = emptyBridges(3, 3);
    b = withBridge(b, TL, TR, 1);
    b = withBridge(b, BL, BR, 1);
    b = withBridge(b, TL, BL, 1);
    b = withBridge(b, TR, BR, 1);
    expect(validateHashi(square, b)).toBe(true);
    expect(satisfiedIslands(square, b)).toBe(4);
  });

  it("rejects two disconnected double bridges", () => {
    let b = emptyBridges(3, 3);
    b = withBridge(b, TL, TR, 2);
    b = withBridge(b, BL, BR, 2);
    expect(satisfiedIslands(square, b)).toBe(4);
    expect(validateHashi(square, b)).toBe(false);
  });

  it("flags crossing bridges", () => {
    const plus = [
      [0, 1, 0],
      [1, 0, 1],
      [0, 1, 0],
    ];
    let b = withBridge(emptyBridges(3, 3), { r: 1, c: 0 }, { r: 1, c: 2 }, 1);
    expect(wouldCross(b, { r: 0, c: 1 }, { r: 2, c: 1 })).toBe(true);
    b = withBridge(b, { r: 0, c: 1 }, { r: 2, c: 1 }, 1);
    expect(validateHashi(plus, b)).toBe(false);
  });

  it("marks islands done or over", () => {
    const b = withBridge(emptyBridges(3, 3), TL, TR, 2);
    expect(islandState(square, b, 0, 0)).toBe("done");
    const over = withBridge(b, TL, BL, 1);
    expect(islandState(square, over, 0, 0)).toBe("over");
    expect(islandState(square, over, 2, 2)).toBe("open");
  });

  it("reads player values", () => {
    const b = bridgesFromValues(3, 3, { "h:0,0": 2, "h:0,1": 2, "v:1,2": 1 });
    expect(b.h[0]).toEqual([2, 2]);
    expect(b.v[1]).toEqual([0, 0, 1]);
  });

  it("warns on misreads", () => {
    expect(hashiWarnings(square)).toEqual([]);
    expect(hashiWarnings([[0, 0]])).toEqual(["No islands"]);
    expect(hashiWarnings([[1, 0, 2]])[0]).toMatch(/odd total/);
    expect(hashiWarnings([[5, 0, 2]]).some((w) => w.startsWith("R1C1 is 5"))).toBe(true);
  });
});
