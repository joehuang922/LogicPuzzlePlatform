package com.puzzleplatform.player.ui.screens

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.AdminRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import com.puzzleplatform.player.puzzle.AuthoringType
import com.puzzleplatform.player.puzzle.BatchRules
import com.puzzleplatform.player.puzzle.ItemStatus
import com.puzzleplatform.player.puzzle.KakuroAuthoring
import com.puzzleplatform.player.puzzle.KakuroDraft
import com.puzzleplatform.player.puzzle.NonogramAuthoring
import com.puzzleplatform.player.puzzle.NonogramDraft
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
 * One tile in the batch: an image and everything derived from it. What the parse
 * yields depends on the batch's [AuthoringType]: a sudoku's givens ride in
 * [userValues] ("col,row" -> digit) — the same map the player's SudokuBoard renders
 * and edits — so the review reuses that board verbatim; a nonogram's clue lists ride
 * in [nonogram], a kakuro's cell grid in [kakuro]. Metadata is
 * per-item except the shared source collection and the default difficulty (a null
 * [difficulty] inherits the batch default).
 */
data class BatchItem(
    val id: String,
    val uri: Uri,
    val status: ItemStatus = ItemStatus.PENDING,
    val userValues: Map<String, Int> = emptyMap(),
    val nonogram: NonogramDraft = NonogramDraft(),
    val kakuro: KakuroDraft = KakuroDraft(),
    val title: String = "",
    val author: String = "",
    val difficulty: Int? = null,
    val createdId: String? = null,
    val error: String? = null,
)

data class AdminQuestionUiState(
    // What every tile in the batch is parsed and created as.
    val type: AuthoringType = AuthoringType.SUDOKU,
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
     * Switch the batch's puzzle type. Parsed grids are type-specific, so every tile
     * goes back to un-parsed (the picked images are kept). Ignored mid-parse/create.
     */
    fun setType(type: AuthoringType) {
        val s = _state.value
        if (type == s.type || s.parsing || s.creating) return
        _state.update {
            it.copy(
                type = type,
                items = it.items.map { item -> BatchItem(id = item.id, uri = item.uri) },
                reviewItemId = null,
                selectedCell = null,
            )
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
                            gate.withPermit { parseOne(item.id, item.uri, s.type) }
                        }
                    }
                }
            } finally {
                _state.update { it.copy(parsing = false) }
            }
        }
    }

    private suspend fun parseOne(id: String, uri: Uri, type: AuthoringType) {
        updateItem(id) { it.copy(status = ItemStatus.PARSING, error = null) }
        try {
            val res = repo.parseImage(uri, type.puzzleType)
            val canon = res.canon
            updateItem(id) {
                when (type) {
                    AuthoringType.SUDOKU -> it.copy(userValues = SudokuAuthoring.userValuesFromCanon(canon))
                    AuthoringType.NONOGRAM -> it.copy(nonogram = NonogramAuthoring.draftFromCanon(canon))
                    AuthoringType.KAKURO -> it.copy(kakuro = KakuroAuthoring.draftFromCanon(canon))
                }.copy(
                    status = ItemStatus.PARSED,
                    error = null,
                    // Pre-fill from the scan, but never overwrite what the admin typed.
                    title = it.title.ifBlank { res.metadata?.title.orEmpty() },
                    author = it.author.ifBlank { res.metadata?.author.orEmpty() },
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
    private fun editGrid(id: String, transform: (Map<String, Int>) -> Map<String, Int>) =
        editItem(id) { it.copy(userValues = transform(it.userValues)) }

    /** Apply a nonogram clue edit (see [NonogramAuthoring]) to tile [id]. */
    fun editNonogram(id: String, transform: (NonogramDraft) -> NonogramDraft) =
        editItem(id) { it.copy(nonogram = transform(it.nonogram)) }

    /** Apply a kakuro cell edit (see [KakuroAuthoring]) to tile [id]. */
    fun editKakuro(id: String, transform: (KakuroDraft) -> KakuroDraft) =
        editItem(id) { it.copy(kakuro = transform(it.kakuro)) }

    private fun editItem(id: String, transform: (BatchItem) -> BatchItem) {
        updateItem(id) {
            transform(it).copy(
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
                        val (canon, width, height) = when (s.type) {
                            AuthoringType.SUDOKU -> Triple(
                                SudokuAuthoring.canonFromUserValues(item.userValues),
                                SudokuAuthoring.SIZE,
                                SudokuAuthoring.SIZE,
                            )
                            AuthoringType.NONOGRAM -> Triple(
                                NonogramAuthoring.canonFromDraft(item.nonogram),
                                item.nonogram.cols,
                                item.nonogram.rows,
                            )
                            AuthoringType.KAKURO -> Triple(
                                KakuroAuthoring.canonFromDraft(item.kakuro),
                                item.kakuro.cols,
                                item.kakuro.rows,
                            )
                        }
                        val id = repo.createPuzzle(
                            CreatePuzzleRequest(
                                puzzleType = s.type.puzzleType,
                                difficulty = BatchRules.resolveDifficulty(item.difficulty, s.defaultDifficulty),
                                canonRepr = canon,
                                title = item.title.trim().ifBlank { null },
                                author = item.author.trim().ifBlank { null },
                                width = width,
                                height = height,
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
