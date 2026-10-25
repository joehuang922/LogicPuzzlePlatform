package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.AdminRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminBrowseUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val collections: List<Collection> = emptyList(),
    // The expanded collection and its questions.
    val expandedId: Int? = null,
    val puzzles: List<Puzzle> = emptyList(),
    val loadingPuzzles: Boolean = false,
    val puzzlesError: String? = null,
)

/**
 * The Admin collection browser, the Android counterpart of the web admin's
 * CollectionBrowser: every collection (plus the uncollected default one), expandable
 * to its questions, each of which opens the question editor. Reads the server, not
 * Room, so it lists what's live, including questions on collections not downloaded.
 */
class AdminBrowseViewModel(
    private val repo: AdminRepository = ServiceLocator.adminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminBrowseUiState())
    val state: StateFlow<AdminBrowseUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(loading = it.collections.isEmpty(), error = null) }
        viewModelScope.launch {
            try {
                val collections = repo.listBrowsableCollections()
                _state.update { it.copy(loading = false, collections = collections) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = repo.serverMessage(e)) }
            }
        }
    }

    /**
     * Re-read the collection counts and the open collection's questions — on returning
     * from the editor, so a save or delete shows at once. Quiet: the lists stay up.
     */
    fun refresh() {
        if (_state.value.loading) return
        load()
        _state.value.expandedId?.let { loadPuzzles(it, quiet = true) }
    }

    fun toggle(collectionId: Int) {
        if (_state.value.expandedId == collectionId) {
            _state.update { it.copy(expandedId = null, puzzles = emptyList(), puzzlesError = null) }
            return
        }
        _state.update { it.copy(expandedId = collectionId, puzzles = emptyList(), puzzlesError = null) }
        loadPuzzles(collectionId, quiet = false)
    }

    private fun loadPuzzles(collectionId: Int, quiet: Boolean) {
        if (!quiet) _state.update { it.copy(loadingPuzzles = true) }
        viewModelScope.launch {
            try {
                // Grouped by type, then by title, as Home lists a collection.
                val puzzles = repo.listCollectionPuzzles(collectionId).sortedWith(
                    compareBy<Puzzle> { it.puzzleType }.thenBy { it.title?.lowercase() ?: "" }
                )
                _state.update {
                    if (it.expandedId != collectionId) it
                    else it.copy(loadingPuzzles = false, puzzles = puzzles, puzzlesError = null)
                }
            } catch (e: Exception) {
                _state.update {
                    if (it.expandedId != collectionId) it
                    else it.copy(loadingPuzzles = false, puzzlesError = repo.serverMessage(e))
                }
            }
        }
    }
}
