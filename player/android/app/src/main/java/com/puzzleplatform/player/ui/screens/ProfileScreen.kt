package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    vm: ProfileViewModel = viewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()

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

            else -> {
                val unlocked = state.achievements.count { it.unlocked }
                LazyColumn(
                    Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                        item { SyncStatusRow(state.syncState) }
                    item { Header("Achievements ($unlocked / ${state.achievements.size})") }
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

@Composable
private fun Header(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
    )
}
