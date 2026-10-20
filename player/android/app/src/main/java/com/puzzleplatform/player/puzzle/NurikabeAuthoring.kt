package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable clue grid of a nurikabe being authored: cells[r][c] is an island size
 * clue (1+), or [NurikabeAuthoring.BLANK] (0) for no clue. Always rectangular.
 */
data class NurikabeDraft(val cells: List<List<Int>> = emptyList()) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.firstOrNull()?.size ?: 0

    fun cellAt(col: Int, row: Int): Int? = cells.getOrNull(row)?.getOrNull(col)
}

/**
 * Pure helpers for authoring a nurikabe question in the Admin screen, the analog of
 * frontend/src/components/NurikabeEditor.tsx. The parser returns the canon `{ cells }`
 * directly; the review step fixes mis-read clues and phantom/missed lines.
 *
 * Nurikabe has no solver gate, so the server only checks the schema. [problems] catches
 * the misreads that can't be right on their face: clues whose islands need more cells
 * than the grid has, and two clues side by side (they'd share one island).
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object NurikabeAuthoring {

    const val PUZZLE_TYPE = 24

    /** No clue in this cell. */
    const val BLANK = 0

    /** Read a parser canon `{ cells }` into a draft, padding ragged rows with blanks. */
    fun draftFromCanon(canon: JsonObject): NurikabeDraft {
        val parsed = NurikabeEngine.parseCells(previewPuzzle(NurikabeDraft()).copy(canonRepr = canon))
        val cols = parsed.maxOfOrNull { it.size } ?: 0
        return NurikabeDraft(parsed.map { row -> row.map { maxOf(it, BLANK) } + List(cols - row.size) { BLANK } })
    }

    /** The canon `{ cells }` to POST. */
    fun canonFromDraft(draft: NurikabeDraft): JsonObject = JsonObject(
        mapOf("cells" to JsonArray(draft.cells.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }))
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size: editing a clue
     * keeps the view where it is, while adding or deleting a line re-fits it.
     */
    fun previewPuzzle(draft: NurikabeDraft): Puzzle = Puzzle(
        id = "admin-nurikabe-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "nurikabe",
        puzzleTypeJpLabel = "ぬりかべ",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Set the clue at (col, row); null (or anything below 1) clears it. */
    fun setClue(draft: NurikabeDraft, col: Int, row: Int, clue: Int?): NurikabeDraft {
        if (draft.cellAt(col, row) == null) return draft
        val value = if (clue != null && clue > 0) clue else BLANK
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, old -> if (c == col) value else old }
        })
    }

    /** Parse a typed clue: digits only; blank -> null (no clue). */
    fun parseClue(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()

    /** Append a blank row at the bottom — the fix for a row the parser missed. */
    fun addRow(draft: NurikabeDraft): NurikabeDraft =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { BLANK }))

    /** Append a blank column at the right. */
    fun addCol(draft: NurikabeDraft): NurikabeDraft =
        draft.copy(cells = draft.cells.map { it + BLANK })

    /** Drop row [row] — the fix for a parser's phantom line. Keeps at least one row. */
    fun removeRow(draft: NurikabeDraft, row: Int): NurikabeDraft =
        if (draft.rows <= 1) draft else draft.copy(cells = draft.cells.filterIndexed { i, _ -> i != row })

    fun removeCol(draft: NurikabeDraft, col: Int): NurikabeDraft =
        if (draft.cols <= 1) draft
        else draft.copy(cells = draft.cells.map { r -> r.filterIndexed { i, _ -> i != col } })

    /** Blocking issues, in reading order; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: NurikabeDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        val total = draft.cells.sumOf { row -> row.sumOf { it } }
        if (total == 0) {
            add("No clues")
            return@buildList
        }
        val cells = draft.rows * draft.cols
        if (total > cells) add("Clues add up to $total but the grid has only $cells cells")
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                if (draft.cells[r][c] == BLANK) continue
                if ((draft.cellAt(c + 1, r) ?: BLANK) != BLANK) add("R${r + 1}C${c + 1} and R${r + 1}C${c + 2} clues touch")
                if ((draft.cellAt(c, r + 1) ?: BLANK) != BLANK) add("R${r + 1}C${c + 1} and R${r + 2}C${c + 1} clues touch")
            }
        }
    }
}
