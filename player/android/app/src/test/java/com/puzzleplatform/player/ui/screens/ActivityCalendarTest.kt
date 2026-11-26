package com.puzzleplatform.player.ui.screens

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

/** Same cases as the web's activityCalendar.test.ts. */
class ActivityCalendarTest {
    private fun d(s: String) = LocalDate.parse(s)

    @Test fun rangeStartsOnSunday52WeeksBack() {
        assertEquals(d("2025-11-23"), ActivityCalendar.rangeStart(d("2026-11-25")))
    }

    @Test fun weeksBlankFutureDays() {
        val weeks = ActivityCalendar.buildWeeks(d("2025-11-23"), d("2026-11-25"))
        assertEquals(ActivityCalendar.WEEKS, weeks.size)
        assertEquals(d("2025-11-23"), weeks[0][0])
        val last = weeks.last()
        assertEquals(d("2026-11-25"), last[3])
        assertNull(last[4])
    }

    @Test fun monthsLabelledOnce() {
        val labels = ActivityCalendar.monthLabels(ActivityCalendar.buildWeeks(d("2025-11-23"), d("2026-11-25")))
        assertEquals(
            listOf("Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"),
            labels.filter { it.isNotEmpty() },
        )
    }

    @Test fun levels() {
        assertEquals(listOf(0, 1, 1, 2, 2, 3, 3, 4, 4), listOf(0, 1, 2, 3, 5, 6, 10, 11, 36).map(ActivityCalendar::level))
    }

    @Test fun summaryAndStreaks() {
        val totals = mapOf(
            d("2026-11-01") to 2, d("2026-11-02") to 2, d("2026-11-03") to 1,
            d("2026-11-20") to 1, d("2026-11-23") to 1, d("2026-11-24") to 4,
        )
        assertEquals(ActivityCalendar.Summary(11, 6, 2, 3), ActivityCalendar.summarize(totals, d("2026-11-25")))
        assertEquals(0, ActivityCalendar.summarize(totals, d("2026-11-26")).currentStreak)
        assertEquals(ActivityCalendar.Summary(0, 0, 0, 0), ActivityCalendar.summarize(emptyMap(), d("2026-11-25")))
    }

    @Test fun parseDaysSkipsBadKeys() {
        val parsed = ActivityCalendar.parseDays(mapOf("2026-11-12" to mapOf("5" to 2, "x" to 1), "bad" to mapOf("1" to 1)))
        assertEquals(mapOf(d("2026-11-12") to mapOf(5 to 2)), parsed)
    }
}
