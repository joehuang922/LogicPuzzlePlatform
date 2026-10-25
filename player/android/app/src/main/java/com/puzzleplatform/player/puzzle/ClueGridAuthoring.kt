package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * The editable grid of a number-clue puzzle being authored (number link, shikaku):
 * cells[r][c] is a positive clue, or 0 for none. Always rectangular.
 */
data class ClueGridDraft(val cells: List<List<Int>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun inGrid(col: Int, row: Int): Boolean = row in 0 until rows && col in 0 until cols

    fun cellAt(col: Int, row: Int): Int = cells.getOrNull(row)?.getOrNull(col) ?: 0
}

/**
 * Pure helpers for authoring a puzzle whose canon is `{ cells }` of 0 (no clue) and
 * positive number clues. The parser returns the canon directly; the review step fixes
 * mis-read clues and phantom/missed lines. Each type adds its own [problems] — what
 * can't be right on its face — since none of them has a solver gate.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
abstract class ClueGridAuthoring(
    private val puzzleType: Int,
    private val typeName: String,
    private val jpLabel: String,
) {

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows and clearing anything that isn't a positive clue. */
    fun draftFromCanon(canon: JsonObject): ClueGridDraft {
        val parsed = (canon["cells"] as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { v -> maxOf((v as? JsonPrimitive)?.intOrNull ?: 0, 0) } ?: emptyList()
        } ?: emptyList()
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return ClueGridDraft(parsed.map { row -> row + List(cols - row.size) { 0 } })
    }

    /** The canon `{ cells }` to POST. */
    fun canonFromDraft(draft: ClueGridDraft): JsonObject = JsonObject(
        mapOf("cells" to JsonArray(draft.cells.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }))
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: ClueGridDraft): Puzzle = Puzzle(
        id = "admin-$typeName-draft-${draft.rows}x${draft.cols}",
        puzzleType = puzzleType,
        puzzleTypeName = typeName,
        puzzleTypeJpLabel = jpLabel,
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Set the clue at (col, row); null (or anything below 1) clears it. */
    fun setClue(draft: ClueGridDraft, col: Int, row: Int, clue: Int?): ClueGridDraft {
        if (!draft.inGrid(col, row)) return draft
        val value = if (clue != null && clue > 0) clue else 0
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) value else old }
        })
    }

    /** Parse a typed clue: digits only; blank -> null (no clue). */
    fun parseClue(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()

    /** Append a blank row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: ClueGridDraft): ClueGridDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { 0 }))

    /** Append a blank column at the right. */
    fun addCol(draft: ClueGridDraft): ClueGridDraft =
        draft.copy(cells = draft.cells.map { it + 0 })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: ClueGridDraft, row: Int): ClueGridDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: ClueGridDraft, col: Int): ClueGridDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: ClueGridDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.cells.all { row -> row.all { it == 0 } }) {
            add("No clues")
            return@buildList
        }
        addAll(clueProblems(draft))
    }

    /** The type's own checks on a non-empty grid with at least one clue. */
    protected abstract fun clueProblems(draft: ClueGridDraft): List<String>

    protected fun at(r: Int, c: Int): String = "R${r + 1}C${c + 1}"
}

/**
 * Authoring for number link (type 17): every number is a path endpoint, so each one must
 * appear exactly twice.
 */
object NumberLinkAuthoring : ClueGridAuthoring(17, "number-link", "ナンバーリンク") {
    const val PUZZLE_TYPE = 17

    override fun clueProblems(draft: ClueGridDraft): List<String> {
        val seen = sortedMapOf<Int, MutableList<String>>()
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val n = draft.cells[r][c]
                if (n > 0) seen.getOrPut(n) { mutableListOf() } += at(r, c)
            }
        }
        return seen.mapNotNull { (n, where) ->
            when (where.size) {
                2 -> null
                1 -> "$n appears once (${where[0]}): each number needs a pair"
                else -> "$n appears ${where.size} times (${where.joinToString(", ")}): each number needs exactly two"
            }
        }
    }
}

/**
 * Authoring for shikaku (type 22): the rectangles tile the grid with one clue each, so the
 * clues must add up to the grid's area, and each clue needs room for a rectangle of its
 * size that holds no other clue.
 */
object ShikakuAuthoring : ClueGridAuthoring(22, "shikaku", "四角に切れ") {
    const val PUZZLE_TYPE = 22

    override fun clueProblems(draft: ClueGridDraft): List<String> = buildList {
        val total = draft.cells.sumOf { it.sum() }
        val area = draft.rows * draft.cols
        if (total != area) add("Clues add up to $total but the grid has $area cells")
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val n = draft.cells[r][c]
                if (n > 0 && !fits(draft, r, c, n)) add("${at(r, c)} $n has no room for a $n-cell rectangle")
            }
        }
    }

    /** Whether some w x h = [n] rectangle inside the grid covers (r, c) and no other clue. */
    fun fits(draft: ClueGridDraft, r: Int, c: Int, n: Int): Boolean {
        for (h in 1..minOf(n, draft.rows)) {
            if (n % h != 0) continue
            val w = n / h
            if (w > draft.cols) continue
            for (top in maxOf(0, r - h + 1)..minOf(r, draft.rows - h)) {
                for (left in maxOf(0, c - w + 1)..minOf(c, draft.cols - w)) {
                    val clean = (top until top + h).all { rr ->
                        (left until left + w).all { cc -> (rr == r && cc == c) || draft.cells[rr][cc] == 0 }
                    }
                    if (clean) return true
                }
            }
        }
        return false
    }
}
