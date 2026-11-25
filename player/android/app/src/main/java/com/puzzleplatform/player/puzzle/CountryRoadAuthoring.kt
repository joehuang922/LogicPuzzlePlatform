package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.CountryRoadEngine.Board
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a Country Road question in the Admin screen, the analog of
 * frontend/src/components/CountryRoadEditor.tsx. The draft is the [CountryRoadEngine.Board].
 *
 * A wall key ("h:r,c" / "v:r,c") toggles a room wall; a cell's number is set directly
 * (null clears it). Rows and columns are added or removed at the bottom/right edge; new
 * cells are walled off from the old board and join each other. [formatProblems] mirrors
 * countryRoadFormatProblems (and the API) and blocks saving; [problems] adds the misread
 * warnings an admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object CountryRoadAuthoring {

    const val PUZZLE_TYPE = 41

    /** The canon's board with every grid made exactly the cells' size. */
    fun draftFromCanon(canon: JsonObject): Board {
        val b = CountryRoadEngine.boardFromCanon(canon)
        val cols = b.cells.maxOfOrNull { it.size } ?: 0
        return Board(
            cells = List(b.rows) { r -> List(cols) { c -> b.cells[r].getOrNull(c)?.coerceAtLeast(0) ?: 0 } },
            h = List(maxOf(b.rows - 1, 0)) { r -> List(cols) { c -> b.h.getOrNull(r)?.getOrNull(c) ?: 0 } },
            v = List(b.rows) { r -> List(maxOf(cols - 1, 0)) { c -> b.v.getOrNull(r)?.getOrNull(c) ?: 0 } },
        )
    }

    fun canonFromDraft(draft: Board): JsonObject = CountryRoadEngine.canonOf(draft)

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: Board): Puzzle = Puzzle(
        id = "admin-country-road-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "country-road",
        puzzleTypeJpLabel = "カントリーロード",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** A room number: positive, blank (or 0) is none. */
    fun parseNumber(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()?.takeIf { it > 0 }

    fun setNumber(draft: Board, r: Int, c: Int, n: Int?): Board {
        if (r !in 0 until draft.rows || c !in 0 until draft.cols) return draft
        return draft.copy(cells = draft.cells.mapIndexed { i, row ->
            if (i != r) row else row.mapIndexed { j, v -> if (j == c) (n ?: 0).coerceAtLeast(0) else v }
        })
    }

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

    /** Add a row at the top or bottom: walled off from the old cells, open along itself (web: resize). */
    fun addRow(draft: Board, top: Boolean = false) = Board(
        cells = draft.cells.plusEdgeRow(top, draft.cols, 0),
        h = draft.h.plusEdgeRow(top, draft.cols, 1),
        v = draft.v.plusEdgeRow(top, maxOf(draft.cols - 1, 0), 0),
    )

    /** Add a column at the left or right, walled off the same way. */
    fun addCol(draft: Board, left: Boolean = false) = Board(
        cells = draft.cells.plusEdgeCol(left, 0),
        h = draft.h.plusEdgeCol(left, 0),
        v = draft.v.plusEdgeCol(left, 1),
    )

    /** Drop the top or bottom row with its walls. Keeps at least two rows. */
    fun removeEdgeRow(draft: Board, top: Boolean) = if (draft.rows <= 2) draft else Board(
        cells = draft.cells.minusEdgeRow(top),
        h = draft.h.minusEdgeRow(top),
        v = draft.v.minusEdgeRow(top),
    )

    /** Drop the left or right column with its walls. Keeps at least two columns. */
    fun removeEdgeCol(draft: Board, left: Boolean) = if (draft.cols <= 2) draft else Board(
        cells = draft.cells.minusEdgeCol(left),
        h = draft.h.minusEdgeCol(left),
        v = draft.v.minusEdgeCol(left),
    )

    data class Problem(val message: String, val r: Int, val c: Int)

    /** Port of countryRoadFormatProblems: the API rejects these, so they block saving. */
    fun formatProblemCells(draft: Board): List<Problem> = buildList {
        val rows = draft.rows
        val cols = draft.cols
        if (rows == 0 || cols == 0 || draft.cells.any { it.size != cols }) {
            add(Problem("Rows of cells differ in length", 0, 0))
            return@buildList
        }
        val fits = { g: List<List<Int>>, hh: Int, ww: Int -> g.size == hh && g.all { it.size == ww } }
        if (!fits(draft.h, rows - 1, cols) || !fits(draft.v, rows, cols - 1)) {
            add(Problem("Walls don't match the ${cols}x$rows grid", 0, 0))
            return@buildList
        }
        val (ids, _) = CountryRoadEngine.rooms(draft)
        for (r in 0 until rows) for (c in 0 until cols) {
            val inside = (r < rows - 1 && draft.wallBelow(r, c) && ids[r][c] == ids[r + 1][c]) ||
                (c < cols - 1 && draft.wallRight(r, c) && ids[r][c] == ids[r][c + 1])
            if (inside) add(Problem("Wall at R${r + 1}C${c + 1} doesn't close off a room", r, c))
        }
        val first = HashMap<Int, String>()
        for (r in 0 until rows) for (c in 0 until cols) {
            if (draft.number(r, c) <= 0) continue
            val prev = first[ids[r][c]]
            if (prev != null) add(Problem("Two numbers in one room ($prev and R${r + 1}C${c + 1})", r, c))
            else first[ids[r][c]] = "R${r + 1}C${c + 1}"
        }
    }

    /** Port of countryRoadWarnings: misreads an admin may override. */
    fun warningCells(draft: Board): List<Problem> = buildList {
        val (ids, count) = CountryRoadEngine.rooms(draft)
        val size = IntArray(count)
        ids.forEach { row -> row.forEach { size[it]++ } }
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            val n = draft.number(r, c)
            if (n > 0 && n > size[ids[r][c]]) {
                add(Problem("Number $n at R${r + 1}C${c + 1} is more than its room's ${size[ids[r][c]]} cells", r, c))
            }
        }
        if (count <= 1) add(Problem("Only one room", 0, 0))
    }

    fun formatProblems(draft: Board): List<String> = formatProblemCells(draft).map { it.message }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: Board): List<String> {
        if (draft.rows < 2 || draft.cols < 2) return listOf("No grid")
        val format = formatProblems(draft)
        return if (format.isNotEmpty()) format else warningCells(draft).map { it.message }
    }
}
