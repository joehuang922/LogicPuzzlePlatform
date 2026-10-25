package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable circle grid of a masyu being authored: cells[r][c] is
 * [MasyuEngine.EMPTY], [MasyuEngine.WHITE] or [MasyuEngine.BLACK]. Always rectangular.
 */
data class MasyuDraft(val cells: List<List<Int>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun inGrid(col: Int, row: Int): Boolean = row in 0 until rows && col in 0 until cols

    fun cellAt(col: Int, row: Int): Int = cells.getOrNull(row)?.getOrNull(col) ?: MasyuEngine.EMPTY
}

/**
 * Pure helpers for authoring a masyu question in the Admin screen, the analog of
 * frontend/src/components/MasyuEditor.tsx. The parser returns the canon `{ cells }`
 * directly; the review step fixes mis-read circles and phantom/missed lines.
 *
 * Masyu has no solver gate, so the server only checks the schema. [problems] catches
 * what can't be right on its face: no circles at all, a white circle in a corner (the
 * loop can't pass straight through it), and a black circle with no room to run two
 * cells straight along a row or a column.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object MasyuAuthoring {

    const val PUZZLE_TYPE = 7

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows and clamping unknown values to empty. */
    fun draftFromCanon(canon: JsonObject): MasyuDraft {
        val parsed = MasyuEngine.parseCells(previewPuzzle(MasyuDraft()).copy(canonRepr = canon))
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return MasyuDraft(parsed.map { row ->
            row.map { if (it == MasyuEngine.WHITE || it == MasyuEngine.BLACK) it else MasyuEngine.EMPTY } +
                List(cols - row.size) { MasyuEngine.EMPTY }
        })
    }

    /** The canon `{ cells }` to POST. */
    fun canonFromDraft(draft: MasyuDraft): JsonObject = JsonObject(
        mapOf("cells" to JsonArray(draft.cells.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }))
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: MasyuDraft): Puzzle = Puzzle(
        id = "admin-masyu-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "masyu",
        puzzleTypeJpLabel = "ましゅ",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Set (col, row) to [kind] (empty, white or black). Off-grid or unknown kinds are no-ops. */
    fun setCell(draft: MasyuDraft, col: Int, row: Int, kind: Int): MasyuDraft {
        if (!draft.inGrid(col, row) || kind !in MasyuEngine.EMPTY..MasyuEngine.BLACK) return draft
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) kind else old }
        })
    }

    /** Append an empty row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: MasyuDraft): MasyuDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { MasyuEngine.EMPTY }))

    /** Append an empty column at the right. */
    fun addCol(draft: MasyuDraft): MasyuDraft =
        draft.copy(cells = draft.cells.map { it + MasyuEngine.EMPTY })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: MasyuDraft, row: Int): MasyuDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: MasyuDraft, col: Int): MasyuDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: MasyuDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.cells.all { row -> row.all { it == MasyuEngine.EMPTY } }) add("No circles")
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                when (draft.cells[r][c]) {
                    MasyuEngine.WHITE -> {
                        // Straight through needs both neighbors along a row or a column.
                        val across = c in 1 until draft.cols - 1
                        val down = r in 1 until draft.rows - 1
                        if (!across && !down) add("R${r + 1}C${c + 1} ○ can't be passed straight through")
                    }
                    MasyuEngine.BLACK -> {
                        // A turn here runs two cells straight one way along the row and the column.
                        val across = c >= 2 || c <= draft.cols - 3
                        val down = r >= 2 || r <= draft.rows - 3
                        if (!across) add("R${r + 1}C${c + 1} ● has no room to go two cells left or right")
                        if (!down) add("R${r + 1}C${c + 1} ● has no room to go two cells up or down")
                    }
                }
            }
        }
    }
}
