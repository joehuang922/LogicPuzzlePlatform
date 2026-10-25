package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/** Cell values of a [BlackCellDraft]; 0..4 are numbered black cells. */
object BlackCell {
    /** A white (playable) cell. */
    const val WHITE = -1

    /** An unnumbered black cell. */
    const val BLACK = 5
}

/**
 * The editable grid of a black-cell puzzle being authored (shakashaka, akari): cells[r][c]
 * is [BlackCell.WHITE], a numbered black cell (0..4) or [BlackCell.BLACK]. Always
 * rectangular.
 */
data class BlackCellDraft(val cells: List<List<Int>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun inGrid(col: Int, row: Int): Boolean = row in 0 until rows && col in 0 until cols

    fun cellAt(col: Int, row: Int): Int = cells.getOrNull(row)?.getOrNull(col) ?: BlackCell.WHITE

    fun isBlack(col: Int, row: Int): Boolean = inGrid(col, row) && cellAt(col, row) != BlackCell.WHITE
}

/**
 * Pure helpers for authoring a puzzle whose canon is `{ cells }` of white cells and black
 * cells with an optional 0..4 number — the number counting something placed in the
 * orthogonally neighbouring white cells (shakashaka triangles, akari bulbs). The parser
 * returns the canon directly; the review step fixes mis-read black cells and numbers and
 * phantom/missed lines.
 *
 * Neither type has a solver gate, so the server only checks the schema. [problems]
 * catches what can't be right on its face: no black cells at all, and a number bigger
 * than the count of white cells around it.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
open class BlackCellAuthoring(
    private val puzzleType: Int,
    private val typeName: String,
    private val jpLabel: String,
) {

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows with white and clamping unknown values to white. */
    fun draftFromCanon(canon: JsonObject): BlackCellDraft {
        val parsed = (canon["cells"] as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { v ->
                val n = (v as? JsonPrimitive)?.intOrNull
                if (n != null && n in 0..BlackCell.BLACK) n else BlackCell.WHITE
            } ?: emptyList()
        } ?: emptyList()
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return BlackCellDraft(parsed.map { row -> row + List(cols - row.size) { BlackCell.WHITE } })
    }

    /** The canon `{ cells }` to POST. */
    fun canonFromDraft(draft: BlackCellDraft): JsonObject = JsonObject(
        mapOf("cells" to JsonArray(draft.cells.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }))
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: BlackCellDraft): Puzzle = Puzzle(
        id = "admin-$typeName-draft-${draft.rows}x${draft.cols}",
        puzzleType = puzzleType,
        puzzleTypeName = typeName,
        puzzleTypeJpLabel = jpLabel,
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Make (col, row) white. */
    fun setWhite(draft: BlackCellDraft, col: Int, row: Int): BlackCellDraft =
        setCell(draft, col, row, BlackCell.WHITE)

    /** Make (col, row) black, numbered with [number] (0..4) or unnumbered when null. Other numbers are no-ops. */
    fun setBlack(draft: BlackCellDraft, col: Int, row: Int, number: Int?): BlackCellDraft =
        if (number != null && number !in 0..4) draft else setCell(draft, col, row, number ?: BlackCell.BLACK)

    /** Parse a typed number: one digit; blank -> null. */
    fun parseNum(text: String): Int? = text.filter { it.isDigit() }.take(1).toIntOrNull()

    /** The white cells orthogonally next to (col, row) — the most its number can count. */
    fun whiteNeighbours(draft: BlackCellDraft, col: Int, row: Int): Int =
        listOf(col - 1 to row, col + 1 to row, col to row - 1, col to row + 1)
            .count { (c, r) -> draft.inGrid(c, r) && !draft.isBlack(c, r) }

    /** Append a white row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: BlackCellDraft): BlackCellDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { BlackCell.WHITE }))

    /** Append a white column at the right. */
    fun addCol(draft: BlackCellDraft): BlackCellDraft =
        draft.copy(cells = draft.cells.map { it + BlackCell.WHITE })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: BlackCellDraft, row: Int): BlackCellDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: BlackCellDraft, col: Int): BlackCellDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: BlackCellDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.cells.all { row -> row.all { it == BlackCell.WHITE } }) add("No black cells")
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

    private fun setCell(draft: BlackCellDraft, col: Int, row: Int, value: Int): BlackCellDraft {
        if (!draft.inGrid(col, row)) return draft
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) value else old }
        })
    }
}

/** Authoring for shakashaka (type 11): numbers count the triangles around a black cell. */
object ShakashakaAuthoring : BlackCellAuthoring(11, "shakashaka", "シャカシャカ") {
    const val PUZZLE_TYPE = 11
}

/** Authoring for akari (type 18): numbers count the bulbs around a black wall. */
object AkariAuthoring : BlackCellAuthoring(18, "akari", "美術館") {
    const val PUZZLE_TYPE = 18
}
