package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.YajilixAuthoring.Problem
import com.puzzleplatform.player.puzzle.YajilixEngine.Board
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a Majority Yajilix question in the Admin screen, the analog of
 * frontend/src/components/MajorityYajilixEditor.tsx: Yajilix's authoring without numbers.
 * The draft is a [YajilixEngine.Board] whose clues have a null number.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object MajorityYajilixAuthoring : LoopClueAuthoring {

    const val PUZZLE_TYPE = 47

    override val withNumbers = false

    /** The canon's board; a stray number is dropped and ragged rows are padded. */
    fun draftFromCanon(canon: JsonObject): Board {
        val b = YajilixAuthoring.draftFromCanon(canon)
        return Board(b.cells.map { row -> row.map { it?.copy(num = null) } })
    }

    fun canonFromDraft(draft: Board): JsonObject = YajilixEngine.canonOf(draft)

    override fun previewPuzzle(draft: Board): Puzzle = Puzzle(
        id = "admin-majority-yajilix-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "majority-yajilix",
        puzzleTypeJpLabel = "多数派ヤジリックス",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    override fun formatProblemCells(draft: Board): List<Problem> = YajilixAuthoring.formatProblemCells(draft)

    /** Port of majorityYajilixWarnings: misreads an admin may override. */
    override fun warningCells(draft: Board): List<Problem> = buildList {
        var clues = 0
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            val clue = draft.clue(r, c) ?: continue
            clues++
            if (YajilixEngine.lineCells(draft, r, c, clue.dir).isEmpty()) {
                add(Problem("${clue.label} at R${r + 1}C${c + 1} has no cells in its direction", r, c))
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
