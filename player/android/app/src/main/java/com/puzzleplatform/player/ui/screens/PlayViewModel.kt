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
)

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
                _state.update {
                    it.copy(
                        loading = false,
                        puzzle = puzzle,
                        userValues = values,
                        elapsedSeconds = elapsed,
                        progress = progress,
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

    fun enterDigit(digit: Int) {
        val cell = _state.value.selectedCell ?: return
        updateValues(_state.value.userValues + (cell to digit), clearSelection = true)
    }

    fun clearCell() {
        val cell = _state.value.selectedCell ?: return
        updateValues(_state.value.userValues - cell, clearSelection = true)
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
            )
        }
        // Auto-complete on a full, conflict-free grid (mirrors SudokuBoard.tsx onComplete).
        if (!completed && eng is SudokuEngine && eng.isComplete(puzzle, newValues)) {
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

    override fun onCleared() {
        timerJob?.cancel()
        super.onCleared()
    }
}
