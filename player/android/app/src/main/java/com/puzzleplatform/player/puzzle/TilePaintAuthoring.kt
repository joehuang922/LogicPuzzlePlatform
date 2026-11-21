package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.TilePaintEngine.Board
import com.puzzleplatform.player.puzzle.TilePaintEngine.Clue
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a Tile Paint question in the Admin screen, the analog of
 * frontend/src/components/TilePaintEditor.tsx. The draft is the [TilePaintEngine.Board].
 *
 * A wall key ("h:r,c" / "v:r,c") toggles the wall between two tile cells; a cell toggles
 * between tile cell and clue cell, and a clue cell's right / down numbers are set
 * directly. Rows and columns are added or removed at the bottom/right edge; new cells are
 * single-cell tiles (a new top row / left column cell is a clue cell, like the print).
 * Edges beside a clue cell are kept normalised: 1 against a tile cell, 0 between clues.
 * [formatProblems] mirrors tilePaintFormatProblems (and the API) and blocks saving;
 * [problems] adds the misread warnings an admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object TilePaintAuthoring {

    const val PUZZLE_TYPE = 40

    /** The canon's board with walls made exactly the grid's size and clue edges normalised. */
    fun draftFromCanon(canon: JsonObject): Board {
        val b = TilePaintEngine.boardFromCanon(canon)
        val cols = b.cells.maxOfOrNull { it.size } ?: 0
        return resized(b, b.cells.size, cols)
    }

    fun canonFromDraft(draft: Board): JsonObject = TilePaintEngine.canonOf(draft)

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: Board): Puzzle = Puzzle(
        id = "admin-tile-paint-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "tile-paint",
        puzzleTypeJpLabel = "タイルペイント",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** A clue number: 0 counts, blank is null. */
    fun parseNumber(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()

    /** Make (r, c) a clue cell (no numbers yet) or, if it is one, a single-cell tile. */
    fun toggleClueCell(draft: Board, r: Int, c: Int): Board {
        if (r !in 0 until draft.rows || c !in 0 until draft.cols) return draft
        val toClue = draft.cells[r][c] == null
        val cells = draft.cells.mapIndexed { i, row ->
            if (i != r) row else row.mapIndexed { j, v -> if (j == c) (if (toClue) Clue() else null) else v }
        }
        // A new tile cell starts walled in on every side.
        fun set(g: List<List<Int>>, rr: Int, cc: Int) =
            g.mapIndexed { i, row -> if (i != rr) row else row.mapIndexed { j, v -> if (j == cc) 1 else v } }
        var h = draft.h
        var v = draft.v
        if (!toClue) {
            if (r > 0) h = set(h, r - 1, c)
            if (r < draft.rows - 1) h = set(h, r, c)
            if (c > 0) v = set(v, r, c - 1)
            if (c < draft.cols - 1) v = set(v, r, c)
        }
        return normalized(Board(cells, h, v))
    }

    /** Set (or with null clear) the right / down number of the clue cell at (r, c). */
    fun setNumber(draft: Board, r: Int, c: Int, right: Boolean, n: Int?): Board {
        val clue = draft.cells.getOrNull(r)?.getOrNull(c) ?: return draft
        val next = if (right) clue.copy(right = n) else clue.copy(down = n)
        return draft.copy(cells = draft.cells.mapIndexed { i, row ->
            if (i != r) row else row.mapIndexed { j, v -> if (j == c) next else v }
        })
    }

    /** Toggle the wall with key "h:r,c" / "v:r,c"; only between two tile cells. */
    fun toggleWall(draft: Board, key: String): Board {
        val m = Regex("""([hv]):(\d+),(\d+)""").matchEntire(key) ?: return draft
        val kind = m.groupValues[1]
        val r = m.groupValues[2].toInt()
        val c = m.groupValues[3].toInt()
        val (r2, c2) = if (kind == "h") (r + 1) to c else r to (c + 1)
        if (!draft.isTile(r, c) || !draft.isTile(r2, c2)) return draft
        fun flip(g: List<List<Int>>) = g.mapIndexed { i, row -> if (i != r) row else row.mapIndexed { j, v -> if (j == c) 1 - v else v } }
        return if (kind == "h") draft.copy(h = flip(draft.h)) else draft.copy(v = flip(draft.v))
    }

    fun addRow(draft: Board) = resized(draft, draft.rows + 1, draft.cols)

    fun addCol(draft: Board) = resized(draft, draft.rows, draft.cols + 1)

    fun removeLastRow(draft: Board) = if (draft.rows <= 2) draft else resized(draft, draft.rows - 1, draft.cols)

    fun removeLastCol(draft: Board) = if (draft.cols <= 2) draft else resized(draft, draft.rows, draft.cols - 1)

    private fun resized(d: Board, rows: Int, cols: Int): Board {
        val cells = List(rows) { r ->
            List(cols) { c ->
                if (r < d.cells.size && c < (d.cells.getOrNull(r)?.size ?: 0)) d.cells[r][c]
                else if (r == 0 || c == 0) Clue() else null
            }
        }
        val h = List(maxOf(rows - 1, 0)) { r -> List(cols) { c -> d.h.getOrNull(r)?.getOrNull(c) ?: 1 } }
        val v = List(rows) { r -> List(maxOf(cols - 1, 0)) { c -> d.v.getOrNull(r)?.getOrNull(c) ?: 1 } }
        return normalized(Board(cells, h, v))
    }

    /** Edges beside a clue cell: 1 against a tile cell, 0 between two clue cells. */
    fun normalized(d: Board): Board {
        val h = d.h.mapIndexed { r, row ->
            row.mapIndexed { c, w ->
                val a = d.isTile(r, c)
                val b = d.isTile(r + 1, c)
                if (a && b) w else if (a != b) 1 else 0
            }
        }
        val v = d.v.mapIndexed { r, row ->
            row.mapIndexed { c, w ->
                val a = d.isTile(r, c)
                val b = d.isTile(r, c + 1)
                if (a && b) w else if (a != b) 1 else 0
            }
        }
        return d.copy(h = h, v = v)
    }

    /** A problem with the cell (row, col) to mark on the board. */
    data class Problem(val message: String, val r: Int, val c: Int)

    /** Port of tilePaintFormatProblems: the API rejects these, so they block saving. */
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
        val (ids, _) = TilePaintEngine.tiles(draft)
        for (r in 0 until rows) for (c in 0 until cols) {
            val inside =
                (draft.isTile(r, c) && draft.isTile(r + 1, c) && draft.h[r][c] == 1 && ids[r][c] == ids[r + 1][c]) ||
                    (draft.isTile(r, c) && draft.isTile(r, c + 1) && draft.v[r][c] == 1 && ids[r][c] == ids[r][c + 1])
            if (inside) add(Problem("Wall at R${r + 1}C${c + 1} doesn't close off a tile", r, c))
        }
        for (run in TilePaintEngine.runs(draft)) {
            if (run.cells.isEmpty()) {
                add(Problem("The ${if (run.right) "right" else "down"} clue at R${run.r + 1}C${run.c + 1} has no cells to count", run.r, run.c))
            }
        }
    }

    /** Port of tilePaintWarnings: misreads an admin may override. */
    fun warningCells(draft: Board): List<Problem> = buildList {
        val runs = TilePaintEngine.runs(draft)
        for (run in runs) {
            if (run.cells.isNotEmpty() && run.value > run.cells.size) {
                val dir = if (run.right) "right" else "down"
                add(Problem("The $dir clue ${run.value} at R${run.r + 1}C${run.c + 1} is more than its ${run.cells.size} cells", run.r, run.c))
            }
        }
        if (runs.isEmpty()) add(Problem("No clue numbers", 0, 0))
        if (TilePaintEngine.tiles(draft).second == 0) add(Problem("No tiles", 0, 0))
    }

    fun formatProblems(draft: Board): List<String> = formatProblemCells(draft).map { it.message }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: Board): List<String> {
        if (draft.rows < 2 || draft.cols < 2) return listOf("No grid")
        val format = formatProblems(draft)
        return if (format.isNotEmpty()) format else warningCells(draft).map { it.message }
    }
}
