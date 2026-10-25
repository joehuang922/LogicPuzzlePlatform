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
import com.puzzleplatform.player.puzzle.BoardDraft
import com.puzzleplatform.player.puzzle.ItemStatus
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/**
 * One tile in the batch: an image and everything derived from it. The parsed grid
 * rides in [board], whose field for the batch's [AuthoringType] is the live one (a
 * sudoku's givens in its `userValues`, a nonogram's clue lists in its `nonogram`, ...).
 * Metadata is per-item except the shared source collection and the default difficulty
 * (a null [difficulty] inherits the batch default).
 */
data class BatchItem(
    val id: String,
    val uri: Uri,
    val status: ItemStatus = ItemStatus.PENDING,
    val board: BoardDraft = BoardDraft(),
    val title: String = "",
    val author: String = "",
    val difficulty: Int? = null,
    val createdId: String? = null,
    val error: String? = null,
    // The create was rejected only because the solver timed out; the review screen
    // offers an override.
    val gateTimedOut: Boolean = false,
    // The admin overrode that timeout: the next create sends allowUnverified (skips the
    // solver gate). Cleared by a grid edit, so changed clues get checked again.
    val allowUnverified: Boolean = false,
)

/** What the type's misread check finds wrong with this tile's grid (see [BoardDraft.problems]). */
fun BatchItem.problems(type: AuthoringType): List<String> = board.problems(type)

/** The un-overridable part of [problems] (see [BoardDraft.formatProblems]). */
fun BatchItem.formatProblems(type: AuthoringType): List<String> = board.formatProblems(type)

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
        get() = items.count { isEligible(it) }

    /** Parsed, uncreated red tiles that "Create all valid" skips. */
    val skippedCount: Int
        get() = items.count {
            it.status == ItemStatus.PARSED && it.createdId == null && it.problems(type).isNotEmpty()
        }

    fun isEligible(item: BatchItem): Boolean =
        BatchRules.isEligibleToCreate(item.status, item.createdId, item.problems(type).isNotEmpty())

    fun canCreateAnyway(item: BatchItem): Boolean = BatchRules.canCreateAnyway(
        item.status,
        item.createdId,
        hasProblems = item.problems(type).isNotEmpty(),
        hasFormatProblems = item.formatProblems(type).isNotEmpty(),
    )

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
                it.copy(
                    board = BoardDraft.fromCanon(type, canon),
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

    /**
     * Apply a grid edit (see the type's `*Authoring`) to tile [id], re-arming a
     * previously create-failed tile (see BatchRules.afterEdit).
     */
    fun editBoard(id: String, transform: (BoardDraft) -> BoardDraft) =
        editItem(id) { it.copy(board = transform(it.board)) }

    private fun editItem(id: String, transform: (BatchItem) -> BatchItem) {
        updateItem(id) {
            transform(it).copy(
                status = BatchRules.afterEdit(it.status),
                error = if (it.status == ItemStatus.CREATE_FAILED) null else it.error,
                allowUnverified = false,
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
     * Create every eligible tile (parsed, not already created, not red). Each is
     * POSTed on its own through the server's solver gate; a tile flips to CREATED (with
     * its id) or CREATE_FAILED (with the gate's message). Already-created tiles are
     * skipped, so the button can be pressed again after fixing the failures and sends
     * only the remainder. Sequential — the gate is a fast JSON call and ordered updates
     * keep the grid legible.
     */
    fun createAllValid() {
        val s = _state.value
        if (s.creating) return
        val targets = s.items.filter(s::isEligible)
        if (targets.isEmpty()) return

        _state.update { it.copy(creating = true) }
        viewModelScope.launch {
            try {
                for (item in targets) createItem(s, item, allowUnverified = item.allowUnverified)
            } finally {
                _state.update { it.copy(creating = false) }
            }
        }
    }

    /**
     * Create one red tile that "Create all valid" skipped, because the admin judged its
     * problems a false alarm. Not offered for format problems. The server's checks (and
     * solver gate, where the type has one) still run.
     */
    fun createAnyway(itemId: String) {
        val s = _state.value
        if (s.creating) return
        val item = s.items.firstOrNull { it.id == itemId } ?: return
        if (!s.canCreateAnyway(item)) return

        _state.update { it.copy(creating = true) }
        viewModelScope.launch {
            try {
                createItem(s, item, allowUnverified = item.allowUnverified)
            } finally {
                _state.update { it.copy(creating = false) }
            }
        }
    }

    /**
     * Dismiss a rejection that was only the solver timing out. Nothing is sent: the tile
     * goes back to PARSED (eligible again), and "Create all valid" then POSTs it with
     * allowUnverified, so the server skips the gate and stores it as "unknown" (it stays
     * in the flagged review list).
     */
    fun overrideGate(itemId: String) = updateItem(itemId) {
        if (it.status != ItemStatus.CREATE_FAILED || !it.gateTimedOut) it
        else it.copy(status = ItemStatus.PARSED, error = null, gateTimedOut = false, allowUnverified = true)
    }

    /**
     * POST one tile through the gate; it flips to CREATED or CREATE_FAILED. A grid with
     * format problems is refused here without a request, whatever path got it here.
     */
    private suspend fun createItem(s: AdminQuestionUiState, item: BatchItem, allowUnverified: Boolean) {
        updateItem(item.id) { it.copy(status = ItemStatus.CREATING, error = null, gateTimedOut = false) }
        try {
            item.formatProblems(s.type).firstOrNull()?.let { error("Fix the grid first: $it") }
            val (canon, width, height) = item.board.toCanon(s.type)
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
                    allowUnverified = if (allowUnverified) true else null,
                )
            )
            updateItem(item.id) {
                it.copy(status = ItemStatus.CREATED, createdId = id, error = null)
            }
        } catch (e: Exception) {
            val err = repo.serverError(e)
            updateItem(item.id) {
                it.copy(
                    status = ItemStatus.CREATE_FAILED,
                    error = err.message,
                    gateTimedOut = err.isGateTimeout,
                )
            }
        }
    }

    private companion object {
        /** Max concurrent parser calls — a cold parse is slow, so cap the fan-out. */
        const val PARSE_CONCURRENCY = 3
    }
}
