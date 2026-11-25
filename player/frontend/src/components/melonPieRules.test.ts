import { describe, it, expect } from "vitest";
import { MelonPieCanon } from "../types/canon";
import example from "../../../../docs/melon-pie/board-melon-pie-example.canon.json";
import exampleSolution from "../../../../docs/melon-pie/board-melon-pie-example.solution.json";
import p1 from "../../../../docs/melon-pie/board-melon-pie-1.canon.json";
import p1Solution from "../../../../docs/melon-pie/board-melon-pie-1.solution.json";
import p2 from "../../../../docs/melon-pie/board-melon-pie-2.canon.json";
import p2Solution from "../../../../docs/melon-pie/board-melon-pie-2.solution.json";
import p3 from "../../../../docs/melon-pie/board-melon-pie-3.canon.json";
import p3Solution from "../../../../docs/melon-pie/board-melon-pie-3.solution.json";
import {
  CROSS,
  Segments,
  brokenClues,
  connected,
  emptySegments,
  fromValues,
  melonPieFormatProblems,
  melonPieProgress,
  melonPieWarnings,
  strandFrom,
  toValues,
  validateMelonPie,
} from "./melonPieRules";

const canon = example as MelonPieCanon;
const solved = (): Segments => JSON.parse(JSON.stringify(exampleSolution.edges));

describe("melon pie rules", () => {
  it("accepts every sample's solution", () => {
    const samples: [unknown, { edges: Segments }][] = [
      [example, exampleSolution],
      [p1, p1Solution],
      [p2, p2Solution],
      [p3, p3Solution],
    ];
    for (const [c, s] of samples) expect(validateMelonPie(c as MelonPieCanon, s.edges)).toBe(true);
  });

  it("follows a strand straight through crossings", () => {
    // Black (0,0) goes right, then down column 1 through the crossings at (1,1) and (3,1).
    const s = strandFrom(canon, solved(), [0, 0]);
    expect(s.to).toEqual([4, 0]);
    expect(s.segments).toContain("v:1,1");
    expect(s.segments).toContain("v:2,1");
    // Gray (1,0) crosses column 1 at (1,1) and turns down to (2,2).
    expect(strandFrom(canon, solved(), [1, 0]).to).toEqual([2, 2]);
  });

  it("rejects a loose end, a wrong pair and a separate piece", () => {
    const open = solved();
    open.h[0][0] = 0;
    expect(validateMelonPie(canon, open)).toBe(false);
    expect(validateMelonPie(canon, emptySegments(canon))).toBe(false);
    // Two pairs at opposite ends of a 3x1 board: right pairs, but not one whole.
    const twin: MelonPieCanon = {
      width: 3,
      height: 1,
      circles: [
        { r: 0, c: 0, color: 1 }, { r: 1, c: 0, color: 1 },
        { r: 0, c: 3, color: 0 }, { r: 1, c: 3, color: 0 },
      ],
    };
    const seg = emptySegments(twin);
    seg.v[0][0] = 1;
    seg.v[0][3] = 1;
    expect(connected(twin, seg)).toBe(false);
    expect(validateMelonPie(twin, seg)).toBe(false);
  });

  it("flags circles and points the drawn lines already break", () => {
    expect(brokenClues(canon, emptySegments(canon)).circles.size).toBe(0);
    expect(brokenClues(canon, solved()).circles.size).toBe(0);
    // Black (0,0) joined straight down to the gray circle at (1,0): a wrong-colour pair.
    const wrong = emptySegments(canon);
    wrong.v[0][0] = 1;
    const b = brokenClues(canon, wrong);
    expect(b.circles.has(0)).toBe(true);
    expect(b.circles.has(2)).toBe(true);
    // A plain point with three segments.
    const branch = emptySegments(canon);
    branch.h[3][1] = 1;
    branch.h[3][2] = 1;
    branch.v[3][2] = 1;
    expect(brokenClues(canon, branch).points.has("3,2")).toBe(true);
  });

  it("round-trips values with marks and computes progress", () => {
    const seg = solved();
    seg.h[2][0] = CROSS;
    expect(fromValues(canon, toValues(seg))).toEqual(seg);
    expect(validateMelonPie(canon, seg)).toBe(true); // a mark isn't a line
    expect(melonPieProgress(canon, emptySegments(canon))).toBe(0);
    expect(melonPieProgress(canon, solved())).toBe(100);
    const half = emptySegments(canon);
    half.v[1][3] = 1;
    half.v[2][3] = 1;
    half.v[3][3] = 1; // the black pair (1,3)-(4,3)
    expect(melonPieProgress(canon, half)).toBe(25);
  });

  it("lists format problems and warnings", () => {
    expect(melonPieFormatProblems(canon)).toEqual([]);
    expect(melonPieWarnings(canon)).toEqual([]);
    const bad: MelonPieCanon = {
      ...canon,
      circles: [...canon.circles, { r: 5, c: 0, color: 0 }, { r: 0, c: 0, color: 2 }],
    };
    expect(melonPieFormatProblems(bad).map((p) => p.message)).toEqual([
      "Circle at (5,0) is off the lattice",
      "Two circles at (0,0)",
    ]);
    expect(melonPieWarnings({ ...canon, circles: canon.circles.slice(1) }).map((w) => w.message)).toEqual([
      "3 black circles can't pair up",
    ]);
  });
});
