package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.DoubleChocoEngine.Cell
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable grid of a double choco being authored: cells[r][c] is white or gray with
 * an optional number (0 = none), exactly the canon's cells. Always rectangular.
 */
data class DoubleChocoDraft(val cells: List<List<Cell>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun inGrid(col: Int, row: Int): Boolean = row in 0 until rows && col in 0 until cols

    fun cellAt(col: Int, row: Int): Cell = cells.getOrNull(row)?.getOrNull(col) ?: WHITE

    companion object {
        val WHITE = Cell(gray = false, number = 0)
    }
}

/**
 * Pure helpers for authoring a double choco question in the Admin screen, the analog of
 * frontend/src/components/DoubleChocoEditor.tsx. The parser returns the canon
 * `{ cells: [[color, number]] }`; the review step fixes mis-read colors and numbers and
 * phantom/missed lines.
 *
 * Every layout is a valid canon, so there are no format problems. [problems] catches what
 * can't be right on its face — no gray or no white cells, unequal white and gray totals
 * (every room is half of each), a number bigger than either color's total — which the
 * admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object DoubleChocoAuthoring {

    const val PUZZLE_TYPE = 4

    /** Read a parser canon into a draft (ragged rows padded with white, missing/invalid -> empty). */
    fun draftFromCanon(canon: JsonObject): DoubleChocoDraft {
        val rowsArr = canon["cells"] as? JsonArray ?: return DoubleChocoDraft()
        val parsed = rowsArr.map { row ->
            (row as? JsonArray)?.map { cell ->
                val pair = cell as? JsonArray
                val color = (pair?.getOrNull(0) as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
                val number = (pair?.getOrNull(1) as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
                Cell(gray = color == 1, number = number.coerceAtLeast(0))
            } ?: emptyList()
        }
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        if (cols == 0) return DoubleChocoDraft()
        return DoubleChocoDraft(parsed.map { row -> row + List(cols - row.size) { DoubleChocoDraft.WHITE } })
    }

    /** The canon `{ cells }` to POST. */
    fun canonFromDraft(draft: DoubleChocoDraft): JsonObject = JsonObject(
        mapOf(
            "cells" to JsonArray(draft.cells.map { row ->
                JsonArray(row.map { JsonArray(listOf(JsonPrimitive(if (it.gray) 1 else 0), JsonPrimitive(it.number))) })
            })
        )
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id keys
     * the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: DoubleChocoDraft): Puzzle = Puzzle(
        id = "admin-double-choco-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "double-choco",
        puzzleTypeJpLabel = "ダブルチョコ",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Make (col, row) gray or white, keeping its number. */
    fun setGray(draft: DoubleChocoDraft, col: Int, row: Int, gray: Boolean): DoubleChocoDraft =
        update(draft, col, row) { it.copy(gray = gray) }

    /** Set the number of (col, row); null clears it. */
    fun setNumber(draft: DoubleChocoDraft, col: Int, row: Int, number: Int?): DoubleChocoDraft =
        update(draft, col, row) { it.copy(number = number ?: 0) }

    /** Parse a typed number: digits only; blank or 0 -> null (no number, as in the canon). */
    fun parseNumber(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()?.takeIf { it > 0 }

    /** Append a white row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: DoubleChocoDraft): DoubleChocoDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { DoubleChocoDraft.WHITE }))

    /** Append a white column at the right. */
    fun addCol(draft: DoubleChocoDraft): DoubleChocoDraft =
        draft.copy(cells = draft.cells.map { it + DoubleChocoDraft.WHITE })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: DoubleChocoDraft, row: Int): DoubleChocoDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: DoubleChocoDraft, col: Int): DoubleChocoDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: DoubleChocoDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        val all = draft.cells.flatten()
        val gray = all.count { it.gray }
        val white = all.size - gray
        if (gray == 0) add("No gray cells")
        if (white == 0) add("No white cells")
        if (gray != white && gray > 0 && white > 0) {
            add("$white white and $gray gray cells; every room is half of each, so they must match")
        }
        val max = minOf(gray, white)
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val n = draft.cells[r][c].number
                if (n > max && max > 0) add("R${r + 1}C${c + 1} says $n but there are only $max cells of a color")
            }
        }
    }

    private fun update(draft: DoubleChocoDraft, col: Int, row: Int, f: (Cell) -> Cell): DoubleChocoDraft {
        if (!draft.inGrid(col, row)) return draft
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) f(old) else old }
        })
    }
}
