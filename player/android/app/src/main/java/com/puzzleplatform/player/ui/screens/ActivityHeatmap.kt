package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Empty, then four greens. Light values match the web's HEAT_COLORS. */
private object HeatmapColors {
    val LIGHT = listOf(Color(0xFFEBEDF0), Color(0xFF9BE9A8), Color(0xFF40C463), Color(0xFF30A14E), Color(0xFF216E39))
    val DARK = listOf(Color(0xFF2D333B), Color(0xFF0E4429), Color(0xFF006D32), Color(0xFF26A641), Color(0xFF39D353))
}

private val CELL = 12.dp
private val GAP = 3.dp
private val WEEKDAY_LABELS = listOf("", "Mon", "", "Wed", "", "Fri", "")
private val DATE_FORMAT = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy", Locale.getDefault())

/**
 * GitHub-style calendar of the player's solves over the last year, in the
 * device's time zone. Tap a day for its breakdown by puzzle type.
 *
 * @param days date -> puzzle type id -> solves
 * @param typeLabels puzzle type id -> display label
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ActivityHeatmap(
    days: Map<LocalDate, Map<Int, Int>>,
    today: LocalDate,
    typeLabels: Map<Int, String>,
) {
    val weeks = remember(today) { ActivityCalendar.buildWeeks(ActivityCalendar.rangeStart(today), today) }
    val months = remember(weeks) { ActivityCalendar.monthLabels(weeks) }
    val totals = remember(days) { days.mapValues { (_, byType) -> byType.values.sum() } }
    val summary = remember(totals, today) { ActivityCalendar.summarize(totals, today) }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedDate = selected?.let { LocalDate.parse(it) }

    val dark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    val colors = if (dark) HeatmapColors.DARK else HeatmapColors.LIGHT
    val labelColor = MaterialTheme.colorScheme.onSurfaceVariant
    val labelStyle = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp, color = labelColor)

    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Stat(summary.total, "solved")
            Stat(summary.activeDays, "active days")
            Stat(summary.currentStreak, "day streak")
            Stat(summary.longestStreak, "longest")
        }
        Spacer(Modifier.height(8.dp))

        // Start scrolled to the most recent weeks.
        val scroll = rememberScrollState()
        LaunchedEffect(scroll.maxValue) { scroll.scrollTo(scroll.maxValue) }
        Row(Modifier.horizontalScroll(scroll), horizontalArrangement = Arrangement.spacedBy(GAP)) {
            Column(verticalArrangement = Arrangement.spacedBy(GAP)) {
                Spacer(Modifier.height(14.dp))
                for (wd in WEEKDAY_LABELS) {
                    Box(Modifier.height(CELL), contentAlignment = Alignment.CenterStart) {
                        Text(wd, style = labelStyle, modifier = Modifier.padding(end = 2.dp))
                    }
                }
            }
            weeks.forEachIndexed { w, week ->
                Column(verticalArrangement = Arrangement.spacedBy(GAP)) {
                    Box(Modifier.size(CELL, 14.dp)) {
                        // Wider than the column: let it run over the next empty labels.
                        Text(
                            months[w],
                            style = labelStyle,
                            maxLines = 1,
                            softWrap = false,
                            modifier = Modifier.wrapContentWidth(Alignment.Start, unbounded = true),
                        )
                    }
                    for (date in week) {
                        if (date == null) {
                            Spacer(Modifier.size(CELL))
                            continue
                        }
                        val count = totals[date] ?: 0
                        val isSelected = date == selectedDate
                        Box(
                            Modifier
                                .size(CELL)
                                .background(colors[ActivityCalendar.level(count)], RoundedCornerShape(2.dp))
                                .then(
                                    when {
                                        isSelected -> Modifier.border(2.dp, MaterialTheme.colorScheme.onSurface, RoundedCornerShape(2.dp))
                                        date == today -> Modifier.border(1.dp, labelColor, RoundedCornerShape(2.dp))
                                        else -> Modifier
                                    }
                                )
                                .clickable { selected = if (isSelected) null else date.toString() }
                        )
                    }
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Less", style = labelStyle)
            for (c in colors) Box(Modifier.size(10.dp).background(c, RoundedCornerShape(2.dp)))
            Text("More", style = labelStyle)
        }

        Spacer(Modifier.height(6.dp))
        if (selectedDate == null) {
            Text("Tap a day to see what you solved.", style = MaterialTheme.typography.bodySmall, color = labelColor)
        } else {
            val byType = days[selectedDate].orEmpty()
                .map { (id, n) -> (typeLabels[id] ?: "Type $id") to n }
                .sortedWith(compareByDescending<Pair<String, Int>> { it.second }.thenBy { it.first })
            Text(
                "${selectedDate.format(DATE_FORMAT)} · ${totals[selectedDate] ?: 0} solved",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            if (byType.isNotEmpty()) {
                FlowRow(
                    Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    for ((label, n) in byType) {
                        Text(
                            "$label ×$n",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier
                                .background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(10.dp))
                                .padding(horizontal = 8.dp, vertical = 2.dp),
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Stat(value: Int, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(76.dp)) {
        Text("$value", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
