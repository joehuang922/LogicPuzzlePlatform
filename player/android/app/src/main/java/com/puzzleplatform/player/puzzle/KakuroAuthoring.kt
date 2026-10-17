package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.KakuroEngine.Cell
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable grid of a kakuro being authored: cells[r][c] is a clue cell (dark, with
 * optional across/down sums) or a white cell. Always rectangular.
 */
data class KakuroDraft(val cells: List<List<Cell>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun cellAt(col: Int, row: Int): Cell? = cells.getOrNull(row)?.getOrNull(col)
}

/**
 * Pure helpers for authoring a kakuro question in the Admin screen, the analog of
 * frontend/src/components/KakuroEditor.tsx. The parser returns the canon `{ cells }`
 * directly; the review step fixes mis-read cells (clue vs white) and sums, then the
 * server's solver gate (player/solver/src/plugins/kakuro) proves a unique solution.
 *
 * [problems] flags the misreads that can't be right before the gate is asked: a sum
 * with no white cells to cover, white cells no sum covers, and a sum its run's length
 * can't make with distinct digits 1-9.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object KakuroAuthoring {

    const val PUZZLE_TYPE = 12

    /** Sums the canon schema allows (1+…+9 = 45). */
    val SUM_RANGE = 1..45

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows with blank clue cells. */
    fun draftFromCanon(canon: JsonObject): KakuroDraft {
        val parsed = KakuroEngine.parseCells(previewPuzzle(KakuroDraft()).copy(canonRepr = canon))
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return KakuroDraft(parsed.map { row -> row + List(cols - row.size) { BLANK_CLUE } })
    }

    /** The canon `{ cells }` to POST. Out-of-range sums are dropped (sent as null). */
    fun canonFromDraft(draft: KakuroDraft): JsonObject = JsonObject(
        mapOf(
            "cells" to JsonArray(draft.cells.map { row ->
                JsonArray(row.map { cell ->
                    when (cell) {
                        is Cell.Clue -> JsonObject(
                            mapOf(
                                "type" to JsonPrimitive("clue"),
                                "right" to sumJson(cell.right),
                                "down" to sumJson(cell.down),
                            )
                        )
                        Cell.Empty -> JsonObject(mapOf("type" to JsonPrimitive("empty")))
                    }
                })
            })
        )
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size: editing a sum
     * keeps the view where it is, while adding or deleting a line re-fits it.
     */
    fun previewPuzzle(draft: KakuroDraft): Puzzle = Puzzle(
        id = "admin-kakuro-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "kakuro",
        puzzleTypeJpLabel = "カックロ",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Flip a cell between white and a (blank) clue cell — the fix for a misread cell type. */
    fun toggleCell(draft: KakuroDraft, col: Int, row: Int): KakuroDraft =
        when (draft.cellAt(col, row)) {
            null -> draft
            Cell.Empty -> setCell(draft, col, row, BLANK_CLUE)
            is Cell.Clue -> setCell(draft, col, row, Cell.Empty)
        }

    /** Set a clue cell's across ([right]) and down sums; null clears one. No-op on a white cell. */
    fun setClue(draft: KakuroDraft, col: Int, row: Int, right: Int?, down: Int?): KakuroDraft =
        if (draft.cellAt(col, row) is Cell.Clue) setCell(draft, col, row, Cell.Clue(right, down)) else draft

    /** Set just the across sum of the clue cell at (col, row), keeping its down sum. */
    fun setAcross(draft: KakuroDraft, col: Int, row: Int, sum: Int?): KakuroDraft =
        (draft.cellAt(col, row) as? Cell.Clue)?.let { setClue(draft, col, row, sum, it.down) } ?: draft

    /** Set just the down sum of the clue cell at (col, row), keeping its across sum. */
    fun setDown(draft: KakuroDraft, col: Int, row: Int, sum: Int?): KakuroDraft =
        (draft.cellAt(col, row) as? Cell.Clue)?.let { setClue(draft, col, row, it.right, sum) } ?: draft

    /** Parse a typed sum: digits only; blank -> null (no sum). */
    fun parseSum(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()

    /** Append a row of blank clue cells at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: KakuroDraft): KakuroDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { BLANK_CLUE }))

    /** Append a column of blank clue cells at the right. */
    fun addCol(draft: KakuroDraft): KakuroDraft =
        draft.copy(cells = draft.cells.map { it + BLANK_CLUE })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: KakuroDraft, row: Int): KakuroDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: KakuroDraft, col: Int): KakuroDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Smallest and largest sum [length] distinct digits 1-9 can make, or null past 9 cells. */
    fun sumBounds(length: Int): IntRange? {
        if (length !in 1..9) return null
        val min = (1..length).sum()
        val max = (9 downTo 10 - length).sum()
        return min..max
    }

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: KakuroDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.cells.none { row -> row.any { it == Cell.Empty } }) add("No white cells")

        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                when (val cell = draft.cells[r][c]) {
                    is Cell.Clue -> {
                        cell.right?.let { checkSum(this, "R${r + 1}C${c + 1} across", it, runLength(draft, c, r, 1, 0)) }
                        cell.down?.let { checkSum(this, "R${r + 1}C${c + 1} down", it, runLength(draft, c, r, 0, 1)) }
                    }
                    Cell.Empty -> {
                        // Check each white run once, from its first cell: a run of 2+ needs a sum
                        // on the clue cell just before it (a lone cell is constrained the other way).
                        if (startsRun(draft, c, r, 1, 0) && runLength(draft, c - 1, r, 1, 0) > 1 && !hasSum(draft.cellAt(c - 1, r), across = true)) {
                            add("White cells from R${r + 1}C${c + 1} have no across sum")
                        }
                        if (startsRun(draft, c, r, 0, 1) && runLength(draft, c, r - 1, 0, 1) > 1 && !hasSum(draft.cellAt(c, r - 1), across = false)) {
                            add("White cells from R${r + 1}C${c + 1} have no down sum")
                        }
                    }
                }
            }
        }
    }

    private fun checkSum(out: MutableList<String>, where: String, sum: Int, length: Int) {
        val bounds = sumBounds(length)
        when {
            sum !in SUM_RANGE -> out.add("$where sum $sum is out of range")
            length == 0 -> out.add("$where sum $sum has no white cells")
            bounds == null -> out.add("$where run of $length cells is too long")
            sum !in bounds -> out.add("$where sum $sum can't be made with $length cells (${bounds.first}–${bounds.last})")
        }
    }

    /** White cells in a row starting just after (col, row), stepping by (dc, dr). */
    private fun runLength(draft: KakuroDraft, col: Int, row: Int, dc: Int, dr: Int): Int {
        var n = 0
        var c = col + dc
        var r = row + dr
        while (draft.cellAt(c, r) == Cell.Empty) { n++; c += dc; r += dr }
        return n
    }

    /** True when (col, row) is white and the cell before it (by -dc, -dr) is not. */
    private fun startsRun(draft: KakuroDraft, col: Int, row: Int, dc: Int, dr: Int): Boolean =
        draft.cellAt(col, row) == Cell.Empty && draft.cellAt(col - dc, row - dr) != Cell.Empty

    private fun hasSum(cell: Cell?, across: Boolean): Boolean =
        cell is Cell.Clue && (if (across) cell.right else cell.down) != null

    private fun setCell(draft: KakuroDraft, col: Int, row: Int, cell: Cell): KakuroDraft =
        draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) cell else old }
        })

    private fun sumJson(sum: Int?) = if (sum != null && sum in SUM_RANGE) JsonPrimitive(sum) else JsonNull

    private val BLANK_CLUE = Cell.Clue(right = null, down = null)
}
