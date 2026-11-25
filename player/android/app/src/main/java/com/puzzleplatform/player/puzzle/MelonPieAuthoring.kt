package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.MelonPieEngine.Board
import com.puzzleplatform.player.puzzle.MelonPieEngine.Circle
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a Melon Pie question in the Admin screen, the analog of
 * frontend/src/components/MelonPieEditor.tsx. The draft is the [MelonPieEngine.Board].
 *
 * A tap on a grid point cycles its circle none -> white -> gray -> black -> none (the web's
 * order). Rows and columns of cells are added or removed at any edge; circles shift with
 * the board and are dropped when they leave it. [formatProblemCells] mirrors
 * melonPieFormatProblems (and the API) and blocks saving; [problems] adds the misread
 * warnings an admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object MelonPieAuthoring {

    const val PUZZLE_TYPE = 49

    fun draftFromCanon(canon: JsonObject): Board {
        val b = MelonPieEngine.boardFromCanon(canon)
        return b.copy(circles = sorted(b.circles))
    }

    fun canonFromDraft(draft: Board): JsonObject = MelonPieEngine.canonOf(draft)

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: Board): Puzzle = Puzzle(
        id = "admin-melon-pie-draft-${draft.height}x${draft.width}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "melon-pie",
        puzzleTypeJpLabel = "メロンパイ",
        difficulty = 1,
        width = draft.width,
        height = draft.height,
        canonRepr = canonFromDraft(draft),
    )

    /** Cycle the circle at point (r, c): none -> white -> gray -> black -> none. Off-lattice taps are no-ops. */
    fun cycleCircle(draft: Board, r: Int, c: Int): Board {
        if (r !in 0..draft.height || c !in 0..draft.width) return draft
        val rest = draft.circles.filterNot { it.r == r && it.c == c }
        val next = when (draft.circleAt(r, c)?.color) {
            null -> KuralinEngine.WHITE_CIRCLE
            KuralinEngine.WHITE_CIRCLE -> KuralinEngine.GRAY_CIRCLE
            KuralinEngine.GRAY_CIRCLE -> KuralinEngine.BLACK_CIRCLE
            else -> null
        }
        return draft.copy(circles = sorted(if (next == null) rest else rest + Circle(r, c, next)))
    }

    fun addRow(draft: Board, top: Boolean = false) =
        shifted(draft.copy(height = draft.height + 1), edgeShift(top, add = true), 0)

    fun addCol(draft: Board, left: Boolean = false) =
        shifted(draft.copy(width = draft.width + 1), 0, edgeShift(left, add = true))

    /** Drop the top or bottom row of cells and the circles on its outer points. Keeps at least one row. */
    fun removeEdgeRow(draft: Board, top: Boolean) =
        if (draft.height <= 1) draft else shifted(draft.copy(height = draft.height - 1), edgeShift(top, add = false), 0)

    /** Drop the left or right column of cells and the circles on its outer points. Keeps at least one column. */
    fun removeEdgeCol(draft: Board, left: Boolean) =
        if (draft.width <= 1) draft else shifted(draft.copy(width = draft.width - 1), 0, edgeShift(left, add = false))

    /** Move the circles by ([dr], [dc]) points, keeping those still on the (resized) lattice. */
    private fun shifted(draft: Board, dr: Int, dc: Int) = draft.copy(
        circles = sorted(draft.circles.map { it.copy(r = it.r + dr, c = it.c + dc) }
            .filter { it.r in 0..draft.height && it.c in 0..draft.width }),
    )

    private fun sorted(circles: List<Circle>) = circles.sortedWith(compareBy({ it.r }, { it.c }))

    data class Problem(val message: String, val r: Int, val c: Int)

    /** Port of melonPieFormatProblems: the API rejects these, so they block saving. */
    fun formatProblemCells(draft: Board): List<Problem> = buildList {
        val seen = HashSet<Pair<Int, Int>>()
        for (k in draft.circles) {
            val at = minOf(k.r, draft.height) to minOf(k.c, draft.width)
            if (k.r < 0 || k.c < 0 || k.r > draft.height || k.c > draft.width) {
                add(Problem("Circle at (${k.r},${k.c}) is off the lattice", at.first, at.second))
            }
            if (!seen.add(k.r to k.c)) add(Problem("Two circles at (${k.r},${k.c})", at.first, at.second))
        }
    }

    private val COLOR_NAMES = listOf("white", "black", "gray")

    /** Port of melonPieWarnings: misreads an admin may override. */
    fun warningCells(draft: Board): List<Problem> = buildList {
        if (draft.circles.isEmpty()) add(Problem("No circles", 0, 0))
        for (color in 0..2) {
            val n = draft.circles.count { it.color == color }
            if (n % 2 == 1) add(Problem("$n ${COLOR_NAMES[color]} circles can't pair up", 0, 0))
        }
    }

    fun formatProblems(draft: Board): List<String> = formatProblemCells(draft).map { it.message }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: Board): List<String> {
        if (draft.width < 1 || draft.height < 1) return listOf("No grid")
        val format = formatProblems(draft)
        return if (format.isNotEmpty()) format else warningCells(draft).map { it.message }
    }
}
