package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable clue lists of a nonogram being authored: rowClues[r] is row r's
 * run-lengths (top to bottom), colClues[c] column c's (left to right). A blank line
 * is [0], matching the canon schema.
 */
data class NonogramDraft(
    val rowClues: List<List<Int>> = emptyList(),
    val colClues: List<List<Int>> = emptyList(),
) {
    val rows: Int get() = rowClues.size
    val cols: Int get() = colClues.size
}

/**
 * Pure helpers for authoring a nonogram question in the Admin screen, the analog of
 * frontend/src/components/NonogramEditor.tsx. The parser returns the canon
 * `{ rowClues, colClues }` directly, so a draft is just those lists; the review step
 * edits them line by line as text ("3 1 2") and previews them on the player board.
 *
 * [problems] mirrors the API's nonogram semantic checks (player/api/src/lib/schema.ts)
 * so a mis-parsed board is flagged before it's sent: a line whose clue can't fit, and
 * row/column clue sums that differ (usually a phantom or missed line).
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object NonogramAuthoring {

    const val PUZZLE_TYPE = 6

    /** Read a parser canon `{ rowClues, colClues }` into a draft; missing -> empty. */
    fun draftFromCanon(canon: JsonObject): NonogramDraft {
        val clues = NonogramEngine.parseClues(previewPuzzle(NonogramDraft()).copy(canonRepr = canon))
        return NonogramDraft(
            rowClues = clues.rowClues.map(::normalize),
            colClues = clues.colClues.map(::normalize),
        )
    }

    /** The canon `{ rowClues, colClues }` to POST, with each line normalized. */
    fun canonFromDraft(draft: NonogramDraft): JsonObject = JsonObject(
        mapOf(
            "rowClues" to clueArray(draft.rowClues),
            "colClues" to clueArray(draft.colClues),
        )
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the read-only review
     * board. Its id changes with the clues, since the board caches per puzzle id.
     */
    fun previewPuzzle(draft: NonogramDraft): Puzzle = Puzzle(
        id = "admin-nonogram-draft-${draft.hashCode()}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "nonogram",
        puzzleTypeJpLabel = "ノノグラム",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /**
     * Parse a typed clue line: numbers split on anything else (space, comma, period —
     * whatever the phone's number pad offers); nothing -> [0].
     */
    fun parseClueText(text: String): List<Int> =
        normalize(text.split(Regex("[^0-9]+")).mapNotNull { it.toIntOrNull() })

    /** The text a clue line is edited as: "3 1 2", or "0" for a blank line. */
    fun formatClue(clue: List<Int>): String = clue.joinToString(" ")

    /** Cells a clue needs: its blocks plus one gap between neighbours. */
    fun minLength(clue: List<Int>): Int {
        val blocks = clue.filter { it > 0 }
        return blocks.sum() + maxOf(0, blocks.size - 1)
    }

    /** Blocking issues the API would reject, in display order; empty when clean. */
    fun problems(draft: NonogramDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No rows or columns")
            return@buildList
        }
        draft.rowClues.forEachIndexed { r, clue ->
            if (minLength(clue) > draft.cols) add("Row ${r + 1} needs ${minLength(clue)} cells, line has ${draft.cols}")
        }
        draft.colClues.forEachIndexed { c, clue ->
            if (minLength(clue) > draft.rows) add("Column ${c + 1} needs ${minLength(clue)} cells, line has ${draft.rows}")
        }
        val rowSum = draft.rowClues.sumOf { it.sum() }
        val colSum = draft.colClues.sumOf { it.sum() }
        if (rowSum != colSum) add("Clue sums differ: rows $rowSum, columns $colSum")
    }

    fun setRowClue(draft: NonogramDraft, r: Int, clue: List<Int>): NonogramDraft =
        draft.copy(rowClues = draft.rowClues.mapIndexed { i, old -> if (i == r) normalize(clue) else old })

    fun setColClue(draft: NonogramDraft, c: Int, clue: List<Int>): NonogramDraft =
        draft.copy(colClues = draft.colClues.mapIndexed { i, old -> if (i == c) normalize(clue) else old })

    /** Drop row [r] — the fix for a parser's phantom duplicate line. Keeps at least one row. */
    fun removeRow(draft: NonogramDraft, r: Int): NonogramDraft =
        if (draft.rows <= 1) draft else draft.copy(rowClues = draft.rowClues.filterIndexed { i, _ -> i != r })

    fun removeCol(draft: NonogramDraft, c: Int): NonogramDraft =
        if (draft.cols <= 1) draft else draft.copy(colClues = draft.colClues.filterIndexed { i, _ -> i != c })

    /** Append a blank row — the fix for a line the parser missed. */
    fun addRow(draft: NonogramDraft): NonogramDraft = draft.copy(rowClues = draft.rowClues + listOf(listOf(0)))

    fun addCol(draft: NonogramDraft): NonogramDraft = draft.copy(colClues = draft.colClues + listOf(listOf(0)))

    /** Zeros only mean "blank line": drop them among real blocks, and empty/all-zero -> [0]. */
    private fun normalize(clue: List<Int>): List<Int> =
        clue.filter { it > 0 }.ifEmpty { listOf(0) }

    private fun clueArray(lines: List<List<Int>>): JsonArray =
        JsonArray(lines.map { line -> JsonArray(normalize(line).map { JsonPrimitive(it) }) })
}
