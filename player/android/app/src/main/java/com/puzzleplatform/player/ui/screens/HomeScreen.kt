package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.ui.DIFFICULTY_LABELS

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onOpenAttempt: (puzzleId: String, attemptId: String) -> Unit,
    onOpenProfile: () -> Unit,
    vm: HomeViewModel = viewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Puzzles") },
                actions = {
                    IconButton(onClick = onOpenProfile) {
                        Icon(Icons.Filled.Person, contentDescription = "Profile")
                    }
                },
            )
        },
    ) { padding ->
        when {
            state.loading -> Centered(Modifier.padding(padding)) { CircularProgressIndicator() }
            state.error != null -> Centered(Modifier.padding(padding)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Error: ${state.error}", color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { vm.load() }) { Text("Retry") }
                }
            }
            // Pull down to pull server-side puzzle edits into downloaded
            // collections, then re-read Home (see HomeViewModel.refresh).
            else -> PullToRefreshBox(
                isRefreshing = state.refreshing,
                onRefresh = { vm.refresh() },
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    // "Latest": the puzzles the player most recently worked on. Hidden
                    // entirely until there's at least one, so a fresh install isn't a
                    // lone empty header.
                    if (state.puzzles.isNotEmpty()) {
                        item { SectionHeader("Latest") }
                        items(state.puzzles, key = { it.id }) { p ->
                            PuzzleRow(p) { vm.selectPuzzle(p) }
                        }
                    }

                    if (state.collections.isNotEmpty()) {
                        item { SectionHeader("Collections") }
                        items(state.collections, key = { "col-${it.id}" }) { c ->
                            CollectionRow(
                                collection = c,
                                expanded = state.expandedCollectionId == c.id,
                                progressText = state.collectionProgress[c.id]?.let { "${it.solved}/${it.total}" },
                                downloaded = state.downloadedCollectionIds.contains(c.id),
                                downloading = state.downloadingCollectionIds.contains(c.id),
                                onToggle = { vm.toggleCollection(c.id) },
                                onDownload = { vm.downloadCollection(c.id) },
                            )
                            if (state.expandedCollectionId == c.id) {
                                if (state.loadingCollectionPuzzles) {
                                    Text("Loading questions…", modifier = Modifier.padding(start = 16.dp, bottom = 8.dp))
                                } else {
                                    for (p in state.collectionPuzzles) {
                                        CollectionPuzzleRow(
                                            puzzle = p,
                                            solved = state.solvedPuzzleIds.contains(p.id),
                                            attempted = state.attemptedPuzzleIds.contains(p.id),
                                            onClick = { vm.selectPuzzle(p) },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Start-puzzle choice dialog
    val selected = state.selectedPuzzle
    if (selected != null && state.previousAttempts == null) {
        val supported = vm.isSupported(selected.puzzleType)
        AlertDialog(
            onDismissRequest = { vm.dismissDialogs() },
            title = { Text(selected.title ?: "Untitled") },
            text = {
                if (supported) Text("How would you like to proceed?")
                else Text("${selected.puzzleTypeName} isn't playable in this version yet.")
            },
            confirmButton = {
                if (supported) {
                    TextButton(onClick = { vm.startNewAttempt(onOpenAttempt) }) { Text("New Attempt") }
                }
            },
            dismissButton = {
                Row {
                    if (supported && state.hasPreviousAttempts) {
                        TextButton(onClick = { vm.loadPreviousAttempts() }) { Text("Load Previous") }
                    }
                    TextButton(onClick = { vm.dismissDialogs() }) { Text("Cancel") }
                }
            },
        )
    }

    // Previous-attempts dialog
    val attempts = state.previousAttempts
    if (attempts != null) {
        AlertDialog(
            onDismissRequest = { vm.dismissDialogs() },
            title = { Text("Previous Attempts") },
            text = {
                if (attempts.isEmpty()) {
                    Text("No unfinished attempts found for this puzzle.")
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        for (a in attempts) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { vm.openAttempt(a.id, onOpenAttempt) }
                                    .padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text("${(a.latestProgress * 100).toInt()}%")
                                Text(com.puzzleplatform.player.ui.formatElapsed(a.latestElapsedSeconds))
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.dismissDialogs() }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun SectionHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = 12.dp, bottom = 4.dp),
    )
}

@Composable
private fun PuzzleRow(p: Puzzle, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(12.dp)) {
            Text(p.title ?: "Untitled", fontWeight = FontWeight.Medium)
            val diff = DIFFICULTY_LABELS[p.difficulty] ?: "${p.difficulty}/5"
            val from = p.srcCollectionName?.let { " · $it" } ?: ""
            Text(
                "${p.puzzleTypeJpLabel} · $diff$from",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CollectionRow(
    collection: Collection,
    expanded: Boolean,
    progressText: String?,
    downloaded: Boolean,
    downloading: Boolean,
    onToggle: () -> Unit,
    onDownload: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle)) {
        Row(
            Modifier.padding(12.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Cover thumbnail (CloudFront). Skipped when the collection has none.
            collection.coverSrc?.let { url ->
                AsyncImage(
                    model = url,
                    contentDescription = "${collection.name} cover",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(width = 40.dp, height = 56.dp)
                        .clip(RoundedCornerShape(4.dp)),
                )
            }
            Column(Modifier.weight(1f)) {
                Text((if (expanded) "▾ " else "▸ ") + collection.name, fontWeight = FontWeight.Medium)
                collection.publisher?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(progressText ?: "${collection.puzzleCount}", style = MaterialTheme.typography.bodySmall)
            // Offline download control: spinner while fetching, ✓ when available,
            // otherwise a download affordance. Stops row-toggle propagation.
            when {
                downloading -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                downloaded -> Icon(
                    Icons.Filled.CloudDone,
                    contentDescription = "Available offline",
                    tint = MaterialTheme.colorScheme.primary,
                )
                else -> IconButton(onClick = onDownload) {
                    Icon(Icons.Filled.Download, contentDescription = "Download for offline")
                }
            }
        }
    }
}

@Composable
private fun CollectionPuzzleRow(puzzle: Puzzle, solved: Boolean, attempted: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = 20.dp, top = 6.dp, bottom = 6.dp, end = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(puzzle.title ?: "(none)", style = MaterialTheme.typography.bodyMedium)
            val diff = DIFFICULTY_LABELS[puzzle.difficulty] ?: puzzle.difficulty
            val size = puzzle.width?.let { w -> puzzle.height?.let { h -> " · $w x $h" } } ?: ""
            Text(
                "${puzzle.puzzleTypeJpLabel} · $diff$size",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(8.dp))
        when {
            solved -> Text("✓", color = MaterialTheme.colorScheme.primary)
            attempted -> Text("◐", color = MaterialTheme.colorScheme.tertiary)
        }
    }
}

@Composable
private fun Centered(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
