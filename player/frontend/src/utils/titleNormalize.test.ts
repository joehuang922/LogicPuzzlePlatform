import { describe, expect, it } from "vitest";
import { normalizeTitles, parseTitle, patternError, suggestPattern } from "./titleNormalize";

const items = (titles: (string | null)[], puzzleType = 1) =>
  titles.map((title, i) => ({ id: `${puzzleType}-${i}`, puzzleType, title }));

describe("parseTitle", () => {
  it("splits at the first number", () => {
    expect(parseTitle("Q12. Name 3")).toEqual({ prefix: "Q", number: 12, digits: "12", separator: ". ", text: "Name 3" });
    expect(parseTitle("7")).toMatchObject({ prefix: "", number: 7, text: "" });
    expect(parseTitle("第１２問")).toMatchObject({ prefix: "第", number: 12, text: "問" });
    expect(parseTitle("special")).toBeNull();
    expect(parseTitle(null)).toBeNull();
  });
});

describe("patternError", () => {
  it("needs exactly one <number>", () => {
    expect(patternError("<number>")).toBeNull();
    expect(patternError("Q<number>. <text>")).toBeNull();
    expect(patternError("Q")).not.toBeNull();
    expect(patternError("<number><number>")).not.toBeNull();
    expect(patternError("<number><text><text>")).not.toBeNull();
  });
});

describe("suggestPattern", () => {
  it("picks the most common shape", () => {
    expect(suggestPattern(["1", "2", "3", "10"])).toBe("<number>");
    expect(suggestPattern(["Q1. A", "2 B", "3 C", "Q4. D", "Q5. E", "special"])).toBe("Q<number>. <text>");
    expect(suggestPattern(["special", null])).toBe("<number>");
  });
});

describe("normalizeTitles", () => {
  it("pads plain numbers", () => {
    const titles = Array.from({ length: 15 }, (_, i) => String(i + 1));
    const out = normalizeTitles(items(titles), "<number>").map((c) => c.newTitle);
    expect(out.slice(0, 3)).toEqual(["01", "02", "03"]);
    expect(out.slice(9)).toEqual(["10", "11", "12", "13", "14", "15"]);
  });

  it("rewrites to the pattern and leaves unnumbered titles", () => {
    const out = normalizeTitles(items(["Q1. A", "2 B", "3 C", "Q4. D", "Q26. Z", "special"]), "Q<number>. <text>");
    expect(out.map((c) => c.newTitle)).toEqual(["Q01. A", "Q02. B", "Q03. C", "Q04. D", "Q26. Z", "special"]);
    expect(out.some((c) => c.conflict)).toBe(false);
  });

  it("re-pads already padded numbers to the widest", () => {
    expect(normalizeTitles(items(["007", "12"]), "<number>").map((c) => c.newTitle)).toEqual(["07", "12"]);
  });

  it("flags conflicts within a type only", () => {
    const out = normalizeTitles([...items(["1", "01", "2"], 1), ...items(["1"], 2)], "<number>");
    expect(out.map((c) => [c.newTitle, c.conflict])).toEqual([
      ["1", true],
      ["1", true],
      ["2", false],
      ["1", false],
    ]);
  });

  it("ignores duplicates it did not create", () => {
    const out = normalizeTitles(items(["special", "special", "3"]), "<number>");
    expect(out.some((c) => c.conflict)).toBe(false);
  });
});
