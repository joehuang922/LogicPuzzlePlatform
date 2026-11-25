package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.YajilixEngine.Board
import com.puzzleplatform.player.puzzle.YajilixEngine.Clue
import com.puzzleplatform.player.puzzle.YajilixEngine.Dir
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a Yajilix question in the Admin screen, the analog of
 * frontend/src/components/YajilixEditor.tsx. The draft is the [YajilixEngine.Board].
 *
 * A cell is set to a kind (L / I / X; an empty cell becomes that kind's `0 ↑` clue) or
 * cleared, its arrow pointed and its number stepped. Rows and columns are added or removed
 * at any edge. [formatProblems] mirrors yajilixFormatProblems (and the API)
 * and blocks saving; [problems] adds the misread warnings an admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
/**
 * The authoring operations a loop-clue editor (YajilixEditor) needs, shared by Yajilix and
 * Majority Yajilix; the board is [YajilixEngine.Board] for both.
 */
interface LoopClueAuthoring {
    /** Yajilix clues carry a number; Majority Yajilix clues don't. */
    val withNumbers: Boolean

    fun previewPuzzle(draft: Board): Puzzle

    fun formatProblemCells(draft: Board): List<YajilixAuthoring.Problem>

    fun warningCells(draft: Board): List<YajilixAuthoring.Problem>

    fun problems(draft: Board): List<String>

    /** Set the cell's kind; null clears the cell. An empty cell becomes an `↑` clue. */
    fun setKind(draft: Board, r: Int, c: Int, kind: Char?): Board =
        if (kind == null) YajilixAuthoring.edit(draft, r, c, withNumbers) { null }
        else if (kind !in YajilixEngine.KINDS) draft
        else YajilixAuthoring.edit(draft, r, c, withNumbers) { it.copy(kind = kind) }

    fun setDir(draft: Board, r: Int, c: Int, dir: Dir): Board =
        YajilixAuthoring.edit(draft, r, c, withNumbers) { it.copy(dir = dir) }
}

object YajilixAuthoring : LoopClueAuthoring {

    const val PUZZLE_TYPE = 46

    override val withNumbers = true

    /** The canon's board, ragged rows padded with empty cells. */
    fun draftFromCanon(canon: JsonObject): Board {
        val b = YajilixEngine.boardFromCanon(canon)
        val cols = b.cells.maxOfOrNull { it.size } ?: 0
        return Board(b.cells.map { row -> row + List(cols - row.size) { null } })
    }

    fun canonFromDraft(draft: Board): JsonObject = YajilixEngine.canonOf(draft)

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    override fun previewPuzzle(draft: Board): Puzzle = Puzzle(
        id = "admin-yajilix-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "yajilix",
        puzzleTypeJpLabel = "ヤジリックス",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Apply [f] to the clue at (r, c); an empty cell starts as an `L↑` (with 0 if [withNumbers]). */
    internal fun edit(draft: Board, r: Int, c: Int, withNumbers: Boolean, f: (Clue) -> Clue?): Board {
        if (r !in 0 until draft.rows || c !in 0 until draft.cols) return draft
        val cur = draft.clue(r, c) ?: Clue('L', if (withNumbers) 0 else null, Dir.UP)
        return Board(draft.cells.mapIndexed { i, row -> if (i != r) row else row.mapIndexed { j, v -> if (j == c) f(cur) else v } })
    }

    /** Step the clue's number by [delta], never below 0. */
    fun stepNum(draft: Board, r: Int, c: Int, delta: Int): Board =
        edit(draft, r, c, true) { it.copy(num = ((it.num ?: 0) + delta).coerceAtLeast(0)) }

    /** Add an empty row at the top or bottom. */
    fun addRow(draft: Board, top: Boolean = false) = Board(draft.cells.plusEdgeRow(top, draft.cols, null))

    /** Add an empty column at the left or right. */
    fun addCol(draft: Board, left: Boolean = false) = Board(draft.cells.plusEdgeCol(left, null))

    /** Drop the top or bottom row. Keeps at least two rows. */
    fun removeEdgeRow(draft: Board, top: Boolean) = if (draft.rows <= 2) draft else Board(draft.cells.minusEdgeRow(top))

    /** Drop the left or right column. Keeps at least two columns. */
    fun removeEdgeCol(draft: Board, left: Boolean) = if (draft.cols <= 2) draft else Board(draft.cells.minusEdgeCol(left))

    data class Problem(val message: String, val r: Int, val c: Int)

    /** Port of yajilixFormatProblems: the API rejects these, so they block saving. */
    override fun formatProblemCells(draft: Board): List<Problem> =
        if (draft.rows == 0 || draft.cols == 0 || draft.cells.any { it.size != draft.cols }) {
            listOf(Problem("Rows of cells differ in length", 0, 0))
        } else {
            emptyList()
        }

    /** Port of yajilixWarnings: misreads an admin may override. */
    override fun warningCells(draft: Board): List<Problem> = buildList {
        var clues = 0
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            val clue = draft.clue(r, c) ?: continue
            clues++
            val room = YajilixEngine.lineCells(draft, r, c, clue.dir).size
            if ((clue.num ?: 0) > room) {
                add(Problem("${clue.label} at R${r + 1}C${c + 1} counts more than the $room cells in its direction", r, c))
            }
        }
        if (clues == 0) add(Problem("No clues", 0, 0))
    }

    fun formatProblems(draft: Board): List<String> = formatProblemCells(draft).map { it.message }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    override fun problems(draft: Board): List<String> {
        if (draft.rows < 2 || draft.cols < 2) return listOf("No grid")
        val format = formatProblems(draft)
        return if (format.isNotEmpty()) format else warningCells(draft).map { it.message }
    }
}
