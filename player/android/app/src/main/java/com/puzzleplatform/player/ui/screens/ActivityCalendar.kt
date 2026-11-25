package com.puzzleplatform.player.ui.screens

import java.time.LocalDate

/**
 * Calendar math for the profile's activity heat map. Dates are the
 * 'YYYY-MM-DD' strings GET /history returns, in the device's time zone.
 * Mirrors the web's frontend/src/utils/activityCalendar.ts — keep the two in step.
 */
object ActivityCalendar {
    /** Weeks shown: this week plus the 52 before it (about a year). */
    const val WEEKS = 53

    /** Lower bounds of shade levels 1..4 (level 0 = no solves). */
    private val LEVEL_THRESHOLDS = intArrayOf(1, 3, 6, 11)

    private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

    /** 0 = Sunday ... 6 = Saturday. */
    private fun sundayIndex(date: LocalDate): Int = date.dayOfWeek.value % 7

    /** The first Sunday shown: WEEKS-1 weeks before this week's Sunday. */
    fun rangeStart(today: LocalDate): LocalDate =
        today.minusDays(sundayIndex(today).toLong()).minusWeeks((WEEKS - 1).toLong())

    /** Columns of 7 days (Sunday first) from [from]; days after [today] are null. */
    fun buildWeeks(from: LocalDate, today: LocalDate): List<List<LocalDate?>> =
        List(WEEKS) { w ->
            List(7) { d ->
                val date = from.plusDays((w * 7 + d).toLong())
                if (date.isAfter(today)) null else date
            }
        }

    fun level(count: Int): Int = LEVEL_THRESHOLDS.count { count >= it }

    /**
     * Month label per week column: the short month name on the first column whose
     * Sunday falls in a new month, else "". The first column is dropped when the
     * month changes again within two weeks, so labels don't overlap.
     */
    fun monthLabels(weeks: List<List<LocalDate?>>): List<String> {
        val labels = mutableListOf<String>()
        var prev = -1
        for (week in weeks) {
            val month = week[0]?.monthValue?.minus(1) ?: prev
            labels += if (month != prev) MONTHS[month] else ""
            prev = month
        }
        if (labels.size > 2 && labels[0].isNotEmpty() && (labels[1].isNotEmpty() || labels[2].isNotEmpty())) {
            labels[0] = ""
        }
        return labels
    }

    data class Summary(val total: Int, val activeDays: Int, val currentStreak: Int, val longestStreak: Int)

    /**
     * Totals and streaks over [totals] (date -> solves). The current streak counts
     * back from today, or from yesterday while today has no solve yet.
     */
    fun summarize(totals: Map<LocalDate, Int>, today: LocalDate): Summary {
        val active = totals.filterValues { it > 0 }.keys.sorted()
        var longest = 0
        var run = 0
        var prev: LocalDate? = null
        for (d in active) {
            run = if (prev != null && prev.plusDays(1) == d) run + 1 else 1
            longest = maxOf(longest, run)
            prev = d
        }
        val activeSet = active.toSet()
        var cursor = if (today in activeSet) today else today.minusDays(1)
        var current = 0
        while (cursor in activeSet) {
            current++
            cursor = cursor.minusDays(1)
        }
        return Summary(totals.values.sum(), active.size, current, longest)
    }

    /** Parse the API's days map (date -> type id -> solves); bad keys are skipped. */
    fun parseDays(days: Map<String, Map<String, Int>>): Map<LocalDate, Map<Int, Int>> =
        days.mapNotNull { (date, byType) ->
            val d = runCatching { LocalDate.parse(date) }.getOrNull() ?: return@mapNotNull null
            d to byType.mapNotNull { (id, n) -> id.toIntOrNull()?.let { it to n } }.toMap()
        }.toMap()
}
