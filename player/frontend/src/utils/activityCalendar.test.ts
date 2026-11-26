import { describe, expect, it } from "vitest";
import {
  addDays,
  buildWeeks,
  calendarRange,
  CALENDAR_WEEKS,
  level,
  monthLabels,
  summarize,
  todayIn,
  weekday,
} from "./activityCalendar";

describe("activityCalendar", () => {
  it("does date arithmetic across months and years", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekday("2026-11-25")).toBe(3); // Wednesday
  });

  it("reads today in a time zone", () => {
    const now = new Date("2026-11-24T23:30:00Z");
    expect(todayIn("Asia/Taipei", now)).toBe("2026-11-25");
    expect(todayIn("America/Los_Angeles", now)).toBe("2026-11-24");
  });

  it("starts the range on a Sunday 52 weeks back", () => {
    const { from, to } = calendarRange("2026-11-25");
    expect(weekday(from)).toBe(0);
    expect(from).toBe("2025-11-23");
    expect(to).toBe("2026-11-25");
  });

  it("builds week columns with future days blank", () => {
    const weeks = buildWeeks("2025-11-23", "2026-11-25");
    expect(weeks).toHaveLength(CALENDAR_WEEKS);
    expect(weeks[0][0]).toBe("2025-11-23");
    expect(weeks[CALENDAR_WEEKS - 1]).toEqual([
      "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", null, null, null,
    ]);
  });

  it("labels each month once", () => {
    const labels = monthLabels(buildWeeks("2025-11-23", "2026-11-25"));
    expect(labels.filter(Boolean)).toEqual([
      "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov",
    ]);
  });

  it("maps counts to shade levels", () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 36].map(level)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("summarizes totals and streaks", () => {
    const days = {
      "2026-11-01": { "1": 2 },
      "2026-11-02": { "1": 1, "5": 1 },
      "2026-11-03": { "3": 1 },
      "2026-11-20": { "1": 1 },
      "2026-11-23": { "1": 1 },
      "2026-11-24": { "2": 4 },
    };
    // Today (25th) not played yet: the streak from yesterday still counts.
    expect(summarize(days, "2026-11-25")).toEqual({
      total: 11, activeDays: 6, currentStreak: 2, longestStreak: 3,
    });
    expect(summarize(days, "2026-11-26").currentStreak).toBe(0);
    expect(summarize({}, "2026-11-25")).toEqual({
      total: 0, activeDays: 0, currentStreak: 0, longestStreak: 0,
    });
  });
});
