package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a Mannequin Gate 2 question in the Admin screen, the analog
 * of frontend/src/components/MannequinGate2Editor.tsx. The draft is a
 * [MannequinGate2Rules.Board].
 *
 * Edits: add a line drawn by dragging cell to cell, delete a line through a tapped cell
 * (the most recently added one there), and add or remove the last row or column (lines
 * that no longer fit are dropped). [formatProblems] mirrors the web editor's (and the
 * API's) checks and blocks creating or saving; [problems] adds the overridable "No lines".
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object MannequinGate2Authoring {

    const val PUZZLE_TYPE = 43

    fun draftFromCanon(canon: JsonObject): MannequinGate2Rules.Board = MannequinGate2Rules.parseBoard(canon)

    fun canonFromDraft(draft: MannequinGate2Rules.Board): JsonObject = MannequinGate2Rules.toCanon(draft)

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: MannequinGate2Rules.Board): Puzzle = Puzzle(
        id = "admin-mannequin-gate-2-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "mannequin-gate-2",
        puzzleTypeJpLabel = "マネキンゲート2",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Append a drawn line (cells as (row, col)); fewer than 2 cells adds nothing. */
    fun addLine(draft: MannequinGate2Rules.Board, cells: List<Pair<Int, Int>>): MannequinGate2Rules.Board =
        if (cells.size < 2) draft else draft.copy(lines = draft.lines + listOf(cells))

    /** Delete the most recently added line through (row, col), if any. */
    fun removeLineAt(draft: MannequinGate2Rules.Board, row: Int, col: Int): MannequinGate2Rules.Board {
        val i = draft.lines.indexOfLast { (row to col) in it }
        return if (i < 0) draft else draft.copy(lines = draft.lines.filterIndexed { k, _ -> k != i })
    }

    private fun fit(draft: MannequinGate2Rules.Board, rows: Int, cols: Int) = draft.copy(
        rows = rows,
        cols = cols,
        lines = draft.lines.filter { l -> l.all { (r, c) -> r < rows && c < cols } },
    )

    fun addRow(draft: MannequinGate2Rules.Board, top: Boolean = false) =
        fit(shifted(draft, edgeShift(top, add = true), 0), draft.rows + 1, draft.cols)
    fun addCol(draft: MannequinGate2Rules.Board, left: Boolean = false) =
        fit(shifted(draft, 0, edgeShift(left, add = true)), draft.rows, draft.cols + 1)
    fun removeEdgeRow(draft: MannequinGate2Rules.Board, top: Boolean) =
        if (draft.rows <= 1) draft else fit(shifted(draft, edgeShift(top, add = false), 0), draft.rows - 1, draft.cols)
    fun removeEdgeCol(draft: MannequinGate2Rules.Board, left: Boolean) =
        if (draft.cols <= 1) draft else fit(shifted(draft, 0, edgeShift(left, add = false)), draft.rows, draft.cols - 1)

    /** Move every line by ([dr], [dc]) cells, dropping lines that leave the top / left. */
    private fun shifted(draft: MannequinGate2Rules.Board, dr: Int, dc: Int) =
        if (dr == 0 && dc == 0) draft else draft.copy(
            lines = draft.lines.map { l -> l.map { (r, c) -> r + dr to c + dc } }
                .filter { l -> l.all { (r, c) -> r >= 0 && c >= 0 } },
        )

    fun formatProblems(draft: MannequinGate2Rules.Board): List<String> = MannequinGate2Rules.formatProblems(draft)

    /** Format problems plus overridable misread warnings. */
    fun problems(draft: MannequinGate2Rules.Board): List<String> = buildList {
        if (draft.rows <= 0 || draft.cols <= 0) {
            add("No cells")
            return@buildList
        }
        addAll(formatProblems(draft))
        if (draft.lines.isEmpty()) add("No lines")
    }
}
