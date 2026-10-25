package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.AdminRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.DEFAULT_COLLECTION_ID
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.UpdatePuzzleRequest
import com.puzzleplatform.player.puzzle.AuthoringType
import com.puzzleplatform.player.puzzle.BoardDraft
import com.puzzleplatform.player.puzzle.QuestionEditRules
import com.puzzleplatform.player.puzzle.QuestionEditRules.SaveGate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminPuzzleEditUiState(
    val loading: Boolean = true,
    val loadError: String? = null,
    // The question as last read from (or saved to) the server.
    val puzzle: Puzzle? = null,
    // The type the board is edited as; null when Android has no editor for it (or its
    // canon couldn't be read), and then only the metadata is editable.
    val type: AuthoringType? = null,
    val initialBoard: BoardDraft = BoardDraft(),
    val board: BoardDraft = BoardDraft(),
    val selectedCell: String? = null,
    val title: String = "",
    val author: String = "",
    val difficulty: Int = 3,
    // DEFAULT_COLLECTION_ID (0) = no collection.
    val srcCollectionId: Int = DEFAULT_COLLECTION_ID,
    val special: Boolean = false,
    val collections: List<Collection> = emptyList(),
    val saving: Boolean = false,
    val deleting: Boolean = false,
    val error: String? = null,
    // The last save was rejected only because the solver timed out; overridable.
    val gateTimedOut: Boolean = false,
    // Set once a save or delete lands; the screen then closes.
    val done: Boolean = false,
) {
    val boardChanged: Boolean get() = type != null && board != initialBoard

    val metadataChanged: Boolean
        get() = puzzle != null && (
            title.trim() != puzzle.title.orEmpty() ||
                author.trim() != puzzle.author.orEmpty() ||
                difficulty != puzzle.difficulty ||
                srcCollectionId != (puzzle.srcCollection ?: DEFAULT_COLLECTION_ID) ||
                special != puzzle.special
            )

    val dirty: Boolean get() = boardChanged || metadataChanged

    val formatProblems: List<String> get() = type?.let { board.formatProblems(it) } ?: emptyList()

    val saveGate: SaveGate
        get() = QuestionEditRules.saveGate(
            boardChanged = boardChanged,
            hasProblems = type?.let { board.problems(it).isNotEmpty() } ?: false,
            hasFormatProblems = formatProblems.isNotEmpty(),
        )

    val busy: Boolean get() = saving || deleting
}

/**
 * Edit one existing question: its board (for the [AuthoringType]s, on the same editors
 * the batch review uses) and its metadata (title, author, difficulty, collection,
 * special). Saving PATCHes only what the API needs: the board goes along only when it
 * changed, so the server's solver gate re-runs only then.
 */
class AdminPuzzleEditViewModel(
    private val repo: AdminRepository = ServiceLocator.adminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminPuzzleEditUiState())
    val state: StateFlow<AdminPuzzleEditUiState> = _state.asStateFlow()

    private var loadedId: String? = null

    /** Load [puzzleId] once (a recomposition or config change doesn't reload it). */
    fun load(puzzleId: String) {
        if (loadedId == puzzleId) return
        loadedId = puzzleId
        _state.update { it.copy(loading = true, loadError = null) }
        viewModelScope.launch {
            try {
                val puzzle = repo.getPuzzle(puzzleId)
                _state.update { fromPuzzle(it, puzzle).copy(loading = false) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, loadError = repo.serverMessage(e)) }
            }
        }
        // Collection picker options; silent on failure (the current one still shows).
        viewModelScope.launch {
            try {
                val collections = repo.listCollections()
                _state.update { it.copy(collections = collections) }
            } catch (_: Exception) {
            }
        }
    }

    fun retry() {
        val id = loadedId ?: return
        loadedId = null
        load(id)
    }

    private fun fromPuzzle(s: AdminPuzzleEditUiState, puzzle: Puzzle): AdminPuzzleEditUiState {
        val type = AuthoringType.forPuzzleType(puzzle.puzzleType)
        val board = type?.let { runCatching { BoardDraft.fromCanon(it, puzzle.canonRepr) }.getOrNull() }
        return s.copy(
            puzzle = puzzle,
            type = if (board != null) type else null,
            initialBoard = board ?: BoardDraft(),
            board = board ?: BoardDraft(),
            selectedCell = null,
            title = puzzle.title.orEmpty(),
            author = puzzle.author.orEmpty(),
            difficulty = puzzle.difficulty,
            srcCollectionId = puzzle.srcCollection ?: DEFAULT_COLLECTION_ID,
            special = puzzle.special,
        )
    }

    fun selectCell(key: String?) = _state.update { it.copy(selectedCell = key) }

    /** Apply a board edit; a changed board has to pass the solver gate afresh. */
    fun editBoard(transform: (BoardDraft) -> BoardDraft) =
        _state.update { it.copy(board = transform(it.board), gateTimedOut = false) }

    /** Throw away board edits, back to the stored board. */
    fun revertBoard() =
        _state.update { it.copy(board = it.initialBoard, selectedCell = null, gateTimedOut = false) }

    fun setTitle(v: String) = _state.update { it.copy(title = v) }
    fun setAuthor(v: String) = _state.update { it.copy(author = v) }
    fun setDifficulty(v: Int) = _state.update { it.copy(difficulty = v) }
    fun setSrcCollection(id: Int) = _state.update { it.copy(srcCollectionId = id) }
    fun setSpecial(v: Boolean) = _state.update { it.copy(special = v) }

    /**
     * PATCH the edits. Refused without a request while the changed board has format
     * problems; a board with misread warnings is the screen's "Save anyway". With
     * [allowUnverified] the server skips the solver gate and stores the board as
     * "unknown" (it then shows in the flagged review list).
     */
    fun save(allowUnverified: Boolean = false) {
        val s = _state.value
        val puzzle = s.puzzle ?: return
        if (s.busy || s.saveGate == SaveGate.BLOCKED) return
        val canon = if (s.boardChanged) s.type?.let { s.board.toCanon(it) } else null
        val req = UpdatePuzzleRequest(
            title = s.title.trim(),
            author = s.author.trim(),
            difficulty = s.difficulty,
            srcCollection = s.srcCollectionId,
            special = s.special,
            canonRepr = canon?.canon,
            width = canon?.width,
            height = canon?.height,
            allowUnverified = if (allowUnverified && canon != null) true else null,
        )
        _state.update { it.copy(saving = true, error = null, gateTimedOut = false) }
        viewModelScope.launch {
            try {
                repo.updatePuzzle(puzzle.id, req)
                _state.update { it.copy(saving = false, done = true) }
            } catch (e: Exception) {
                val err = repo.serverError(e)
                _state.update {
                    it.copy(saving = false, error = err.message, gateTimedOut = err.isGateTimeout)
                }
            }
        }
    }

    /** Soft-delete the question (the server keeps the row for attempts on it). */
    fun delete() {
        val s = _state.value
        val puzzle = s.puzzle ?: return
        if (s.busy) return
        _state.update { it.copy(deleting = true, error = null) }
        viewModelScope.launch {
            try {
                repo.deletePuzzle(puzzle.id)
                _state.update { it.copy(deleting = false, done = true) }
            } catch (e: Exception) {
                _state.update { it.copy(deleting = false, error = repo.serverMessage(e)) }
            }
        }
    }
}
