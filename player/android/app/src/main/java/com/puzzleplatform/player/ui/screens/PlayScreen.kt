package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.ui.DIFFICULTY_LABELS
import com.puzzleplatform.player.ui.board.AkariBoard
import com.puzzleplatform.player.ui.board.HitoriBoard
import com.puzzleplatform.player.ui.board.DigitBar
import com.puzzleplatform.player.ui.board.FillominoBoard
import com.puzzleplatform.player.ui.board.FillominoMode
import com.puzzleplatform.player.ui.board.HellGolfBoard
import com.puzzleplatform.player.ui.board.KakuroBoard
import com.puzzleplatform.player.ui.board.LitsBoard
import com.puzzleplatform.player.ui.board.MasyuBoard
import com.puzzleplatform.player.ui.board.NonogramBoard
import com.puzzleplatform.player.ui.board.NonogramMode
import com.puzzleplatform.player.ui.board.NumberLinkBoard
import com.puzzleplatform.player.ui.board.NurikabeBoard
import com.puzzleplatform.player.ui.board.NorinoriBoard
import com.puzzleplatform.player.ui.board.NurimazeBoard
import com.puzzleplatform.player.ui.board.NuritwinBoard
import com.puzzleplatform.player.ui.board.RippleEffectBoard
import com.puzzleplatform.player.ui.board.ShakashakaBoard
import com.puzzleplatform.player.ui.board.ShikakuBoard
import com.puzzleplatform.player.ui.board.SlalomBoard
import com.puzzleplatform.player.ui.board.SlitherlinkBoard
import com.puzzleplatform.player.ui.board.SudokuBoard
import com.puzzleplatform.player.ui.board.TentaishowBoard
import com.puzzleplatform.player.ui.board.YajilinBoard
import com.puzzleplatform.player.puzzle.PuzzleEngines
import com.puzzleplatform.player.puzzle.SudokuHinter
import com.puzzleplatform.player.ui.formatElapsed

private class PlayViewModelFactory(
    private val puzzleId: String,
    private val attemptId: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        PlayViewModel(puzzleId, attemptId) as T
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
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
                val type = state.puzzle?.puzzleType
                if (type == 14 || type == 25) {
                    // Fillomino room numbers / Ripple Effect cell values: both are
                    // multi-digit (so a "0" key is offered) with no pencil notes.
                    DigitBar(
                        onDigit = vm::enterMultiDigit,
                        onClear = vm::clearSelectedCellRetype,
                        onDismiss = { vm.selectCell(null) },
                        includeZero = true,
                    )
                } else {
                    // Only Sudoku (type 1) offers pencil-mark notes; a cell that already
                    // holds a committed answer can't take notes, so disable the toggle.
                    val notesEnabled = type == 1
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
                        1 -> {
                            val h = state.hint
                            val step = (h as? HintView.Step)?.step
                            val reveal = h as? HintView.Reveal
                            SudokuBoard(
                                puzzle = puzzle,
                                userValues = state.userValues,
                                liveValidate = state.liveValidate,
                                selectedCell = state.selectedCell,
                                onSelectCell = vm::selectCell,
                                hintFocusCells = step?.focusCells?.map { SudokuHinter.cellKey(it) }?.toSet() ?: emptySet(),
                                hintRevealCell = reveal?.let { SudokuHinter.cellKey(it.cell) },
                                hintElimCells = step?.eliminations?.map { SudokuHinter.cellKey(it.cell) }?.toSet() ?: emptySet(),
                                hintStrikes = step?.eliminations
                                    ?.associate { SudokuHinter.cellKey(it.cell) to it.digits.toSet() }
                                    ?: emptyMap(),
                            )
                            HintControls(hint = h, onRequest = vm::requestHint, onApply = vm::applyHint, onClear = vm::clearHint)
                        }
                        12 -> KakuroBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            liveValidate = state.liveValidate,
                            selectedCell = state.selectedCell,
                            onSelectCell = vm::selectCell,
                        )
                        7 -> MasyuBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            liveValidate = state.liveValidate,
                            onSetEdge = vm::setUserValue,
                        )
                        5 -> SlitherlinkBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            // Edges are tri-state (0 empty, 1 line, 2 cross); putUserValue
                            // sets the explicit state and drops the key when it cycles to 0.
                            onCycleEdge = { key, next -> vm.putUserValue(key, next) },
                        )
                        // Shade/mark puzzles (LITS, Nurikabe, Nuritwin, Nurimaze) all share
                        // tap-to-cycle input: the engine decides what a tap covers (one cell,
                        // a whole room, or nothing for a clue) and tapShadeCell applies it.
                        3 -> NurimazeBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onTapCell = vm::tapShadeCell,
                        )
                        9 -> NuritwinBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onTapCell = vm::tapShadeCell,
                        )
                        23 -> NorinoriBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onTapCell = vm::tapShadeCell,
                        )
                        14 -> {
                            var fillominoMode by remember(puzzle.id) { mutableStateOf(FillominoMode.NUMBER) }
                            FillominoBoard(
                                puzzle = puzzle,
                                userValues = state.userValues,
                                mode = fillominoMode,
                                selectedCell = state.selectedCell,
                                onSelectCell = vm::selectCell,
                                onSetEdge = vm::setUserValue,
                            )
                            // Number / Wall input-mode toggle (one is numbers, the other
                            // draws room borders). Leaving Number mode drops any cell
                            // selection so the digit pad hides.
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                FilterChip(
                                    selected = fillominoMode == FillominoMode.NUMBER,
                                    onClick = { fillominoMode = FillominoMode.NUMBER },
                                    label = { Text("Number") },
                                )
                                FilterChip(
                                    selected = fillominoMode == FillominoMode.WALL,
                                    onClick = {
                                        fillominoMode = FillominoMode.WALL
                                        vm.selectCell(null)
                                    },
                                    label = { Text("Wall") },
                                )
                            }
                        }
                        17 -> NumberLinkBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            // Edge-based paths keyed "h:r,c"/"v:r,c"; putUserValue writes the
                            // segment and drops the key when it's erased (0).
                            onSetEdge = { key, state -> vm.putUserValue(key, state) },
                        )
                        19 -> HellGolfBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onPutValue = vm::putUserValue,
                        )
                        20 -> TentaishowBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            // Walls keyed "h:r,c"/"v:r,c" -> 1 (web convention); setUserValue
                            // drops the key when a wall is toggled off.
                            onSetEdge = vm::setUserValue,
                        )
                        25 -> RippleEffectBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            // The room partition is fixed in the canon, so there's no wall
                            // mode: tap a non-clue cell to select it, then the DigitBar
                            // enters a (multi-digit) value keyed "col,row".
                            selectedCell = state.selectedCell,
                            onSelectCell = vm::selectCell,
                        )
                        22 -> ShikakuBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            // Rectangles keyed "rect:r,c" -> encodeWH(w,h); draw/resize/erase
                            // apply as an atomic batch (a 0 value drops the key), so a resize
                            // that moves the top-left can retire the old key in one update.
                            onApplyChanges = vm::putUserValues,
                        )
                        11 -> ShakashakaBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            // Triangles/marks keyed "col,row" -> 1..5; the board picks the
                            // next state from the tapped quadrant, putUserValue drops 0.
                            onPutValue = vm::putUserValue,
                        )
                        24 -> NurikabeBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onTapCell = vm::tapShadeCell,
                        )
                        26 -> HitoriBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onTapCell = vm::tapShadeCell,
                        )
                        18 -> AkariBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            liveValidate = state.liveValidate,
                            onTapCell = vm::tapShadeCell,
                        )
                        6 -> {
                            var nonogramMode by remember(puzzle.id) { mutableStateOf(NonogramMode.FILL) }
                            // Reverse (undo/redo) controls sit ABOVE the board — the Nonogram
                            // pilot steps back and forth through the last 100 moves, and these
                            // are kept clear of the frequently-tapped Fill/Cross chips below.
                            // A FlowRow so the check chip wraps below on narrow phones.
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = vm::undo, enabled = state.canUndo) { Text("↶ Undo") }
                                OutlinedButton(onClick = vm::redo, enabled = state.canRedo) { Text("↷ Redo") }
                                // Sits with undo/redo on purpose: with it on, step back until it
                                // reads "On track" to land on the move where a mistake began.
                                SolutionCheckChip(
                                    puzzle = puzzle,
                                    userValues = state.userValues,
                                    enabled = state.solutionCheck,
                                    onToggle = vm::toggleSolutionCheck,
                                    modifier = Modifier.align(Alignment.CenterVertically),
                                )
                            }
                            NonogramBoard(
                                puzzle = puzzle,
                                userValues = state.userValues,
                                liveValidate = state.liveValidate,
                                mode = nonogramMode,
                                onSetCell = vm::setCellState,
                                // Group a whole drag into one reverse (undo/redo) step.
                                onStrokeStart = vm::beginStroke,
                                onStrokeEnd = vm::endStroke,
                            )
                            // Fill / cross paint-mode toggle (touch has no right-click), kept
                            // next to the board where paint-mode switching happens.
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                FilterChip(
                                    selected = nonogramMode == NonogramMode.FILL,
                                    onClick = { nonogramMode = NonogramMode.FILL },
                                    label = { Text("■ Fill") },
                                )
                                FilterChip(
                                    selected = nonogramMode == NonogramMode.CROSS,
                                    onClick = { nonogramMode = NonogramMode.CROSS },
                                    label = { Text("✕ Cross") },
                                )
                            }
                        }
                        15 -> LitsBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onTapCell = vm::tapShadeCell,
                        )
                        // Yajilin: a tap shades (shared shade/mark cycle), a drag draws the
                        // loop; a loop step and the marks it clears land as one batch.
                        // Slalom: drag-only trail drawing ("h:r,c"/"v:r,c" -> 1), applied
                        // as batches like Yajilin's loop.
                        10 -> SlalomBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onApplyChanges = vm::putUserValues,
                        )
                        13 -> YajilinBoard(
                            puzzle = puzzle,
                            userValues = state.userValues,
                            onTapCell = vm::tapShadeCell,
                            onApplyChanges = vm::putUserValues,
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

/**
 * Offline Sudoku hint affordance (docs/auto-solve): a "Hint" button, and when a hint is
 * showing, an explanation card with an apply action for placements/reveals. Fully
 * client-side — works in airplane mode.
 */
@Composable
private fun HintControls(
    hint: HintView?,
    onRequest: () -> Unit,
    onApply: () -> Unit,
    onClear: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onRequest) { Text("Hint") }
            if (hint != null) {
                TextButton(onClick = onClear) { Text("Clear hint") }
            }
        }

        if (hint == null) return@Column
        val explanation: String
        val applyLabel: String?
        when (hint) {
            is HintView.Step -> {
                explanation = hint.step.explanation
                applyLabel = if (hint.step.placement != null) "Place it" else null
            }
            is HintView.Reveal -> {
                explanation = "No simple next step was found. The answer here is ${hint.value}."
                applyLabel = "Fill it in"
            }
            is HintView.Message -> {
                explanation = hint.text
                applyLabel = null
            }
        }

        Card(
            Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
        ) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(explanation, style = MaterialTheme.typography.bodyMedium)
                if (applyLabel != null) {
                    Button(onClick = onApply) { Text(applyLabel) }
                }
            }
        }
    }
}

/**
 * Toggle for the "on track" check (PuzzleEngine.matchesSolution): when on, it reads
 * whether every mark so far agrees with the stored solution, without saying where it
 * doesn't. Hidden when the puzzle has no stored solution to check against.
 */
@Composable
private fun SolutionCheckChip(
    puzzle: Puzzle,
    userValues: Map<String, Int>,
    enabled: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val engine = PuzzleEngines.forType(puzzle.puzzleType) ?: return
    // An empty board always agrees with a solution, so null here means "no check".
    if (engine.matchesSolution(puzzle, emptyMap()) == null) return
    // Computed only while the check is on, so an off toggle never peeks at the answer.
    val onTrack = if (enabled) engine.matchesSolution(puzzle, userValues) else null
    FilterChip(
        selected = enabled,
        onClick = onToggle,
        modifier = modifier,
        label = {
            when (onTrack) {
                true -> Text("✓ On track", color = ON_TRACK, fontWeight = FontWeight.Bold)
                false -> Text("✗ Off track", color = OFF_TRACK, fontWeight = FontWeight.Bold)
                null -> Text("Check: Off")
            }
        },
    )
}

private val ON_TRACK = Color(0xFF2E7D32)
private val OFF_TRACK = Color(0xFFC62828)

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
