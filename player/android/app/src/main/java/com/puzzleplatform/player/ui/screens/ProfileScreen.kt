package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.TextButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.puzzleplatform.player.data.model.Mission

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    onOpenAttempt: (puzzleId: String, attemptId: String) -> Unit,
    vm: ProfileViewModel = viewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    // Back from a puzzle: count its solve from the local DB right away.
    LifecycleResumeEffect(Unit) {
        vm.recountMissionsLocally()
        onPauseOrDispose { }
    }
    var confirmRefresh by remember { mutableStateOf<Mission?>(null) }
    confirmRefresh?.let { m ->
        AlertDialog(
            onDismissRequest = { confirmRefresh = null },
            title = { Text("Swap this mission?") },
            text = { Text("\"${m.description}\" will be replaced by another. You get one swap per period.") },
            confirmButton = {
                TextButton(onClick = { vm.refreshMission(m.id); confirmRefresh = null }) { Text("Swap") }
            },
            dismissButton = { TextButton(onClick = { confirmRefresh = null }) { Text("Cancel") } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.playerName.ifBlank { "Profile" }) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        when {
            state.loading -> Column(
                Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) { CircularProgressIndicator() }

            state.error != null -> Column(Modifier.padding(padding).padding(16.dp)) {
                Text("Error: ${state.error}", color = MaterialTheme.colorScheme.error)
            }

            else -> Column(Modifier.fillMaxSize().padding(padding)) {
                val unlocked = state.achievements.count { it.unlocked }
                val tabs = listOf("Missions", "Player", "Achievements ($unlocked / ${state.achievements.size})")
                PrimaryTabRow(selectedTabIndex = state.tab.ordinal) {
                    ProfileTab.entries.forEachIndexed { i, t ->
                        Tab(
                            selected = state.tab == t,
                            onClick = { vm.selectTab(t) },
                            text = { Text(tabs[i], maxLines = 1) },
                        )
                    }
                }
                LazyColumn(
                    Modifier.fillMaxSize().padding(horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    item { Spacer(Modifier.height(6.dp)) }
                    if (state.tab == ProfileTab.MISSIONS) {
                        val missions = state.missions
                        when {
                            state.missionsError != null -> item {
                                Text(
                                    "Couldn't load missions: ${state.missionsError}",
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                            missions == null -> item {
                                Text("Loading missions…", style = MaterialTheme.typography.bodySmall)
                            }
                            missions.isEmpty() -> item {
                                Text("No missions right now.", style = MaterialTheme.typography.bodySmall)
                            }
                            else -> {
                                state.openError?.let { err ->
                                    item {
                                        Text(
                                            err,
                                            color = MaterialTheme.colorScheme.error,
                                            style = MaterialTheme.typography.bodySmall,
                                        )
                                    }
                                }
                                for (period in listOf("day", "week", "month")) {
                                    val group = missions.filter { it.period == period }
                                    if (group.isEmpty()) continue
                                    item(key = "mh-$period") { MissionPeriodHeader(period, group) }
                                    items(group, key = { "m-${it.id}" }) { m ->
                                        MissionCard(
                                            m,
                                            refreshing = state.refreshingMissionId == m.id,
                                            onPlay = { qid -> vm.openMissionPuzzle(qid, onOpenAttempt) },
                                            onRefresh = { confirmRefresh = m },
                                        )
                                    }
                                }
                            }
                        }
                    }
                    if (state.tab == ProfileTab.PLAYER) {
                        item { SyncStatusRow(state.syncState) }
                        item {
                            val solved = state.questionStats.sumOf { it.solved }
                            val tried = state.questionStats.sumOf { it.tried }
                            Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.padding(top = 8.dp)) {
                                Text("$solved", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                                Text(
                                    " puzzles solved · $tried tried, unsolved",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(bottom = 4.dp),
                                )
                            }
                        }
                        item { Header("Activity") }
                        item {
                            val days = state.historyDays
                            when {
                                days != null -> ActivityHeatmap(
                                    days = days,
                                    today = state.today,
                                    typeLabels = state.questionStats.associate { it.typeId to it.typeJpLabel },
                                )
                                state.historyError != null -> Text(
                                    "Activity: ${state.historyError}",
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                else -> Text("Loading activity…", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        item { Header("Question Stats") }
                        items(state.questionStats, key = { "q-${it.typeId}" }) { s ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(s.typeJpLabel)
                                Text("${s.solved} solved · ${s.tried} tried · ${s.total} total", style = MaterialTheme.typography.bodySmall)
                            }
                        }

                        if (state.collectionGroups.isNotEmpty()) {
                            item { Header("Collection Stats") }
                            items(state.collectionGroups, key = { "cg-${it.collectionId}" }) { cg ->
                                Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                    Text("${cg.collectionName} (${cg.totalSolved} / ${cg.totalCount})", fontWeight = FontWeight.Medium)
                                    for (t in cg.types) {
                                        Row(Modifier.fillMaxWidth().padding(start = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text(t.typeJpLabel, style = MaterialTheme.typography.bodySmall)
                                            Text("${t.solved} / ${t.total}", style = MaterialTheme.typography.bodySmall)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if (state.tab == ProfileTab.ACHIEVEMENTS) {
                        items(state.achievements, key = { it.id }) { a ->
                            Card(Modifier.fillMaxWidth()) {
                                Row(
                                    Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        a.icon,
                                        modifier = Modifier.graphicsLayer { alpha = if (a.unlocked) 1f else 0.4f },
                                    )
                                    Column {
                                        Text(a.name, fontWeight = FontWeight.Bold)
                                        Text(a.description, style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }

                    }
                    item { Spacer(Modifier.height(12.dp)) }
                }
            }
        }
    }
}

/**
 * A compact "local ↔ remote sync" status line. Backed by a live Room count, so
 * it works offline and flips to "all synced" automatically once a push lands.
 */
@Composable
private fun SyncStatusRow(sync: com.puzzleplatform.player.data.sync.SyncState) {
    val (icon, text) = when {
        sync.syncing -> "⟳" to "Syncing…"
        sync.pendingCount == 0 -> "✓" to buildString {
            append("All progress synced")
            sync.lastSyncedAt?.let { append(" · ${formatRelativeTime(it)}") }
        }
        else -> "⭯" to "${sync.pendingCount} change${if (sync.pendingCount == 1) "" else "s"} waiting to sync"
    }
    val color = if (sync.pendingCount == 0 && !sync.syncing) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Card(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(icon, color = color)
            Text(text, style = MaterialTheme.typography.bodyMedium, color = color)
        }
    }
}

/** "just now" / "5 min ago" / "2 h ago" for the last-synced timestamp. */
private fun formatRelativeTime(epochMillis: Long): String {
    val deltaSec = (System.currentTimeMillis() - epochMillis) / 1000
    return when {
        deltaSec < 60 -> "just now"
        deltaSec < 3600 -> "${deltaSec / 60} min ago"
        deltaSec < 86400 -> "${deltaSec / 3600} h ago"
        else -> "${deltaSec / 86400} d ago"
    }
}

private val PERIOD_LABELS = mapOf("day" to "Today", "week" to "This week", "month" to "This month")

@Composable
private fun MissionPeriodHeader(period: String, group: List<Mission>) {
    val done = group.count { it.completed }
    Row(
        Modifier.fillMaxWidth().padding(top = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(PERIOD_LABELS[period] ?: period, fontWeight = FontWeight.SemiBold)
        Text(
            "$done / ${group.size} done · ${missionTimeLeft(group.first().endsAt)}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private val SIZE_PILL_COLORS = mapOf("BIG" to Color(0xFFEF6C00), "GIANT" to Color(0xFFC62828))

@Composable
private fun MissionCard(
    m: Mission,
    refreshing: Boolean,
    onPlay: (questionId: String) -> Unit,
    onRefresh: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                m.size?.let { size ->
                    Text(
                        size,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        modifier = Modifier
                            .background(SIZE_PILL_COLORS[size] ?: Color.Gray, RoundedCornerShape(4.dp))
                            .padding(horizontal = 5.dp, vertical = 1.dp),
                    )
                }
                Text(m.description, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (m.completed) Text("✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                if (m.refreshable) {
                    if (refreshing) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    } else {
                        IconButton(onClick = onRefresh, modifier = Modifier.size(28.dp)) {
                            Icon(Icons.Filled.Refresh, contentDescription = "Swap this mission (once per period)")
                        }
                    }
                }
            }
            m.questionTitle?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                // Assigned puzzles show how far the player has got on the board, not 0 / 1.
                val puzzleProgress = m.puzzleProgress
                LinearProgressIndicator(
                    progress = {
                        when {
                            puzzleProgress != null -> puzzleProgress.toFloat()
                            m.target > 0 -> m.progress.toFloat() / m.target
                            else -> 0f
                        }
                    },
                    modifier = Modifier.weight(1f),
                )
                Text(
                    if (puzzleProgress != null) "${(puzzleProgress * 100).toInt()}%" else "${m.progress} / ${m.target}",
                    style = MaterialTheme.typography.bodySmall,
                )
                if (m.questionId != null && !m.completed) {
                    TextButton(onClick = { onPlay(m.questionId) }) { Text("Play") }
                }
            }
        }
    }
}

/** "3 h left" / "2 d left" until the mission's period ends. */
private fun missionTimeLeft(endsAt: String): String {
    val end = runCatching { java.time.Instant.parse(endsAt).toEpochMilli() }.getOrNull() ?: return ""
    val ms = end - System.currentTimeMillis()
    if (ms <= 0) return "ended"
    val h = ms / 3_600_000
    return when {
        h < 1 -> "${maxOf(1, ms / 60_000)} min left"
        h < 48 -> "$h h left"
        else -> "${h / 24} d left"
    }
}

@Composable
private fun Header(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
    )
}
