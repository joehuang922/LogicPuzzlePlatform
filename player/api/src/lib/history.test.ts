import { describe, expect, it } from "vitest";
import { bucketEvents, localDate, parseHistoryQuery, utcWindow } from "./history";

describe("parseHistoryQuery", () => {
  const base = { player: "1", from: "2026-11-01", to: "2026-11-25" };

  it("defaults tz to UTC and metric to solved", () => {
    expect(parseHistoryQuery(base)).toEqual({
      player: 1,
      from: "2026-11-01",
      to: "2026-11-25",
      tz: "UTC",
      metric: "solved",
    });
  });

  it("rejects missing or bad input", () => {
    expect(parseHistoryQuery(null)).toHaveProperty("error");
    expect(parseHistoryQuery({ ...base, player: "x" })).toHaveProperty("error");
    expect(parseHistoryQuery({ ...base, from: "2026-2-1" })).toHaveProperty("error");
    expect(parseHistoryQuery({ ...base, to: "2026-02-30" })).toHaveProperty("error");
    expect(parseHistoryQuery({ ...base, from: "2026-11-26" })).toHaveProperty("error");
    expect(parseHistoryQuery({ ...base, tz: "Mars/Olympus" })).toHaveProperty("error");
    expect(parseHistoryQuery({ ...base, metric: "tried" })).toHaveProperty("error");
  });

  it("caps the range at 400 days", () => {
    expect(parseHistoryQuery({ ...base, from: "2025-10-22", to: "2026-11-25" })).not.toHaveProperty("error");
    expect(parseHistoryQuery({ ...base, from: "2025-10-21", to: "2026-11-25" })).toHaveProperty("error");
  });
});

describe("time zones", () => {
  it("maps a UTC time to the local date", () => {
    expect(localDate("2026-11-24 23:30:00", "Asia/Taipei")).toBe("2026-11-25");
    expect(localDate("2026-11-25 03:00:00", "America/Los_Angeles")).toBe("2026-11-24");
    expect(localDate("2026-11-25 03:00:00", "UTC")).toBe("2026-11-25");
  });

  it("widens the UTC window by 14h on each side", () => {
    expect(utcWindow("2026-11-01", "2026-11-02")).toEqual({
      start: "2026-10-31 10:00:00",
      end: "2026-11-03 14:00:00",
    });
  });
});

describe("bucketEvents", () => {
  it("counts per local day and type, dropping days outside the range", () => {
    const events = [
      { at: "2026-10-31 15:59:59", puzzleType: 3 }, // Oct 31 in Taipei: out
      { at: "2026-10-31 16:00:00", puzzleType: 3 }, // Nov 1 in Taipei
      { at: "2026-11-01 10:00:00", puzzleType: 3 },
      { at: "2026-11-01 10:00:00", puzzleType: 12 },
      { at: "2026-11-02 15:00:00", puzzleType: 12 }, // Nov 2 23:00
      { at: "2026-11-02 16:00:00", puzzleType: 12 }, // Nov 3: out
    ];
    expect(bucketEvents(events, "2026-11-01", "2026-11-02", "Asia/Taipei")).toEqual({
      "2026-11-01": { "3": 2, "12": 1 },
      "2026-11-02": { "12": 1 },
    });
  });
});
