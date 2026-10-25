package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable grid of a shakashaka being authored: cells[r][c] is
 * [ShakashakaEngine.WHITE] (-1), a numbered black cell (0..4) or an unnumbered black cell
 * ([ShakashakaAuthoring.BLACK], 5). Always rectangular.
 */
data class ShakashakaDraft(val cells: List<List<Int>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun inGrid(col: Int, row: Int): Boolean = row in 0 until rows && col in 0 until cols

    fun cellAt(col: Int, row: Int): Int = cells.getOrNull(row)?.getOrNull(col) ?: ShakashakaEngine.WHITE

    fun isBlack(col: Int, row: Int): Boolean = inGrid(col, row) && cellAt(col, row) != ShakashakaEngine.WHITE
}

/**
 * Pure helpers for authoring a shakashaka question in the Admin screen. The parser
 * returns the canon `{ cells }` directly; the review step fixes mis-read black cells and
 * numbers and phantom/missed lines.
 *
 * Shakashaka has no solver gate, so the server only checks the schema. [problems] catches
 * what can't be right on its face: no black cells at all, and a number bigger than the
 * count of white cells around it (only white neighbours can hold a triangle).
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object ShakashakaAuthoring {

    const val PUZZLE_TYPE = 11

    /** An unnumbered black cell. */
    const val BLACK = 5

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows with white and clamping unknown values to white. */
    fun draftFromCanon(canon: JsonObject): ShakashakaDraft {
        val parsed = ShakashakaEngine.parseCells(previewPuzzle(ShakashakaDraft()).copy(canonRepr = canon))
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return ShakashakaDraft(parsed.map { row ->
            row.map { if (it in 0..BLACK) it else ShakashakaEngine.WHITE } +
                List(cols - row.size) { ShakashakaEngine.WHITE }
        })
    }

    /** The canon `{ cells }` to POST. */
    fun canonFromDraft(draft: ShakashakaDraft): JsonObject = JsonObject(
        mapOf("cells" to JsonArray(draft.cells.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }))
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: ShakashakaDraft): Puzzle = Puzzle(
        id = "admin-shakashaka-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "shakashaka",
        puzzleTypeJpLabel = "シャカシャカ",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Make (col, row) white. */
    fun setWhite(draft: ShakashakaDraft, col: Int, row: Int): ShakashakaDraft =
        setCell(draft, col, row, ShakashakaEngine.WHITE)

    /** Make (col, row) black, numbered with [number] (0..4) or unnumbered when null. Other numbers are no-ops. */
    fun setBlack(draft: ShakashakaDraft, col: Int, row: Int, number: Int?): ShakashakaDraft =
        if (number != null && number !in 0..4) draft else setCell(draft, col, row, number ?: BLACK)

    /** Parse a typed number: one digit; blank -> null. */
    fun parseNum(text: String): Int? = text.filter { it.isDigit() }.take(1).toIntOrNull()

    /** The white cells orthogonally next to (col, row) — the most triangles its number can count. */
    fun whiteNeighbours(draft: ShakashakaDraft, col: Int, row: Int): Int =
        listOf(col - 1 to row, col + 1 to row, col to row - 1, col to row + 1)
            .count { (c, r) -> draft.inGrid(c, r) && !draft.isBlack(c, r) }

    /** Append a white row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: ShakashakaDraft): ShakashakaDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { ShakashakaEngine.WHITE }))

    /** Append a white column at the right. */
    fun addCol(draft: ShakashakaDraft): ShakashakaDraft =
        draft.copy(cells = draft.cells.map { it + ShakashakaEngine.WHITE })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: ShakashakaDraft, row: Int): ShakashakaDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: ShakashakaDraft, col: Int): ShakashakaDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: ShakashakaDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.cells.all { row -> row.all { it == ShakashakaEngine.WHITE } }) add("No black cells")
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val n = draft.cells[r][c]
                if (n !in 0..4) continue
                val max = whiteNeighbours(draft, c, r)
                if (n > max) {
                    add("R${r + 1}C${c + 1} says $n but has ${if (max == 1) "1 white cell" else "$max white cells"} around it")
                }
            }
        }
    }

    private fun setCell(draft: ShakashakaDraft, col: Int, row: Int, value: Int): ShakashakaDraft {
        if (!draft.inGrid(col, row)) return draft
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) value else old }
        })
    }
}
