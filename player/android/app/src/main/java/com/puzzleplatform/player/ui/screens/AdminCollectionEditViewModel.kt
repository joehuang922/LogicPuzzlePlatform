package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.AdminRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.api.retryServerErrors
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.UpdatePuzzleRequest
import com.puzzleplatform.player.puzzle.TitleNormalize
import com.puzzleplatform.player.data.model.UpdateCollectionRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

data class AdminCollectionEditUiState(
    val loading: Boolean = true,
    val collections: List<Collection> = emptyList(),
    val loadError: String? = null,
    // The picked collection; null until one is chosen.
    val selectedId: Int? = null,
    val name: String = "",
    val publisher: String = "",
    // Plain YYYY-MM-DD text, as on the create screen.
    val publishAt: String = "",
    val coverSrc: String = "",
    val sealed: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    // Set once the server accepts the edit.
    val saved: Boolean = false,
    val normalizer: TitleNormalizerState? = null,
)

/**
 * The "Normalize titles" panel: the picked collection's questions and the pattern
 * being tried. [puzzles] is null while they load.
 */
data class TitleNormalizerState(
    val puzzles: List<Puzzle>? = null,
    val pattern: String = "",
    val applying: Boolean = false,
    val error: String? = null,
    val message: String? = null,
) {
    val patternError: String? get() = TitleNormalize.patternError(pattern)

    /** Every question's outcome; empty while loading or when the pattern is invalid. */
    val changes: List<TitleNormalize.Change>
        get() = if (puzzles == null || patternError != null) emptyList() else TitleNormalize.normalize(
            puzzles.map { TitleNormalize.Item(it.id, it.puzzleType, it.title) },
            pattern,
        )
}

/**
 * Edit a collection: pick one, change any property, Done saves. Android twin of the
 * web admin's EditCollectionForm. Sealed is set only here: a sealed collection drops
 * out of every create / move-to picker ([CollectionDropdown]) and the API refuses
 * puzzles into it.
 */
// Renames in flight at once; leaves room under the account's 10 concurrent Lambdas.
private const val RENAME_CONCURRENCY = 3

class AdminCollectionEditViewModel(
    private val repo: AdminRepository = ServiceLocator.adminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminCollectionEditUiState())
    val state: StateFlow<AdminCollectionEditUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                val collections = repo.listCollections()
                _state.update { it.copy(loading = false, collections = collections) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, loadError = repo.serverMessage(e)) }
            }
        }
    }

    fun select(id: Int) {
        val c = _state.value.collections.firstOrNull { it.id == id } ?: return
        _state.update {
            it.copy(
                selectedId = c.id,
                name = c.name,
                publisher = c.publisher.orEmpty(),
                publishAt = c.publishAt?.take(10).orEmpty(),
                coverSrc = c.coverSrc.orEmpty(),
                sealed = c.sealed,
                error = null,
                saved = false,
                normalizer = null,
            )
        }
    }

    fun setName(v: String) = _state.update { it.copy(name = v, error = null, saved = false) }
    fun setPublisher(v: String) = _state.update { it.copy(publisher = v, saved = false) }
    fun setPublishAt(v: String) = _state.update { it.copy(publishAt = v, saved = false) }
    fun setCoverSrc(v: String) = _state.update { it.copy(coverSrc = v, saved = false) }
    fun setSealed(v: Boolean) = _state.update { it.copy(sealed = v, saved = false) }

    // --- Title normalizer (twin of the web admin's TitleNormalizer) ---

    /** Load the picked collection's questions and suggest the pattern most already follow. */
    fun openNormalizer() {
        val id = _state.value.selectedId ?: return
        _state.update { it.copy(normalizer = TitleNormalizerState()) }
        viewModelScope.launch {
            try {
                val puzzles = repo.listCollectionPuzzles(id)
                updateNormalizer(id) {
                    it.copy(puzzles = puzzles, pattern = TitleNormalize.suggestPattern(puzzles.map { p -> p.title }))
                }
            } catch (e: Exception) {
                updateNormalizer(id) { it.copy(puzzles = emptyList(), error = repo.serverMessage(e)) }
            }
        }
    }

    fun closeNormalizer() = _state.update { it.copy(normalizer = null) }

    fun setNormalizerPattern(v: String) =
        _state.update { s -> s.copy(normalizer = s.normalizer?.copy(pattern = v, error = null, message = null)) }

    /**
     * Rename every changed question. The PATCH carries all metadata, so each one
     * resends its own author / difficulty / collection / special; no board, so the
     * solver gate doesn't re-run. Refused while any rename would duplicate a title.
     */
    fun applyNormalizer() {
        val id = _state.value.selectedId ?: return
        val n = _state.value.normalizer ?: return
        val puzzles = n.puzzles ?: return
        if (n.applying) return
        val changes = n.changes
        if (changes.any { it.conflict }) return
        val byId = puzzles.associateBy { it.id }
        val renames = changes.filter { it.renamed }
        if (renames.isEmpty()) return
        _state.update { it.copy(normalizer = n.copy(applying = true, error = null, message = null)) }
        viewModelScope.launch {
            // A few at a time, retrying throttles: all at once overruns the account's
            // Lambda concurrency cap and most renames come back 5xx.
            val permits = Semaphore(RENAME_CONCURRENCY)
            val results = renames.map { c ->
                async {
                    val p = byId.getValue(c.id)
                    permits.withPermit {
                        runCatching {
                            retryServerErrors {
                                repo.updatePuzzle(
                                    p.id,
                                    UpdatePuzzleRequest(
                                        title = c.newTitle.orEmpty(),
                                        author = p.author.orEmpty(),
                                        difficulty = p.difficulty,
                                        srcCollection = p.srcCollection ?: 0,
                                        special = p.special,
                                    ),
                                )
                            }
                        }
                    }
                }
            }.awaitAll()
            val done = results.mapNotNull { it.getOrNull() }.associateBy { it.id }
            val failed = results.count { it.isFailure }
            updateNormalizer(id) { st ->
                st.copy(
                    puzzles = st.puzzles?.map { done[it.id] ?: it },
                    applying = false,
                    error = if (failed > 0) "$failed of ${renames.size} renames failed" else null,
                    message = if (failed == 0) "Renamed ${renames.size} question(s)" else null,
                )
            }
        }
    }

    /** Update the panel only if it's still open on the same collection. */
    private fun updateNormalizer(collectionId: Int, f: (TitleNormalizerState) -> TitleNormalizerState) =
        _state.update { s ->
            if (s.selectedId != collectionId || s.normalizer == null) s else s.copy(normalizer = f(s.normalizer))
        }

    /** Save every field; blank optional ones are cleared. Name is required. */
    fun save() {
        val s = _state.value
        val id = s.selectedId ?: return
        if (s.saving) return
        if (s.name.isBlank()) {
            _state.update { it.copy(error = "Name is required") }
            return
        }
        _state.update { it.copy(saving = true, error = null, saved = false) }
        viewModelScope.launch {
            try {
                val updated = repo.updateCollection(
                    id,
                    UpdateCollectionRequest(
                        name = s.name.trim(),
                        publisher = s.publisher.trim().ifBlank { null },
                        publishAt = s.publishAt.trim().ifBlank { null },
                        coverSrc = s.coverSrc.trim().ifBlank { null },
                        sealed = s.sealed,
                    )
                )
                _state.update { st ->
                    st.copy(
                        saving = false,
                        saved = true,
                        collections = st.collections.map { if (it.id == id) updated else it },
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = repo.serverMessage(e)) }
            }
        }
    }
}
