package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.abs

/**
 * The editable clue grid of a picto link being authored: cells[r][c] is a path-length
 * clue (1+), or [PictoLinkAuthoring.BLANK] (0) for none. Always rectangular.
 */
data class PictoLinkDraft(val cells: List<List<Int>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun cellAt(col: Int, row: Int): Int? = cells.getOrNull(row)?.getOrNull(col)
}

/**
 * Pure helpers for authoring a picto link question in the Admin screen, the analog of
 * frontend/src/components/PictoLinkEditor.tsx. The parser returns the canon `{ cells }`
 * directly; the review step fixes mis-read clues (multi-digit ones especially) and
 * phantom/missed lines.
 *
 * Picto Link has no solver gate, so the server only checks the schema. [problems] catches
 * the misreads that can't be right on their face: a value n >= 2 appearing an odd number
 * of times (it can't all be paired, as the web editor flags), and a clue with no partner
 * close enough for a path of exactly n cells to reach it.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object PictoLinkAuthoring {

    const val PUZZLE_TYPE = 27

    /** No clue in this cell. */
    const val BLANK = 0

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows with blanks. */
    fun draftFromCanon(canon: JsonObject): PictoLinkDraft {
        val parsed = PictoLinkEngine.parseCells(previewPuzzle(PictoLinkDraft()).copy(canonRepr = canon))
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return PictoLinkDraft(parsed.map { row -> row.map { maxOf(it, BLANK) } + List(cols - row.size) { BLANK } })
    }

    /** The canon `{ cells }` to POST. */
    fun canonFromDraft(draft: PictoLinkDraft): JsonObject = JsonObject(
        mapOf("cells" to JsonArray(draft.cells.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }))
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size: editing a clue
     * keeps the view where it is, while adding or deleting a line re-fits it.
     */
    fun previewPuzzle(draft: PictoLinkDraft): Puzzle = Puzzle(
        id = "admin-picto-link-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "picto-link",
        puzzleTypeJpLabel = "ピクトリンク",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Set the clue at (col, row); null (or anything below 1) clears it. */
    fun setClue(draft: PictoLinkDraft, col: Int, row: Int, clue: Int?): PictoLinkDraft {
        if (draft.cellAt(col, row) == null) return draft
        val value = if (clue != null && clue > 0) clue else BLANK
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) value else old }
        })
    }

    /** Parse a typed clue: digits only; blank -> null (no clue). */
    fun parseClue(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()

    /** Append a blank row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: PictoLinkDraft): PictoLinkDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { BLANK }))

    /** Append a blank column at the right. */
    fun addCol(draft: PictoLinkDraft): PictoLinkDraft =
        draft.copy(cells = draft.cells.map { it + BLANK })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: PictoLinkDraft, row: Int): PictoLinkDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: PictoLinkDraft, col: Int): PictoLinkDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /**
     * True when a path of exactly [n] cells can join clues [d] grid steps apart (Manhattan
     * distance): it needs n - 1 >= d steps, and on a grid every detour adds two, so the
     * parities must match.
     */
    private fun reachable(n: Int, d: Int): Boolean = d in 1..(n - 1) && (n - 1 - d) % 2 == 0

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: PictoLinkDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        val clues = buildList {
            for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
                val v = draft.cells[r][c]
                if (v != BLANK) add(Triple(r, c, v))
            }
        }
        if (clues.isEmpty()) {
            add("No clues")
            return@buildList
        }
        val counts = clues.filter { it.third >= 2 }.groupingBy { it.third }.eachCount()
        for ((value, count) in counts.toSortedMap()) {
            if (count % 2 != 0) add("$value appears $count times — an odd count can't all be paired")
        }
        for ((r, c, v) in clues) {
            if (v < 2) continue
            val partner = clues.any { (r2, c2, v2) -> v2 == v && reachable(v, abs(r - r2) + abs(c - c2)) }
            if (!partner) add("R${r + 1}C${c + 1} ($v) has no $v a path of $v cells can reach")
        }
    }
}
