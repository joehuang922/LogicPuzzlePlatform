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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.puzzleplatform.player.ui.DIFFICULTY_LABELS
import com.puzzleplatform.player.ui.board.DigitBar
import com.puzzleplatform.player.ui.board.KakuroBoard
import com.puzzleplatform.player.ui.board.SudokuBoard
import com.puzzleplatform.player.ui.formatElapsed

private class PlayViewModelFactory(
    private val puzzleId: String,
    private val attemptId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        PlayViewModel(puzzleId, attemptId) as T
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayScreen(
    puzzleId: String,
    attemptId: String,
    onBack: () -> Unit,
    onOpenAttempt: (puzzleId: String, attemptId: String) -> Unit,
) {
    val vm: PlayViewModel = viewModel(
        key = "play-$puzzleId-$attemptId",
        factory = remember(puzzleId, attemptId) { PlayViewModelFactory(puzzleId, attemptId) },
    )
    val state by vm.state.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbarHostState.showSnackbar(it)
            vm.clearToast()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(state.puzzle?.title ?: "Play") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            val selected = state.selectedCell
            if (selected != null) {
                // Only Sudoku (type 1) offers pencil-mark notes; a cell that already
                // holds a committed answer can't take notes, so disable the toggle.
                val notesEnabled = state.puzzle?.puzzleType == 1
                val cellHasAnswer = (state.userValues[selected] ?: 0) > 0
                DigitBar(
                    onDigit = vm::enterDigit,
                    onClear = vm::clearCell,
                    onDismiss = { vm.selectCell(null) },
                    noteMode = state.noteMode && !cellHasAnswer,
                    onToggleNoteMode = if (notesEnabled) vm::toggleNoteMode else null,
                    noteModeDisabled = cellHasAnswer,
                )
            }
        },
    ) { padding ->
        when {
            state.loading -> Box(Modifier.padding(padding)) { CircularProgressIndicator() }
            state.error != null -> Box(Modifier.padding(padding)) {
                Text("Error: ${state.error}", color = MaterialTheme.colorScheme.error)
            }
            state.puzzle != null -> {
                val puzzle = state.puzzle!!
                Column(
                    Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(horizontal = 12.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    // Non-destructive notice when the puzzle was edited server-side
                    // since this attempt started. Progress stays; reload is opt-in.
                    if (state.puzzleEdited) {
                        EditedPuzzleBanner(
                            reloading = state.reloading,
                            onReload = { vm.reloadUpdatedPuzzle(onOpenAttempt) },
                            onDismiss = vm::dismissEditedNotice,
                        )
                    }

                    // Info line, with the collection cover thumbnail (CloudFront) when present.
                    val diff = DIFFICULTY_LABELS[puzzle.difficulty] ?: "${puzzle.difficulty}/5"
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        puzzle.srcCollectionCoverSrc?.let { url ->
                            AsyncImage(
                                model = url,
                                contentDescription = "${puzzle.srcCollectionName ?: "Collection"} cover",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(width = 44.dp, height = 62.dp)
                                    .clip(RoundedCornerShape(4.dp)),
                            )
                        }
                        Column {
                            puzzle.srcCollectionName?.let {
                                Text(it, style = MaterialTheme.typography.bodyMedium)
                            }
                            Text(
                                "${puzzle.puzzleTypeJpLabel} · $diff" + (puzzle.author?.let { " · by $it" } ?: ""),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }

                    // Timer + actions
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            formatElapsed(state.elapsedSeconds),
                            fontFamily = FontFamily.Monospace,
                            style = MaterialTheme.typography.titleMedium,
                        )
                        OutlinedButton(onClick = vm::save, enabled = !state.saving) {
                            Text(if (state.saving) "Saving…" else "Save")
                        }
                        OutlinedButton(onClick = vm::openLoadDialog) { Text("Load") }
                        Spacer(Modifier.width(4.dp))
                        FilterChip(
                            selected = state.liveValidate,
                            onClick = vm::toggleLiveValidate,
                            label = { Text("Errors: ${if (state.liveValidate) "On" else "Off"}") },
                        )
                    }

                    // Progress bar
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        LinearProgressIndicator(
                            progress = { (state.progress / 100.0).toFloat().coerceIn(0f, 1f) },
                            modifier = Modifier.weight(1f),
                        )
                        Text("%.1f %%".format(state.progress), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                    }

                    // Board, dispatched by puzzle type.
                    when (puzzle.puzzleType) {
                        1 -> SudokuBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            liveValidate = state.liveValidate,
                            selectedCell = state.selectedCell,
                            onSelectCell = vm::selectCell,
                        )
                        12 -> KakuroBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            liveValidate = state.liveValidate,
                            selectedCell = state.selectedCell,
                            onSelectCell = vm::selectCell,
                        )
                        else -> Text("This puzzle type isn't playable in this version yet.")
                    }
                }
            }
        }
    }

    // Load-snapshot dialog
    val snapshots = state.snapshots
    if (snapshots != null) {
        AlertDialog(
            onDismissRequest = vm::dismissLoadDialog,
            title = { Text("Load Snapshot") },
            text = {
                if (snapshots.isEmpty()) {
                    Text("No snapshots found for this attempt.")
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        for (s in snapshots) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { vm.loadSnapshot(s.id) }
                                    .padding(vertical = 6.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text("${(s.progress * 100).toInt()}%")
                                Text(formatElapsed(s.elapsedSeconds))
                            }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = vm::dismissLoadDialog) { Text("Cancel") } },
        )
    }

    // Congratulations dialog
    if (state.showCongrats) {
        AlertDialog(
            onDismissRequest = vm::dismissCongrats,
            title = { Text("Congratulations!") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("You solved the puzzle in ${formatElapsed(state.finalTime)}!")
                    state.completionError?.let {
                        Text("Your solve couldn't be saved: $it", color = MaterialTheme.colorScheme.error)
                        Button(onClick = vm::retryCompletion, enabled = !state.retrying) {
                            Text(if (state.retrying) "Retrying…" else "Retry save")
                        }
                    }
                    if (state.newAchievements.isNotEmpty()) {
                        Text("Achievements Unlocked!", fontWeight = FontWeight.Bold)
                        for (a in state.newAchievements) {
                            Text("${a.icon}  ${a.name} — ${a.description}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { vm.dismissCongrats(); onBack() }) { Text("Back to Puzzles") }
            },
            dismissButton = {
                TextButton(onClick = vm::dismissCongrats) { Text("Close") }
            },
        )
    }
}

@Composable
private fun EditedPuzzleBanner(
    reloading: Boolean,
    onReload: () -> Unit,
    onDismiss: () -> Unit,
) {
    Card(
        Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("This puzzle was updated", fontWeight = FontWeight.Bold)
            Text(
                "A newer version is available. Your current progress is kept — you can keep playing it, or start a fresh attempt on the updated puzzle.",
                style = MaterialTheme.typography.bodySmall,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onReload, enabled = !reloading) {
                    Text(if (reloading) "Loading…" else "Reload updated version")
                }
                TextButton(onClick = onDismiss) { Text("Keep playing") }
            }
        }
    }
}

@Composable
private fun Box(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier = modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}
