package com.puzzleplatform.player.ui.screens

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.AdminRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import com.puzzleplatform.player.puzzle.BatchRules
import com.puzzleplatform.player.puzzle.ItemStatus
import com.puzzleplatform.player.puzzle.SudokuAuthoring
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/**
 * One tile in the batch: an image and everything derived from it. Parsed givens
 * ride in [userValues] ("col,row" -> digit) — the same map the player's SudokuBoard
 * renders and edits — so the review sheet reuses that board verbatim. Metadata is
 * per-item except the shared source collection and the default difficulty (a null
 * [difficulty] inherits the batch default).
 */
data class BatchItem(
    val id: String,
    val uri: Uri,
    val status: ItemStatus = ItemStatus.PENDING,
    val userValues: Map<String, Int> = emptyMap(),
    val title: String = "",
    val author: String = "",
    val difficulty: Int? = null,
    val createdId: String? = null,
    val error: String? = null,
)

data class AdminQuestionUiState(
    val items: List<BatchItem> = emptyList(),
    val parserConfigured: Boolean = true,
    // True while any tile is parsing (drives the "Parse all" spinner).
    val parsing: Boolean = false,
    val creating: Boolean = false,
    // Shared across the batch.
    val defaultDifficulty: Int = 3,
    val collections: List<Collection> = emptyList(),
    val srcCollectionId: Int? = null,
    // The tile whose review sheet is open, and the selected cell within it.
    val reviewItemId: String? = null,
    val selectedCell: String? = null,
) {
    /** Tiles that the next "Create all valid" press would send. */
    val eligibleCount: Int
        get() = items.count { BatchRules.isEligibleToCreate(it.status, it.createdId) }

    val createdCount: Int get() = items.count { it.status == ItemStatus.CREATED }
    val failedCount: Int
        get() = items.count { it.status == ItemStatus.PARSE_FAILED || it.status == ItemStatus.CREATE_FAILED }

    /** The open tile, if any. */
    val reviewItem: BatchItem? get() = items.firstOrNull { it.id == reviewItemId }
}

class AdminQuestionViewModel(
    private val repo: AdminRepository = ServiceLocator.adminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(
        AdminQuestionUiState(parserConfigured = repo.parserConfigured)
    )
    val state: StateFlow<AdminQuestionUiState> = _state.asStateFlow()

    init {
        // Populate the optional shared "source collection" dropdown; silent on
        // failure (puzzles can still be created without one).
        viewModelScope.launch {
            try {
                val collections = repo.listCollections()
                _state.update { it.copy(collections = collections) }
            } catch (_: Exception) {
            }
        }
    }

    /** Replace an item in the list by id, leaving the rest untouched. */
    private fun updateItem(id: String, transform: (BatchItem) -> BatchItem) {
        _state.update { s ->
            s.copy(items = s.items.map { if (it.id == id) transform(it) else it })
        }
    }

    /** A fresh pick resets the whole batch (ids are index-based and stable per pick). */
    fun setImages(uris: List<Uri>) {
        val items = uris.mapIndexed { index, uri -> BatchItem(id = "item-$index", uri = uri) }
        _state.update {
            it.copy(items = items, reviewItemId = null, selectedCell = null)
        }
    }

    /**
     * Parse every not-yet-parsed tile concurrently, capped at [PARSE_CONCURRENCY] so a
     * big batch doesn't open a dozen slow (cold-start) parser calls at once. Tiles flip
     * to PARSED (grid seeded) or PARSE_FAILED individually as each lands, so the grid
     * fills in live. Re-runnable: it only touches PENDING / PARSE_FAILED tiles.
     */
    fun parse() {
        val s = _state.value
        if (s.parsing || !s.parserConfigured) return
        val targets = s.items.filter {
            it.status == ItemStatus.PENDING || it.status == ItemStatus.PARSE_FAILED
        }
        if (targets.isEmpty()) return

        _state.update { it.copy(parsing = true) }
        viewModelScope.launch {
            val gate = Semaphore(PARSE_CONCURRENCY)
            try {
                coroutineScope {
                    for (item in targets) {
                        launch {
                            gate.withPermit { parseOne(item.id, item.uri) }
                        }
                    }
                }
            } finally {
                _state.update { it.copy(parsing = false) }
            }
        }
    }

    private suspend fun parseOne(id: String, uri: Uri) {
        updateItem(id) { it.copy(status = ItemStatus.PARSING, error = null) }
        try {
            val canon = repo.parseImage(uri, SudokuAuthoring.PUZZLE_TYPE)
            updateItem(id) {
                it.copy(
                    status = ItemStatus.PARSED,
                    userValues = SudokuAuthoring.userValuesFromCanon(canon),
                    error = null,
                )
            }
        } catch (e: Exception) {
            updateItem(id) { it.copy(status = ItemStatus.PARSE_FAILED, error = repo.serverMessage(e)) }
        }
    }

    // --- Review sheet ---

    fun openReview(id: String) = _state.update { it.copy(reviewItemId = id, selectedCell = null) }
    fun closeReview() = _state.update { it.copy(reviewItemId = null, selectedCell = null) }
    fun selectCell(key: String?) = _state.update { it.copy(selectedCell = key) }

    /** Set the selected cell's given (1-9) on the open tile. */
    fun enterDigit(digit: Int) {
        val s = _state.value
        val id = s.reviewItemId ?: return
        val key = s.selectedCell ?: return
        if (digit !in 1..9) return
        editGrid(id) { it + (key to digit) }
    }

    /** Clear the selected cell's given on the open tile. */
    fun clearCell() {
        val s = _state.value
        val id = s.reviewItemId ?: return
        val key = s.selectedCell ?: return
        editGrid(id) { it - key }
    }

    /** Apply a grid edit and re-arm a previously create-failed tile (see BatchRules.afterEdit). */
    private fun editGrid(id: String, transform: (Map<String, Int>) -> Map<String, Int>) {
        updateItem(id) {
            it.copy(
                userValues = transform(it.userValues),
                status = BatchRules.afterEdit(it.status),
                error = if (it.status == ItemStatus.CREATE_FAILED) null else it.error,
            )
        }
    }

    fun setItemTitle(id: String, v: String) = updateItem(id) { it.copy(title = v) }
    fun setItemAuthor(id: String, v: String) = updateItem(id) { it.copy(author = v) }
    fun setItemDifficulty(id: String, v: Int?) = updateItem(id) { it.copy(difficulty = v) }

    /** Drop a tile from the batch entirely. Closes the review if it was the open one. */
    fun removeItem(id: String) = _state.update { s ->
        s.copy(
            items = s.items.filterNot { it.id == id },
            reviewItemId = if (s.reviewItemId == id) null else s.reviewItemId,
            selectedCell = if (s.reviewItemId == id) null else s.selectedCell,
        )
    }

    // --- Shared metadata ---

    fun setDefaultDifficulty(v: Int) = _state.update { it.copy(defaultDifficulty = v) }
    fun setSrcCollection(id: Int?) = _state.update { it.copy(srcCollectionId = id) }

    /**
     * Create every eligible tile (parsed, not already created). Each is
     * POSTed on its own through the server's solver gate; a tile flips to CREATED (with
     * its id) or CREATE_FAILED (with the gate's message). Already-created tiles are
     * skipped, so the button can be pressed again after fixing the failures and sends
     * only the remainder. Sequential — the gate is a fast JSON call and ordered updates
     * keep the grid legible.
     */
    fun createAllValid() {
        val s = _state.value
        if (s.creating) return
        val targets = s.items.filter {
            BatchRules.isEligibleToCreate(it.status, it.createdId)
        }
        if (targets.isEmpty()) return

        _state.update { it.copy(creating = true) }
        viewModelScope.launch {
            try {
                for (item in targets) {
                    updateItem(item.id) { it.copy(status = ItemStatus.CREATING, error = null) }
                    try {
                        val id = repo.createPuzzle(
                            CreatePuzzleRequest(
                                puzzleType = SudokuAuthoring.PUZZLE_TYPE,
                                difficulty = BatchRules.resolveDifficulty(item.difficulty, s.defaultDifficulty),
                                canonRepr = SudokuAuthoring.canonFromUserValues(item.userValues),
                                title = item.title.trim().ifBlank { null },
                                author = item.author.trim().ifBlank { null },
                                width = SudokuAuthoring.SIZE,
                                height = SudokuAuthoring.SIZE,
                                srcCollection = s.srcCollectionId,
                            )
                        )
                        updateItem(item.id) {
                            it.copy(status = ItemStatus.CREATED, createdId = id, error = null)
                        }
                    } catch (e: Exception) {
                        updateItem(item.id) {
                            it.copy(status = ItemStatus.CREATE_FAILED, error = repo.serverMessage(e))
                        }
                    }
                }
            } finally {
                _state.update { it.copy(creating = false) }
            }
        }
    }

    private companion object {
        /** Max concurrent parser calls — a cold parse is slow, so cap the fan-out. */
        const val PARSE_CONCURRENCY = 3
    }
}
