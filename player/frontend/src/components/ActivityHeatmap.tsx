import { useEffect, useMemo, useRef, useState } from "react";
import { getHistory } from "../api/client";
import {
  buildWeeks,
  calendarRange,
  dayTotal,
  HistoryDays,
  level,
  monthLabels,
  summarize,
  todayIn,
} from "../utils/activityCalendar";

// Empty, then four greens from light to dark. Same values as Android's HeatmapColors.
export const HEAT_COLORS = ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

const CELL = 12;
const GAP = 3;
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * GitHub-style calendar of the player's solves over the last year, in their own
 * time zone. Click a day for its breakdown by puzzle type.
 */
export default function ActivityHeatmap({
  player,
  typeLabels,
}: {
  player: number;
  /** puzzle type id -> display label */
  typeLabels: Record<number, string>;
}) {
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const today = useMemo(() => todayIn(tz), [tz]);
  const { from, to } = useMemo(() => calendarRange(today), [today]);
  const weeks = useMemo(() => buildWeeks(from, today), [from, today]);
  const months = useMemo(() => monthLabels(weeks), [weeks]);

  const [days, setDays] = useState<HistoryDays | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getHistory(player, from, to, tz)
      .then((res) => setDays(res.days))
      .catch((err) => setError(err.message));
  }, [player, from, to, tz]);

  // On a narrow screen, start scrolled to the most recent weeks.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days]);

  if (error) return <p style={{ color: "red" }}>Activity: {error}</p>;
  if (!days) return <p style={{ color: "#666" }}>Loading activity...</p>;

  const summary = summarize(days, today);
  const selectedTypes = selected
    ? Object.entries(days[selected] ?? {})
        .map(([id, n]) => ({ label: typeLabels[Number(id)] ?? `Type ${id}`, n }))
        .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    : [];

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.5rem", marginBottom: "0.75rem" }}>
        <Stat value={summary.total} label="solved this year" />
        <Stat value={summary.activeDays} label="active days" />
        <Stat value={summary.currentStreak} label="day streak" />
        <Stat value={summary.longestStreak} label="longest streak" />
      </div>

      {/* Shrink-wrapped so the legend lines up with the calendar's right edge. */}
      <div style={{ display: "inline-block", maxWidth: "100%" }}>
      <div ref={scrollRef} style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div style={{ display: "inline-grid", gridTemplateColumns: `auto repeat(${weeks.length}, ${CELL}px)`, columnGap: GAP, rowGap: GAP, fontSize: 10, color: "#666" }}>
          <div />
          {months.map((m, i) => (
            <div key={`m${i}`} style={{ height: 12, whiteSpace: "nowrap", overflow: "visible" }}>{m}</div>
          ))}
          {WEEKDAY_LABELS.map((wd, d) => [
            <div key={`wd${d}`} style={{ height: CELL, lineHeight: `${CELL}px`, paddingRight: 4 }}>{wd}</div>,
            ...weeks.map((week, w) => {
              const date = week[d];
              if (!date) return <div key={`${w}-${d}`} />;
              const count = dayTotal(days[date]);
              const isSelected = date === selected;
              return (
                <div
                  key={date}
                  title={`${count} solved on ${formatDate(date)}`}
                  onClick={() => setSelected(isSelected ? null : date)}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 2,
                    cursor: "pointer",
                    background: HEAT_COLORS[level(count)],
                    outline: isSelected ? "2px solid #333" : date === today ? "1px solid #999" : "none",
                    outlineOffset: isSelected ? 0 : -1,
                  }}
                />
              );
            }),
          ])}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 3, fontSize: 11, color: "#666", marginTop: 4 }}>
        Less
        {HEAT_COLORS.map((c) => (
          <span key={c} style={{ width: CELL - 2, height: CELL - 2, borderRadius: 2, background: c, display: "inline-block" }} />
        ))}
        More
      </div>
      </div>

      <div style={{ marginTop: "0.5rem", minHeight: "2.5rem", fontSize: "0.9rem" }}>
        {selected ? (
          <>
            <strong>{formatDate(selected)}</strong>
            {" · "}
            {dayTotal(days[selected])} solved
            {selectedTypes.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                {selectedTypes.map((t) => (
                  <span key={t.label} style={{ padding: "0.1rem 0.5rem", borderRadius: 10, background: "#eef6f0", border: "1px solid #c8e6c9", fontSize: "0.85rem" }}>
                    {t.label} ×{t.n}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <span style={{ color: "#888" }}>Click a day to see what you solved.</span>
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <span style={{ fontSize: "1.4rem", fontWeight: 700 }}>{value}</span>{" "}
      <span style={{ color: "#555", fontSize: "0.9rem" }}>{label}</span>
    </div>
  );
}
