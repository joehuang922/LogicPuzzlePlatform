package com.puzzleplatform.player.ui.screens

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.AdminRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import com.puzzleplatform.player.puzzle.SudokuAuthoring
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminQuestionUiState(
    // Picked album image (content:// Uri) and whether a parser URL is configured.
    val imageUri: Uri? = null,
    val parserConfigured: Boolean = true,
    val parsing: Boolean = false,
    // True once a parse has seeded the grid, so the review board + fields show.
    val parsed: Boolean = false,
    // Editable 9×9 givens as the board's player-input map ("col,row" -> digit).
    val userValues: Map<String, Int> = emptyMap(),
    val selectedCell: String? = null,
    // Puzzle metadata.
    val difficulty: Int = 3,
    val title: String = "",
    val author: String = "",
    val collections: List<Collection> = emptyList(),
    val srcCollectionId: Int? = null,
    val submitting: Boolean = false,
    val error: String? = null,
    val createdId: String? = null,
)

class AdminQuestionViewModel(
    private val repo: AdminRepository = ServiceLocator.adminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(
        AdminQuestionUiState(parserConfigured = repo.parserConfigured)
    )
    val state: StateFlow<AdminQuestionUiState> = _state.asStateFlow()

    init {
        // Populate the optional "source collection" dropdown; silent on failure
        // (the field stays empty and the puzzle can still be created without one).
        viewModelScope.launch {
            try {
                val collections = repo.listCollections()
                _state.update { it.copy(collections = collections) }
            } catch (_: Exception) {
            }
        }
    }

    /** A new album pick resets any prior parse so the review grid can't go stale. */
    fun setImage(uri: Uri?) {
        _state.update {
            it.copy(
                imageUri = uri,
                parsed = false,
                userValues = emptyMap(),
                selectedCell = null,
                error = null,
                createdId = null,
            )
        }
    }

    /** Send the picked image to the OCR parser and seed the editable grid from it. */
    fun parse() {
        val s = _state.value
        val uri = s.imageUri ?: return
        if (s.parsing || !s.parserConfigured) return
        _state.update { it.copy(parsing = true, error = null, createdId = null) }
        viewModelScope.launch {
            try {
                val canon = repo.parseImage(uri, SudokuAuthoring.PUZZLE_TYPE)
                _state.update {
                    it.copy(
                        parsing = false,
                        parsed = true,
                        userValues = SudokuAuthoring.userValuesFromCanon(canon),
                        selectedCell = null,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(parsing = false, error = repo.serverMessage(e)) }
            }
        }
    }

    fun selectCell(key: String?) = _state.update { it.copy(selectedCell = key) }

    /** Set the selected cell's given (1-9). No-op without a selection. */
    fun enterDigit(digit: Int) {
        val key = _state.value.selectedCell ?: return
        if (digit !in 1..9) return
        _state.update { it.copy(userValues = it.userValues + (key to digit)) }
    }

    /** Clear the selected cell's given. */
    fun clearCell() {
        val key = _state.value.selectedCell ?: return
        _state.update { it.copy(userValues = it.userValues - key) }
    }

    fun setDifficulty(v: Int) = _state.update { it.copy(difficulty = v) }
    fun setTitle(v: String) = _state.update { it.copy(title = v) }
    fun setAuthor(v: String) = _state.update { it.copy(author = v) }
    fun setSrcCollection(id: Int?) = _state.update { it.copy(srcCollectionId = id) }

    /**
     * Create the question. Builds canon `{ hints }` from the edited grid and POSTs
     * it; the server's solver gate validates it and returns a 400 message (surfaced
     * here) when the board has no / multiple / unprovable solution.
     */
    fun submit() {
        val s = _state.value
        if (s.submitting) return
        _state.update { it.copy(submitting = true, error = null, createdId = null) }
        viewModelScope.launch {
            try {
                val id = repo.createPuzzle(
                    CreatePuzzleRequest(
                        puzzleType = SudokuAuthoring.PUZZLE_TYPE,
                        difficulty = s.difficulty,
                        canonRepr = SudokuAuthoring.canonFromUserValues(s.userValues),
                        title = s.title.trim().ifBlank { null },
                        author = s.author.trim().ifBlank { null },
                        width = SudokuAuthoring.SIZE,
                        height = SudokuAuthoring.SIZE,
                        srcCollection = s.srcCollectionId,
                    )
                )
                _state.update { it.copy(submitting = false, createdId = id) }
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, error = repo.serverMessage(e)) }
            }
        }
    }
}
