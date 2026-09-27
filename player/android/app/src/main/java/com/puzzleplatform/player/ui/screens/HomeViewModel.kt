package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.PuzzleRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.Attempt
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CollectionProgress
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.PuzzleType
import com.puzzleplatform.player.puzzle.PuzzleEngines
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

data class HomeUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val puzzles: List<Puzzle> = emptyList(),
    val collections: List<Collection> = emptyList(),
    val puzzleTypes: List<PuzzleType> = emptyList(),
    val collectionProgress: Map<Int, CollectionProgress> = emptyMap(),
    // Expanded collection state
    val expandedCollectionId: Int? = null,
    val collectionPuzzles: List<Puzzle> = emptyList(),
    val loadingCollectionPuzzles: Boolean = false,
    val solvedPuzzleIds: Set<String> = emptySet(),
    val attemptedPuzzleIds: Set<String> = emptySet(),
    // Start-puzzle dialog
    val selectedPuzzle: Puzzle? = null,
    val hasPreviousAttempts: Boolean = false,
    // Previous-attempts dialog
    val previousAttempts: List<Attempt>? = null,
)

class HomeViewModel(
    private val repo: PuzzleRepository = ServiceLocator.repository,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val puzzles = repo.listPuzzles(limit = 10)
                val collections = repo.listCollections()
                val types = repo.listPuzzleTypes()
                val progress = if (collections.isNotEmpty()) {
                    repo.getCollectionProgress(collections.map { it.id }).associateBy { it.collectionId }
                } else emptyMap()
                _state.update {
                    it.copy(
                        loading = false,
                        puzzles = puzzles,
                        collections = collections,
                        puzzleTypes = types,
                        collectionProgress = progress,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Failed to load") }
            }
        }
    }

    fun toggleCollection(collectionId: Int) {
        if (_state.value.expandedCollectionId == collectionId) {
            _state.update { it.copy(expandedCollectionId = null) }
            return
        }
        _state.update {
            it.copy(expandedCollectionId = collectionId, loadingCollectionPuzzles = true, collectionPuzzles = emptyList())
        }
        viewModelScope.launch {
            try {
                val puzzles = repo.listPuzzles(srcCollection = collectionId.toString())
                val solved = repo.getSolvedQuestions(puzzles.map { it.id })
                _state.update { s ->
                    s.copy(
                        loadingCollectionPuzzles = false,
                        collectionPuzzles = puzzles,
                        solvedPuzzleIds = solved.solvedQuestions.toSet(),
                        attemptedPuzzleIds = solved.attemptedQuestions.toSet(),
                        collectionProgress = s.collectionProgress + (collectionId to
                            CollectionProgress(collectionId, puzzles.size, solved.solvedQuestions.size)),
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loadingCollectionPuzzles = false, error = e.message) }
            }
        }
    }

    fun selectPuzzle(puzzle: Puzzle) {
        _state.update { it.copy(selectedPuzzle = puzzle, hasPreviousAttempts = false) }
        viewModelScope.launch {
            try {
                val attempts = repo.listAttempts(puzzle.id)
                _state.update { it.copy(hasPreviousAttempts = attempts.isNotEmpty()) }
            } catch (_: Exception) { /* dialog still usable for New Attempt */ }
        }
    }

    fun dismissDialogs() {
        _state.update { it.copy(selectedPuzzle = null, previousAttempts = null) }
    }

    /** Create a fresh attempt and return its id via [onReady]. */
    fun startNewAttempt(onReady: (puzzleId: String, attemptId: String) -> Unit) {
        val puzzle = _state.value.selectedPuzzle ?: return
        viewModelScope.launch {
            try {
                val engine = PuzzleEngines.forType(puzzle.puzzleType)
                val initial: JsonObject = engine?.extractAnswer(puzzle, emptyMap()) ?: JsonObject(emptyMap())
                val result = repo.createAttempt(puzzle.id, initial)
                _state.update { it.copy(selectedPuzzle = null) }
                onReady(puzzle.id, result.attemptId)
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "Failed to start attempt") }
            }
        }
    }

    fun loadPreviousAttempts() {
        val puzzle = _state.value.selectedPuzzle ?: return
        viewModelScope.launch {
            try {
                val attempts = repo.listAttempts(puzzle.id)
                _state.update { it.copy(previousAttempts = attempts, selectedPuzzle = puzzle) }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message) }
            }
        }
    }

    /** Open an existing attempt. The Play screen restores its own snapshot. */
    fun openAttempt(attemptId: String, onReady: (puzzleId: String, attemptId: String) -> Unit) {
        val puzzle = _state.value.selectedPuzzle ?: return
        _state.update { it.copy(previousAttempts = null, selectedPuzzle = null) }
        onReady(puzzle.id, attemptId)
    }

    fun isSupported(puzzleType: Int) = PuzzleEngines.isSupported(puzzleType)
}
