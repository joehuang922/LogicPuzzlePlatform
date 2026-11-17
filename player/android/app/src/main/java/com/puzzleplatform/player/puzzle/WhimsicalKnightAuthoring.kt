package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.WhimsicalKnightEngine.Point
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToInt

/**
 * Pure helpers for authoring a whimsical knight question in the Admin screen, the analog
 * of frontend/src/components/WhimsicalKnightEditor.tsx. The draft is the
 * [WhimsicalKnightEngine.Board].
 *
 * A tap snaps to the nearest lattice point: a cell centre toggles its gray square, a dot
 * cycles none -> circle -> square -> none, a midpoint toggles a circle. Rows and columns
 * of dots are added or removed at the bottom/right edge. [formatProblems] mirrors the web
 * editor's (and the API's) checks and blocks creating or saving.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object WhimsicalKnightAuthoring {

    const val PUZZLE_TYPE = 37

    fun draftFromCanon(canon: JsonObject): WhimsicalKnightEngine.Board {
        val b = WhimsicalKnightEngine.parseBoard(canon)
        return b.copy(gray = grayGrid(b, b.rows, b.cols))
    }

    /** The canon `{ rows, cols, gray, circles, squares }` to POST. */
    fun canonFromDraft(draft: WhimsicalKnightEngine.Board): JsonObject {
        fun points(ps: List<Point>) = JsonArray(ps.map {
            JsonObject(mapOf("dr" to JsonPrimitive(it.dr), "dc" to JsonPrimitive(it.dc)))
        })
        return JsonObject(
            mapOf(
                "rows" to JsonPrimitive(draft.rows),
                "cols" to JsonPrimitive(draft.cols),
                "gray" to JsonArray(draft.gray.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }),
                "circles" to points(draft.circles),
                "squares" to points(draft.squares),
            ),
        )
    }

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: WhimsicalKnightEngine.Board): Puzzle = Puzzle(
        id = "admin-whimsical-knight-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "whimsical-knight",
        puzzleTypeJpLabel = "気まぐれナイト",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /**
     * Apply a tap at fractional dot coordinates ([x] = column, [y] = row; dot (r, c) is at
     * (c, r)): snap to the nearest dot, midpoint or cell centre and edit what's there.
     */
    fun tap(draft: WhimsicalKnightEngine.Board, x: Float, y: Float): WhimsicalKnightEngine.Board {
        val dr = (y * 2).roundToInt()
        val dc = (x * 2).roundToInt()
        if (dr !in 0..2 * (draft.rows - 1) || dc !in 0..2 * (draft.cols - 1)) return draft
        return if (dr % 2 == 1 && dc % 2 == 1) toggleGray(draft, (dr - 1) / 2, (dc - 1) / 2) else cycleClue(draft, dr, dc)
    }

    fun toggleGray(draft: WhimsicalKnightEngine.Board, r: Int, c: Int): WhimsicalKnightEngine.Board {
        if (r !in 0 until draft.rows - 1 || c !in 0 until draft.cols - 1) return draft
        return draft.copy(gray = draft.gray.mapIndexed { i, row ->
            if (i != r) row else row.mapIndexed { j, v -> if (j == c) 1 - v else v }
        })
    }

    /** Dot: none -> circle -> square -> none; midpoint: none -> circle -> none. */
    fun cycleClue(draft: WhimsicalKnightEngine.Board, dr: Int, dc: Int): WhimsicalKnightEngine.Board {
        val p = Point(dr, dc)
        val circles = draft.circles.filterNot { it == p }
        val squares = draft.squares.filterNot { it == p }
        val order = compareBy<Point>({ it.dr }, { it.dc })
        return when {
            p in draft.circles -> draft.copy(circles = circles, squares = if (p.onDot) (squares + p).sortedWith(order) else squares)
            p in draft.squares -> draft.copy(squares = squares)
            else -> draft.copy(circles = (circles + p).sortedWith(order))
        }
    }

    fun addRow(draft: WhimsicalKnightEngine.Board) = resized(draft, draft.rows + 1, draft.cols)

    fun addCol(draft: WhimsicalKnightEngine.Board) = resized(draft, draft.rows, draft.cols + 1)

    fun removeLastRow(draft: WhimsicalKnightEngine.Board) =
        if (draft.rows <= 2) draft else resized(draft, draft.rows - 1, draft.cols)

    fun removeLastCol(draft: WhimsicalKnightEngine.Board) =
        if (draft.cols <= 2) draft else resized(draft, draft.rows, draft.cols - 1)

    private fun grayGrid(draft: WhimsicalKnightEngine.Board, rows: Int, cols: Int) =
        List(rows - 1) { r -> List(cols - 1) { c -> if (draft.isGray(r, c)) 1 else 0 } }

    private fun resized(draft: WhimsicalKnightEngine.Board, rows: Int, cols: Int): WhimsicalKnightEngine.Board {
        val fits = { p: Point -> p.dr <= 2 * (rows - 1) && p.dc <= 2 * (cols - 1) }
        return WhimsicalKnightEngine.Board(
            rows,
            cols,
            grayGrid(draft, rows, cols),
            draft.circles.filter(fits),
            draft.squares.filter(fits),
        )
    }

    /** Problems the API rejects too (port of whimsicalKnightFormatProblems); they block saving. */
    fun formatProblems(draft: WhimsicalKnightEngine.Board): List<String> = buildList {
        if (draft.gray.size != draft.rows - 1 || draft.gray.any { it.size != draft.cols - 1 }) {
            add("Gray grid must be ${draft.rows - 1}x${draft.cols - 1}")
        }
        val seen = mutableSetOf<Point>()
        for ((isCircle, p) in draft.clues) {
            val at = "${if (isCircle) "circle" else "square"} at (${p.dr},${p.dc})"
            when {
                p.dr !in 0..2 * (draft.rows - 1) || p.dc !in 0..2 * (draft.cols - 1) -> add("The $at is outside the lattice")
                p.dr % 2 == 1 && p.dc % 2 == 1 -> add("The $at is in a cell")
                !isCircle && !p.onDot -> add("The $at is not on a dot")
            }
            if (!seen.add(p)) add("Two clues at (${p.dr},${p.dc})")
        }
    }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: WhimsicalKnightEngine.Board): List<String> = buildList {
        if (draft.rows < 2 || draft.cols < 2) {
            add("No dots")
            return@buildList
        }
        addAll(formatProblems(draft))
        if (draft.circles.isEmpty() && draft.squares.isEmpty()) add("No circles or squares")
    }
}
