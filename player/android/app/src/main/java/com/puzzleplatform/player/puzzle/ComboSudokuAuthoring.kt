package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.ComboSudokuEngine.Subboard
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * A combo sudoku being authored: its boards, each with its own 9x9 givens, as in the
 * canon. Editing a cell writes every board that covers it, so shared cells stay in
 * step; moving a board carries its givens along (a mis-placed board is fixed by
 * moving it, as in the web editor).
 */
data class ComboSudokuDraft(val subboards: List<Subboard> = emptyList()) {
    val layout: ComboSudokuEngine.Layout get() = ComboSudokuEngine.Layout(subboards)

    /** Set (1-9) or clear (0) the given at global cell (col, row) in every board covering it. */
    fun withCell(col: Int, row: Int, digit: Int): ComboSudokuDraft = copy(
        subboards = subboards.map { sb ->
            if (!sb.covers(col, row)) sb
            else sb.copy(hints = sb.hints.mapIndexed { r, line ->
                if (r != row - sb.row0) line else line.mapIndexed { c, v -> if (c == col - sb.col0) digit else v }
            })
        },
    )

    /** Move board [index] by whole rooms; the layout is re-anchored at (0, 0). */
    fun moved(index: Int, dx: Int, dy: Int): ComboSudokuDraft {
        if (index !in subboards.indices) return this
        val next = subboards.mapIndexed { i, sb -> if (i == index) sb.copy(x = sb.x + dx, y = sb.y + dy) else sb }
        return ComboSudokuDraft(next).normalized()
    }

    /** Add an empty board to the right of the others. */
    fun withNewBoard(): ComboSudokuDraft {
        val x = subboards.maxOfOrNull { it.x + 3 } ?: 0
        return copy(subboards = subboards + Subboard(x, 0, List(9) { List(9) { 0 } }))
    }

    fun withoutBoard(index: Int): ComboSudokuDraft =
        ComboSudokuDraft(subboards.filterIndexed { i, _ -> i != index }).normalized()

    /** Shift every board so the leftmost and topmost sit at 0 (canon x, y are >= 0). */
    fun normalized(): ComboSudokuDraft {
        val minX = subboards.minOfOrNull { it.x } ?: 0
        val minY = subboards.minOfOrNull { it.y } ?: 0
        if (minX == 0 && minY == 0) return this
        return copy(subboards = subboards.map { it.copy(x = it.x - minX, y = it.y - minY) })
    }
}

object ComboSudokuAuthoring {
    const val PUZZLE_TYPE = 2

    fun draftFromCanon(canon: JsonObject): ComboSudokuDraft =
        ComboSudokuDraft(ComboSudokuEngine.parseSubboards(canon)).normalized()

    fun canonFromDraft(draft: ComboSudokuDraft): JsonObject = JsonObject(
        mapOf(
            "room_width" to JsonPrimitive(3),
            "room_height" to JsonPrimitive(3),
            "subboards" to JsonArray(draft.subboards.map { sb ->
                JsonObject(
                    mapOf(
                        "x" to JsonPrimitive(sb.x),
                        "y" to JsonPrimitive(sb.y),
                        "hints" to JsonArray(sb.hints.map { row ->
                            JsonArray(row.map { JsonPrimitive(if (it in 1..9) it else 0) })
                        }),
                    ),
                )
            }),
        ),
    )

    /**
     * The draft as a playable puzzle with every given *removed*, for the review board:
     * no cell is locked, and the givens ride in as userValues ([givens]) the way the
     * sudoku review does it.
     */
    fun reviewPuzzle(draft: ComboSudokuDraft): Puzzle = Puzzle(
        id = "admin-combo-sudoku-draft",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "combo-sudoku",
        puzzleTypeJpLabel = "合体数独",
        difficulty = 1,
        width = draft.layout.cols,
        height = draft.layout.rows,
        canonRepr = canonFromDraft(
            ComboSudokuDraft(draft.subboards.map { it.copy(hints = List(9) { List(9) { 0 } }) }),
        ),
    )

    /** The merged givens, "col,row" -> digit. */
    fun givens(draft: ComboSudokuDraft): Map<String, Int> = draft.layout.givens

    /**
     * Misread warnings (overridable): a digit repeated in a board's row, column or box —
     * an OCR slip, or a board placed one room off.
     */
    fun problems(draft: ComboSudokuDraft): List<String> {
        val layout = draft.layout
        val out = mutableListOf<String>()
        draft.subboards.forEachIndexed { i, sb ->
            val names = (0 until 9).map { "row ${it + 1}" } + (0 until 9).map { "column ${it + 1}" } +
                (0 until 9).map { "box ${it + 1}" }
            sb.units().forEachIndexed { u, unit ->
                val repeated = unit.mapNotNull { layout.givens[it] }.groupingBy { it }.eachCount()
                    .filterValues { it > 1 }.keys.sorted()
                if (repeated.isNotEmpty()) {
                    out += "Board ${i + 1}: ${repeated.joinToString(", ")} repeated in ${names[u]}"
                }
            }
        }
        return out
    }

    /**
     * Format problems (block creating): no board, two boards on the same spot, or two
     * boards giving a shared cell different digits (fix by retyping the cell).
     */
    fun formatProblems(draft: ComboSudokuDraft): List<String> {
        val out = mutableListOf<String>()
        if (draft.subboards.isEmpty()) out += "Add at least one board"
        val stacked = draft.subboards.groupBy { it.x to it.y }.filterValues { it.size > 1 }.keys
        for ((x, y) in stacked) out += "Two boards at the same place (room ${x + 1}, ${y + 1})"
        disagreements(draft).forEach { (col, row) ->
            out += "Overlapping boards give different digits at row ${row + 1}, column ${col + 1}"
        }
        return out
    }

    /** Shared cells where boards hold different nonzero digits, as (col, row). */
    fun disagreements(draft: ComboSudokuDraft): List<Pair<Int, Int>> {
        val seen = HashMap<Pair<Int, Int>, Int>()
        val bad = LinkedHashSet<Pair<Int, Int>>()
        for (sb in draft.subboards) for (r in 0 until 9) for (c in 0 until 9) {
            val v = sb.hints[r][c]
            if (v !in 1..9) continue
            val cell = sb.col0 + c to sb.row0 + r
            val prev = seen.putIfAbsent(cell, v)
            if (prev != null && prev != v) bad += cell
        }
        return bad.toList()
    }
}
