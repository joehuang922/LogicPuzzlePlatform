package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.PuzzleRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.AchievementUnlock
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.SnapshotSummary
import com.puzzleplatform.player.puzzle.PuzzleEngine
import com.puzzleplatform.player.puzzle.PuzzleEngines
import com.puzzleplatform.player.puzzle.SudokuEngine
import com.puzzleplatform.player.puzzle.SudokuHinter
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PlayUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val puzzle: Puzzle? = null,
    val userValues: Map<String, Int> = emptyMap(),
    val selectedCell: String? = null,
    val noteMode: Boolean = false,
    val liveValidate: Boolean = false,
    val progress: Double = 0.0,
    val elapsedSeconds: Int = 0,
    val saving: Boolean = false,
    val toast: String? = null,
    // Load-previous dialog
    val snapshots: List<SnapshotSummary>? = null,
    // Completion dialog
    val showCongrats: Boolean = false,
    val finalTime: Int = 0,
    val newAchievements: List<AchievementUnlock> = emptyList(),
    val completionError: String? = null,
    val retrying: Boolean = false,
    // Non-destructive notice: the puzzle was edited server-side since this
    // attempt started. Current progress stays playable; reload is opt-in.
    val puzzleEdited: Boolean = false,
    val reloading: Boolean = false,
    // Offline Sudoku hint (docs/auto-solve). Null when none is being shown.
    val hint: HintView? = null,
)

/**
 * A hint surfaced to the player. Mirrors the web client's HintView:
 *  - [Step] a teachable technique (highlight focus cells, optional placement/eliminations),
 *  - [Reveal] the solution-backed "give up" fallback (one correct cell),
 *  - [Message] an informational note (e.g. conflicts present, or no step available).
 */
sealed interface HintView {
    data class Step(val step: SudokuHinter.Step) : HintView
    data class Reveal(val cell: Int, val value: Int) : HintView
    data class Message(val text: String) : HintView
}

class PlayViewModel(
    private val puzzleId: String,
    private val attemptId: String,
    private val repo: PuzzleRepository = ServiceLocator.repository,
) : ViewModel() {

    private val _state = MutableStateFlow(PlayUiState())
    val state: StateFlow<PlayUiState> = _state.asStateFlow()

    private var timerJob: Job? = null
    private var completed = false

    private val engine: PuzzleEngine?
        get() = _state.value.puzzle?.let { PuzzleEngines.forType(it.puzzleType) }

    init { load() }

    private fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val puzzle = repo.getPuzzle(puzzleId)
                // Restore the latest snapshot for this attempt, if any.
                val restored = try {
                    val snapshot = repo.getAttemptSnapshot(attemptId)
                    val eng = PuzzleEngines.forType(puzzle.puzzleType)
                    val values = eng?.restoreUserValues(puzzle, repo.parseAnswer(snapshot.currentAnswer)) ?: emptyMap()
                    values to snapshot.elapsedSeconds
                } catch (_: Exception) {
                    emptyMap<String, Int>() to 0
                }
                val (values, elapsed) = restored
                val progress = PuzzleEngines.forType(puzzle.puzzleType)?.computeProgress(puzzle, values) ?: 0.0
                val edited = try {
                    repo.isPuzzleEditedSinceAttempt(puzzleId, attemptId)
                } catch (_: Exception) {
                    false
                }
                _state.update {
                    it.copy(
                        loading = false,
                        puzzle = puzzle,
                        userValues = values,
                        elapsedSeconds = elapsed,
                        progress = progress,
                        puzzleEdited = edited,
                    )
                }
                startTimer()
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Failed to load puzzle") }
            }
        }
    }

    private fun startTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                _state.update { it.copy(elapsedSeconds = it.elapsedSeconds + 1) }
            }
        }
    }

    fun selectCell(key: String?) = _state.update { it.copy(selectedCell = key) }

    fun toggleLiveValidate() = _state.update { it.copy(liveValidate = !it.liveValidate) }

    fun toggleNoteMode() = _state.update { it.copy(noteMode = !it.noteMode) }

    /**
     * Compute and show the next offline hint for Sudoku (type 1). Prefers a teachable
     * technique; falls back to a solution-backed reveal of one correct cell; otherwise
     * shows an informational message. No-op for types without a hinter.
     */
    fun requestHint() {
        val puzzle = _state.value.puzzle ?: return
        if (puzzle.puzzleType != SudokuEngine.puzzleType) return
        val values = _state.value.userValues

        // A contradictory board makes candidate reasoning meaningless; ask the player to
        // fix conflicts first (mirrors the web client's guard).
        if (SudokuEngine.findConflicts(puzzle, values).isNotEmpty()) {
            _state.update {
                it.copy(hint = HintView.Message("Fix the conflicting cells first, then ask for a hint."))
            }
            return
        }

        val step = SudokuHinter.nextHint(puzzle, values)
        if (step != null) {
            _state.update { it.copy(hint = HintView.Step(step)) }
            return
        }

        // No logical step: reveal one correct cell from the stored solution, if any.
        val reveal = firstRevealCell(puzzle, values)
        _state.update {
            it.copy(
                hint = reveal
                    ?: HintView.Message("No simple next step from here — try a different cell, or keep going."),
            )
        }
    }

    /**
     * The first empty, non-hint cell whose stored-solution digit is known — the "give up"
     * reveal target. Null when the puzzle has no stored solution or the board is full.
     */
    private fun firstRevealCell(puzzle: Puzzle, values: Map<String, Int>): HintView.Reveal? {
        val solution = SudokuEngine.parseSolution(puzzle) ?: return null
        val hints = SudokuEngine.parseHints(puzzle)
        for (id in 0 until 81) {
            val row = id / 9
            val col = id % 9
            if (hints[row][col] != 0) continue
            if ((values["$col,$row"] ?: 0) > 0) continue
            val value = solution[row][col]
            if (value > 0) return HintView.Reveal(id, value)
        }
        return null
    }

    /** Commit a hint's placement (a step placement or a reveal) and dismiss the hint. */
    fun applyHint() {
        val placement: SudokuHinter.Placement = when (val hint = _state.value.hint) {
            is HintView.Reveal -> SudokuHinter.Placement(hint.cell, hint.value)
            is HintView.Step -> hint.step.placement ?: return
            else -> return // Message or null: nothing to apply
        }
        val col = placement.cell % 9
        val row = placement.cell / 9
        val key = "$col,$row"
        val values = _state.value.userValues
        // Commit the digit and clear that cell's pencil marks (matches enterDigit).
        val next = values.filterKeys { !it.startsWith("n:$key:") } + (key to placement.value)
        _state.update { it.copy(hint = null) }
        updateValues(next, clearSelection = true)
    }

    fun clearHint() = _state.update { it.copy(hint = null) }

    /** A committed answer sits at "col,row"; a cell with one can't take notes. */
    private fun cellHasAnswer(values: Map<String, Int>, cell: String): Boolean =
        (values[cell] ?: 0) > 0

    fun enterDigit(digit: Int) {
        val cell = _state.value.selectedCell ?: return
        val values = _state.value.userValues
        if (_state.value.noteMode && !cellHasAnswer(values, cell)) {
            // Toggle the pencil mark; keep the cell selected so several can be marked.
            val key = SudokuEngine.noteKey(cell.split(",")[0].toInt(), cell.split(",")[1].toInt(), digit)
            val next = if (values[key] == 1) values - key else values + (key to 1)
            updateValues(next, clearSelection = false)
            return
        }
        // Answer mode: commit the digit and clear that cell's pencil marks.
        val next = (values.filterKeys { !it.startsWith("n:$cell:") }) + (cell to digit)
        updateValues(next, clearSelection = true)
    }

    /**
     * Set or clear a single flat userValues entry. Used by loop/edge puzzles
     * (e.g. Masyu) whose input is drag-to-draw rather than tap-to-enter-a-digit:
     * the board decides the exact key ("h:r,c" / "v:r,c") and whether it's on.
     */
    fun setUserValue(key: String, on: Boolean) {
        val values = _state.value.userValues
        val next = if (on) values + (key to 1) else values - key
        if (next == values) return
        updateValues(next, clearSelection = false)
    }

    /**
     * Set a "col,row" cell to an explicit state, removing the key when [state] is 0.
     * Used by multi-state paint puzzles (e.g. Nonogram: 1 = filled, 2 = crossed) whose
     * input is drag-to-paint rather than digit entry.
     */
    fun setCellState(col: Int, row: Int, state: Int) {
        val key = "$col,$row"
        val values = _state.value.userValues
        val next = if (state == 0) values - key else values + (key to state)
        if (next == values) return
        updateValues(next, clearSelection = false)
    }

    fun clearCell() {
        val cell = _state.value.selectedCell ?: return
        val values = _state.value.userValues
        if (_state.value.noteMode && !cellHasAnswer(values, cell)) {
            updateValues(values.filterKeys { !it.startsWith("n:$cell:") }, clearSelection = false)
            return
        }
        updateValues(values - cell, clearSelection = true)
    }

    private fun updateValues(newValues: Map<String, Int>, clearSelection: Boolean) {
        val puzzle = _state.value.puzzle ?: return
        val eng = engine
        val progress = eng?.computeProgress(puzzle, newValues) ?: 0.0
        _state.update {
            it.copy(
                userValues = newValues,
                progress = progress,
                selectedCell = if (clearSelection) null else it.selectedCell,
                // The board moved on; a previously-shown hint may no longer apply.
                hint = null,
            )
        }
        // Auto-complete on a full, valid solution (mirrors the web boards' onComplete).
        if (!completed && eng != null && eng.isComplete(puzzle, newValues)) {
            handleComplete()
        }
    }

    fun save() {
        val puzzle = _state.value.puzzle ?: return
        val eng = engine ?: return
        _state.update { it.copy(saving = true) }
        viewModelScope.launch {
            try {
                repo.saveSnapshot(
                    attemptId = attemptId,
                    currentAnswer = eng.extractAnswer(puzzle, _state.value.userValues),
                    progress = _state.value.progress / 100.0,
                    elapsedSeconds = _state.value.elapsedSeconds,
                )
                _state.update { it.copy(saving = false, toast = "Progress saved.") }
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, toast = "Save failed: ${e.message}") }
            }
        }
    }

    fun clearToast() = _state.update { it.copy(toast = null) }

    fun openLoadDialog() {
        viewModelScope.launch {
            try {
                val snaps = repo.listSnapshots(attemptId)
                _state.update { it.copy(snapshots = snaps) }
            } catch (e: Exception) {
                _state.update { it.copy(toast = "Failed to list snapshots: ${e.message}") }
            }
        }
    }

    fun dismissLoadDialog() = _state.update { it.copy(snapshots = null) }

    fun loadSnapshot(snapshotId: String) {
        val puzzle = _state.value.puzzle ?: return
        val eng = engine ?: return
        viewModelScope.launch {
            try {
                val snap = repo.getSnapshotById(attemptId, snapshotId)
                val values = eng.restoreUserValues(puzzle, repo.parseAnswer(snap.currentAnswer))
                completed = false
                _state.update {
                    it.copy(
                        userValues = values,
                        elapsedSeconds = snap.elapsedSeconds,
                        progress = eng.computeProgress(puzzle, values),
                        snapshots = null,
                        selectedCell = null,
                        showCongrats = false,
                        hint = null,
                    )
                }
                startTimer()
            } catch (e: Exception) {
                _state.update { it.copy(toast = "Load failed: ${e.message}") }
            }
        }
    }

    private fun handleComplete() {
        if (completed) return
        completed = true
        timerJob?.cancel()
        val finalTime = _state.value.elapsedSeconds
        _state.update { it.copy(finalTime = finalTime, showCongrats = true) }
        persistCompletion(finalTime)
    }

    private fun persistCompletion(finalTime: Int) {
        val puzzle = _state.value.puzzle ?: return
        val eng = engine ?: return
        viewModelScope.launch {
            try {
                val result = repo.saveSnapshot(
                    attemptId = attemptId,
                    currentAnswer = eng.extractAnswer(puzzle, _state.value.userValues),
                    progress = _state.value.progress / 100.0,
                    elapsedSeconds = finalTime,
                    finished = true,
                )
                _state.update { it.copy(newAchievements = result.newAchievements, completionError = null) }
            } catch (e: Exception) {
                _state.update { it.copy(completionError = e.message ?: "Save failed") }
            }
        }
    }

    fun retryCompletion() {
        _state.update { it.copy(retrying = true) }
        viewModelScope.launch {
            persistCompletion(_state.value.finalTime)
            _state.update { it.copy(retrying = false) }
        }
    }

    fun dismissCongrats() = _state.update { it.copy(showCongrats = false) }

    /** Dismiss the edited-puzzle notice; the current attempt stays as-is. */
    fun dismissEditedNotice() = _state.update { it.copy(puzzleEdited = false) }

    /**
     * Opt-in reload: start a fresh attempt on the updated puzzle and hand its
     * ids back via [onReady] so the caller can navigate. The old attempt and its
     * progress are never touched.
     */
    fun reloadUpdatedPuzzle(onReady: (puzzleId: String, attemptId: String) -> Unit) {
        val puzzle = _state.value.puzzle ?: return
        _state.update { it.copy(reloading = true) }
        viewModelScope.launch {
            try {
                val engine = PuzzleEngines.forType(puzzle.puzzleType)
                val initial = engine?.extractAnswer(puzzle, emptyMap()) ?: kotlinx.serialization.json.JsonObject(emptyMap())
                val result = repo.createAttempt(puzzle.id, initial)
                _state.update { it.copy(reloading = false, puzzleEdited = false) }
                onReady(puzzle.id, result.attemptId)
            } catch (e: Exception) {
                _state.update { it.copy(reloading = false, toast = "Reload failed: ${e.message}") }
            }
        }
    }

    override fun onCleared() {
        timerJob?.cancel()
        super.onCleared()
    }
}
