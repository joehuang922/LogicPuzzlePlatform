package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HalfFullPaintEngine.Board
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a Half-Full Paint question in the Admin screen, the analog of
 * frontend/src/components/HalfFullPaintEditor.tsx. The draft is the [HalfFullPaintEngine.Board].
 *
 * A wall key ("h:r,c" / "v:r,c") toggles a room wall; a tap snapped to a grid-line point
 * cycles its circle none -> white -> gray -> black -> none (the web's order). Rows and
 * columns are added or removed at any edge: new cells are walled off from the old board,
 * and circles shift with the board (dropped when they leave its interior).
 * [formatProblemCells] mirrors halfFullPaintFormatProblems (and the API) and blocks
 * saving; [problems] adds the misread warnings an admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object HalfFullPaintAuthoring {

    const val PUZZLE_TYPE = 48

    /** The canon's board with both wall grids made exactly the board's size. */
    fun draftFromCanon(canon: JsonObject): Board {
        val b = HalfFullPaintEngine.boardFromCanon(canon)
        return b.copy(
            h = List(maxOf(b.rows - 1, 0)) { r -> List(b.cols) { c -> if (b.wallBelow(r, c)) 1 else 0 } },
            v = List(b.rows) { r -> List(maxOf(b.cols - 1, 0)) { c -> if (b.wallRight(r, c)) 1 else 0 } },
            circles = sorted(b.circles),
        )
    }

    fun canonFromDraft(draft: Board): JsonObject = HalfFullPaintEngine.canonOf(draft)

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: Board): Puzzle = Puzzle(
        id = "admin-half-full-paint-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "half-full-paint",
        puzzleTypeJpLabel = "半全ペイント",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Toggle the wall with key "h:r,c" / "v:r,c". */
    fun toggleWall(draft: Board, key: String): Board {
        val m = Regex("""([hv]):(\d+),(\d+)""").matchEntire(key) ?: return draft
        val r = m.groupValues[2].toInt()
        val c = m.groupValues[3].toInt()
        fun flip(g: List<List<Int>>) = g.mapIndexed { i, row -> if (i != r) row else row.mapIndexed { j, v -> if (j == c) 1 - v else v } }
        return if (m.groupValues[1] == "h") {
            if (r in 0 until draft.rows - 1 && c in 0 until draft.cols) draft.copy(h = flip(draft.h)) else draft
        } else {
            if (r in 0 until draft.rows && c in 0 until draft.cols - 1) draft.copy(v = flip(draft.v)) else draft
        }
    }

    /** Cycle the circle at (dr, dc): none -> white -> gray -> black -> none. Invalid points are no-ops. */
    fun cycleCircle(draft: Board, dr: Int, dc: Int): Board {
        if (!KuralinEngine.isValidPoint(dr, dc, draft.rows, draft.cols)) return draft
        val rest = draft.circles.filterNot { it.dr == dr && it.dc == dc }
        val next = when (draft.circles.firstOrNull { it.dr == dr && it.dc == dc }?.color) {
            null -> KuralinEngine.WHITE_CIRCLE
            KuralinEngine.WHITE_CIRCLE -> KuralinEngine.GRAY_CIRCLE
            KuralinEngine.GRAY_CIRCLE -> KuralinEngine.BLACK_CIRCLE
            else -> null
        }
        return draft.copy(circles = sorted(if (next == null) rest else rest + KuralinEngine.Circle(dr, dc, next)))
    }

    /** Add a row at the top or bottom, walled off from the old cells and open along itself. */
    fun addRow(draft: Board, top: Boolean = false) = Board(
        rows = draft.rows + 1,
        cols = draft.cols,
        h = draft.h.plusEdgeRow(top, draft.cols, 1),
        v = draft.v.plusEdgeRow(top, maxOf(draft.cols - 1, 0), 0),
        circles = shifted(draft.circles, edgeShift(top, add = true), 0, draft.rows + 1, draft.cols),
    )

    /** Add a column at the left or right, walled off the same way. */
    fun addCol(draft: Board, left: Boolean = false) = Board(
        rows = draft.rows,
        cols = draft.cols + 1,
        h = draft.h.plusEdgeCol(left, 0),
        v = draft.v.plusEdgeCol(left, 1),
        circles = shifted(draft.circles, 0, edgeShift(left, add = true), draft.rows, draft.cols + 1),
    )

    /** Drop the top or bottom row with its walls and circles. Keeps at least two rows. */
    fun removeEdgeRow(draft: Board, top: Boolean) = if (draft.rows <= 2) draft else Board(
        rows = draft.rows - 1,
        cols = draft.cols,
        h = draft.h.minusEdgeRow(top),
        v = draft.v.minusEdgeRow(top),
        circles = shifted(draft.circles, edgeShift(top, add = false), 0, draft.rows - 1, draft.cols),
    )

    /** Drop the left or right column with its walls and circles. Keeps at least two columns. */
    fun removeEdgeCol(draft: Board, left: Boolean) = if (draft.cols <= 2) draft else Board(
        rows = draft.rows,
        cols = draft.cols - 1,
        h = draft.h.minusEdgeCol(left),
        v = draft.v.minusEdgeCol(left),
        circles = shifted(draft.circles, 0, edgeShift(left, add = false), draft.rows, draft.cols - 1),
    )

    /** Circles moved by ([dr], [dc]) cells (two lattice steps each), kept inside the new board. */
    private fun shifted(circles: List<KuralinEngine.Circle>, dr: Int, dc: Int, rows: Int, cols: Int) =
        sorted(circles.map { it.copy(dr = it.dr + 2 * dr, dc = it.dc + 2 * dc) }
            .filter { KuralinEngine.isValidPoint(it.dr, it.dc, rows, cols) })

    private fun sorted(circles: List<KuralinEngine.Circle>) = circles.sortedWith(compareBy({ it.dr }, { it.dc }))

    data class Problem(val message: String, val r: Int, val c: Int)

    /** Port of halfFullPaintFormatProblems: the API rejects these, so they block saving. */
    fun formatProblemCells(draft: Board): List<Problem> = buildList {
        val rows = draft.rows
        val cols = draft.cols
        val fits = { g: List<List<Int>>, hh: Int, ww: Int -> g.size == hh && g.all { it.size == ww } }
        if (rows < 1 || cols < 1 || !fits(draft.h, rows - 1, cols) || !fits(draft.v, rows, cols - 1)) {
            add(Problem("Walls don't match the ${cols}x$rows grid", 0, 0))
            return@buildList
        }
        val (ids, _) = HalfFullPaintEngine.rooms(draft)
        for (r in 0 until rows) for (c in 0 until cols) {
            val inside = (r < rows - 1 && draft.wallBelow(r, c) && ids[r][c] == ids[r + 1][c]) ||
                (c < cols - 1 && draft.wallRight(r, c) && ids[r][c] == ids[r][c + 1])
            if (inside) add(Problem("Wall at R${r + 1}C${c + 1} doesn't close off a room", r, c))
        }
        val seen = HashSet<Pair<Int, Int>>()
        for (circle in draft.circles) {
            val at = minOf(rows - 1, maxOf(0, (circle.dr - 1) / 2)) to minOf(cols - 1, maxOf(0, (circle.dc - 1) / 2))
            if (circle.dr < 1 || circle.dc < 1 || circle.dr > 2 * rows - 1 || circle.dc > 2 * cols - 1) {
                add(Problem("Circle at (${circle.dr},${circle.dc}) is outside the grid", at.first, at.second))
            } else if (circle.dr % 2 == 1 && circle.dc % 2 == 1) {
                add(Problem("Circle at (${circle.dr},${circle.dc}) is at a cell centre", at.first, at.second))
            }
            if (!seen.add(circle.dr to circle.dc)) {
                add(Problem("Two circles at (${circle.dr},${circle.dc})", at.first, at.second))
            }
        }
    }

    /** Port of halfFullPaintWarnings: misreads an admin may override. */
    fun warningCells(draft: Board): List<Problem> = buildList {
        if (draft.circles.isEmpty()) add(Problem("No circles", 0, 0))
        if (HalfFullPaintEngine.rooms(draft).second <= 1) add(Problem("Only one room", 0, 0))
    }

    fun formatProblems(draft: Board): List<String> = formatProblemCells(draft).map { it.message }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: Board): List<String> {
        if (draft.rows < 2 || draft.cols < 2) return listOf("No grid")
        val format = formatProblems(draft)
        return if (format.isNotEmpty()) format else warningCells(draft).map { it.message }
    }
}
