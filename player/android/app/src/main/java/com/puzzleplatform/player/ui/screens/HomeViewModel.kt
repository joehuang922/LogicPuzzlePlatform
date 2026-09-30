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
import com.puzzleplatform.player.data.sync.SyncManager
import com.puzzleplatform.player.puzzle.PuzzleEngines
import com.puzzleplatform.player.puzzle.PuzzleThumbnail
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject

data class HomeUiState(
    val loading: Boolean = true,
    // True only while a first-launch load is blocked on the network (no local cache
    // yet). Drives the "waking up the server" hint, since a cold Aurora is slow.
    val waking: Boolean = false,
    val refreshing: Boolean = false,
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
    // Solved-picture previews, lazily loaded per visible row (see loadThumbnail).
    val thumbnails: Map<String, PuzzleThumbnail> = emptyMap(),
    // Start-puzzle dialog
    val selectedPuzzle: Puzzle? = null,
    val hasPreviousAttempts: Boolean = false,
    // Previous-attempts dialog
    val previousAttempts: List<Attempt>? = null,
    // Offline availability
    val downloadedCollectionIds: Set<Int> = emptySet(),
    val downloadingCollectionIds: Set<Int> = emptySet(),
)

class HomeViewModel(
    private val repo: PuzzleRepository = ServiceLocator.repository,
    private val syncManager: SyncManager = ServiceLocator.syncManager,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()

    init {
        load()
        observeDownloads()
    }

    private fun observeDownloads() {
        viewModelScope.launch {
            syncManager.downloadedCollectionIds.collect { ids ->
                _state.update { it.copy(downloadedCollectionIds = ids.toSet()) }
            }
        }
    }

    /** Download a collection for offline play, then refresh Home progress. */
    fun downloadCollection(collectionId: Int) {
        if (_state.value.downloadingCollectionIds.contains(collectionId)) return
        _state.update { it.copy(downloadingCollectionIds = it.downloadingCollectionIds + collectionId) }
        viewModelScope.launch {
            try {
                repo.downloadCollection(collectionId)
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "Download failed") }
            } finally {
                _state.update { it.copy(downloadingCollectionIds = it.downloadingCollectionIds - collectionId) }
            }
        }
    }

    /**
     * Cache-first startup. Paints from Room immediately so a cold backend never blocks
     * the first render (the local-first promise), then refreshes reference data from the
     * network in the background. Only a genuine first launch — nothing cached yet —
     * falls through to a blocking network load, flagged [waking] so the UI can explain
     * the wait (Aurora Serverless cold-starts in ~10-25s).
     */
    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val puzzles = repo.listRecentlyPlayed(limit = 3)
            val cachedCollections = repo.getCachedCollections()
            val cachedTypes = repo.getCachedPuzzleTypes()

            if (cachedCollections.isNotEmpty() || cachedTypes.isNotEmpty() || puzzles.isNotEmpty()) {
                // Have something local: render now, then refresh in the background.
                val progress = if (cachedCollections.isNotEmpty()) {
                    repo.getCollectionProgress(cachedCollections.map { it.id }).associateBy { it.collectionId }
                } else emptyMap()
                _state.update {
                    it.copy(
                        loading = false,
                        puzzles = puzzles,
                        collections = cachedCollections,
                        puzzleTypes = cachedTypes,
                        collectionProgress = progress,
                    )
                }
                backgroundRefreshReferenceData()
            } else {
                // First launch, empty cache: we must hit the network. Flag the wait.
                _state.update { it.copy(waking = true) }
                try {
                    fetchHome()
                    _state.update { it.copy(loading = false, waking = false) }
                } catch (e: Exception) {
                    _state.update { it.copy(loading = false, waking = false, error = e.message ?: "Failed to load") }
                }
            }
        }
    }

    /**
     * Refresh reference data (collections, types, progress) from the network after a
     * cache-first paint, updating state when it lands. Silent on failure: the cached
     * data already shown stays put, keeping the app usable offline.
     */
    private fun backgroundRefreshReferenceData() {
        viewModelScope.launch {
            try {
                fetchHome()
            } catch (_: Exception) {
                // Offline or cold-start timeout; the cached lists remain on screen.
            }
        }
    }

    /**
     * Pull-to-refresh: pull down server-side puzzle edits for every downloaded
     * collection, then re-read Home. This is the app's primary trigger for content
     * updates reaching the device (see PuzzleRepository.refreshDownloadedCollections).
     * If a collection is currently expanded, its puzzle list is refreshed too, so an
     * edited/added/removed puzzle shows immediately.
     */
    fun refresh() {
        if (_state.value.refreshing) return
        _state.update { it.copy(refreshing = true, error = null) }
        viewModelScope.launch {
            try {
                repo.refreshDownloadedCollections()
                fetchHome()
                _state.value.expandedCollectionId?.let { reloadCollectionPuzzles(it) }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message ?: "Refresh failed") }
            } finally {
                _state.update { it.copy(refreshing = false) }
            }
        }
    }

    /** Load the Home lists (Latest + collections + progress) into state. */
    private suspend fun fetchHome() {
        // "Latest" shows the puzzles the player most recently worked on
        // (by latest snapshot), capped at 3.
        val puzzles = repo.listRecentlyPlayed(limit = 3)
        val collections = repo.listCollections()
        val types = repo.listPuzzleTypes()
        val progress = if (collections.isNotEmpty()) {
            repo.getCollectionProgress(collections.map { it.id }).associateBy { it.collectionId }
        } else emptyMap()
        _state.update {
            it.copy(
                puzzles = puzzles,
                collections = collections,
                puzzleTypes = types,
                collectionProgress = progress,
            )
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
                reloadCollectionPuzzles(collectionId)
            } catch (e: Exception) {
                _state.update { it.copy(loadingCollectionPuzzles = false, error = e.message) }
            }
        }
    }

    /** Load and sort one collection's puzzles + solved/attempted state into UI state. */
    private suspend fun reloadCollectionPuzzles(collectionId: Int) {
        // Order the collection's puzzles by type, then by title, so like
        // puzzles group together and read alphabetically within a type.
        val puzzles = repo.listPuzzles(srcCollection = collectionId.toString())
            .sortedWith(
                compareBy<Puzzle> { it.puzzleType }
                    .thenBy { it.title?.lowercase() ?: "" }
            )
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
    }

    // Puzzle ids whose thumbnail has been requested this session, so a row that
    // recomposes (scroll, re-expand) doesn't re-dispatch the load. The repo memoizes
    // the derived image itself; this just avoids redundant coroutine launches.
    private val requestedThumbnails = mutableSetOf<String>()

    /**
     * Lazily load one solved puzzle's picture thumbnail, invoked by a collection row
     * the first time it composes. No-op for a puzzle that isn't solved or whose type
     * has no picture — the repo returns nothing and the row shows its plain ✓ marker.
     */
    fun loadThumbnail(puzzleId: String) {
        if (!requestedThumbnails.add(puzzleId)) return
        viewModelScope.launch {
            try {
                val thumbs = repo.getSolvedThumbnails(listOf(puzzleId))
                val thumb = thumbs[puzzleId] ?: return@launch
                _state.update { it.copy(thumbnails = it.thumbnails + (puzzleId to thumb)) }
            } catch (_: Exception) {
                // A missing thumbnail is non-fatal; allow a later retry.
                requestedThumbnails.remove(puzzleId)
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
