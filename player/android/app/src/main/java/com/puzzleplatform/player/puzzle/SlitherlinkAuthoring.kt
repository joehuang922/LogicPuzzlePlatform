package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable clue grid of a slitherlink being authored: cells[r][c] is a clue 0-3, or
 * [SlitherlinkAuthoring.BLANK] (-1) for no clue. Always rectangular.
 */
data class SlitherlinkDraft(val cells: List<List<Int>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun cellAt(col: Int, row: Int): Int? = cells.getOrNull(row)?.getOrNull(col)
}

/**
 * Pure helpers for authoring a slitherlink question in the Admin screen, the analog of
 * frontend/src/components/SlitherlinkEditor.tsx. The parser returns the canon `{ cells }`
 * directly; the review step fixes mis-read clues and phantom/missed lines, then the
 * server's solver gate (player/solver/src/plugins/slitherlink) proves a unique solution.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object SlitherlinkAuthoring {

    const val PUZZLE_TYPE = 5

    /** No clue in this cell. */
    const val BLANK = -1

    /** Clues the canon schema allows. */
    val CLUE_RANGE = 0..3

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows with blanks. */
    fun draftFromCanon(canon: JsonObject): SlitherlinkDraft {
        val parsed = SlitherlinkEngine.parseCells(previewPuzzle(SlitherlinkDraft()).copy(canonRepr = canon))
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return SlitherlinkDraft(parsed.map { row -> row + List(cols - row.size) { BLANK } })
    }

    /** The canon `{ cells }` to POST. Out-of-range clues are dropped (sent as blank). */
    fun canonFromDraft(draft: SlitherlinkDraft): JsonObject = JsonObject(
        mapOf(
            "cells" to JsonArray(draft.cells.map { row ->
                JsonArray(row.map { JsonPrimitive(if (it in CLUE_RANGE) it else BLANK) })
            })
        )
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size: editing a clue
     * keeps the view where it is, while adding or deleting a line re-fits it.
     */
    fun previewPuzzle(draft: SlitherlinkDraft): Puzzle = Puzzle(
        id = "admin-slitherlink-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "slitherlink",
        puzzleTypeJpLabel = "スリザーリンク",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Set the clue at (col, row); null (or anything outside 0-3) clears it. */
    fun setClue(draft: SlitherlinkDraft, col: Int, row: Int, clue: Int?): SlitherlinkDraft {
        if (draft.cellAt(col, row) == null) return draft
        val value = if (clue != null && clue in CLUE_RANGE) clue else BLANK
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) value else old }
        })
    }

    /** Append a blank row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: SlitherlinkDraft): SlitherlinkDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { BLANK }))

    /** Append a blank column at the right. */
    fun addCol(draft: SlitherlinkDraft): SlitherlinkDraft =
        draft.copy(cells = draft.cells.map { it + BLANK })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: SlitherlinkDraft, row: Int): SlitherlinkDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: SlitherlinkDraft, col: Int): SlitherlinkDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: SlitherlinkDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.cells.none { row -> row.any { it in CLUE_RANGE } }) add("No clues")
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val v = draft.cells[r][c]
                if (v != BLANK && v !in CLUE_RANGE) add("R${r + 1}C${c + 1} clue $v is out of range (0–3)")
            }
        }
    }
}
