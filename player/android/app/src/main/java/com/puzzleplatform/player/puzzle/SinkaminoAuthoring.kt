package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a sinkamino question in the Admin screen, the analog of
 * frontend/src/components/SinkaminoEditor.tsx. The draft is the [SinkaminoGrid] itself.
 *
 * The editor may hold trails the canon can't (a cell turned black under a trail, a
 * trail cut by a deleted row); those are [formatProblems] — listed, and a block on
 * creating or saving. [problems] adds overridable misread warnings.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object SinkaminoAuthoring {

    const val PUZZLE_TYPE = 31

    fun draftFromCanon(canon: JsonObject): SinkaminoGrid {
        val grid = SinkaminoRules.parse(canon)
        val cols = grid.cols
        return grid.copy(cells = grid.cells.map { it + List(cols - it.size) { SinkaminoRules.WHITE } })
    }

    fun canonFromDraft(draft: SinkaminoGrid): JsonObject = SinkaminoRules.toCanon(draft)

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id keys
     * the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: SinkaminoGrid): Puzzle = Puzzle(
        id = "admin-sinkamino-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "sinkamino",
        puzzleTypeJpLabel = "シンカミノ",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Cycle a cell white -> black -> given square -> white. Trails are left alone. */
    fun cycleCell(draft: SinkaminoGrid, col: Int, row: Int): SinkaminoGrid {
        if (row !in 0 until draft.rows || col !in 0 until draft.cols) return draft
        return draft.copy(cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, v -> if (c == col) (v + 1) % 3 else v }
        })
    }

    /**
     * One step of drawing a trail by drag, as on the web editor: moving onto the previous
     * cell undoes the last step; moving onto a neighbour of the last cell that the trail
     * hasn't visited extends it; anything else leaves it as it is.
     */
    fun extendTrail(trail: List<Pair<Int, Int>>, cell: Pair<Int, Int>): List<Pair<Int, Int>> {
        val last = trail.lastOrNull() ?: return listOf(cell)
        if (cell == last) return trail
        if (trail.size >= 2 && cell == trail[trail.size - 2]) return trail.dropLast(1)
        if (Math.abs(cell.first - last.first) + Math.abs(cell.second - last.second) != 1) return trail
        if (cell in trail) return trail
        return trail + cell
    }

    /** Add a drawn trail (tail first); shorter than 2 cells is ignored. */
    fun addArrow(draft: SinkaminoGrid, trail: List<Pair<Int, Int>>): SinkaminoGrid =
        if (trail.size < 2) draft else draft.copy(arrows = draft.arrows + listOf(trail))

    /** Delete the first trail passing through (col, row), if any. */
    fun removeArrowAt(draft: SinkaminoGrid, col: Int, row: Int): SinkaminoGrid {
        val i = draft.arrows.indexOfFirst { (row to col) in it }
        return if (i < 0) draft else draft.copy(arrows = draft.arrows.filterIndexed { j, _ -> j != i })
    }

    /** Add a white row at the top or bottom — the fix for a row the parser missed. */
    fun addRow(draft: SinkaminoGrid, top: Boolean = false): SinkaminoGrid = SinkaminoGrid(
        draft.cells.plusEdgeRow(top, draft.cols, SinkaminoRules.WHITE),
        if (top) draft.arrows.map { t -> t.map { (r, c) -> r + 1 to c } } else draft.arrows,
    )

    /** Add a white column at the left or right. */
    fun addCol(draft: SinkaminoGrid, left: Boolean = false): SinkaminoGrid = SinkaminoGrid(
        draft.cells.plusEdgeCol(left, SinkaminoRules.WHITE),
        if (left) draft.arrows.map { t -> t.map { (r, c) -> r to c + 1 } } else draft.arrows,
    )

    /** Drop the top or bottom row; trails reaching it go with it. Keeps at least one row. */
    fun removeEdgeRow(draft: SinkaminoGrid, top: Boolean): SinkaminoGrid {
        if (draft.rows <= 1) return draft
        val gone = if (top) 0 else draft.rows - 1
        val kept = draft.arrows.filter { t -> t.none { it.first == gone } }
        return SinkaminoGrid(
            draft.cells.minusEdgeRow(top),
            if (top) kept.map { t -> t.map { (r, c) -> r - 1 to c } } else kept,
        )
    }

    /** Drop the left or right column; trails reaching it go with it. Keeps at least one column. */
    fun removeEdgeCol(draft: SinkaminoGrid, left: Boolean): SinkaminoGrid {
        if (draft.cols <= 1) return draft
        val gone = if (left) 0 else draft.cols - 1
        val kept = draft.arrows.filter { t -> t.none { it.second == gone } }
        return SinkaminoGrid(
            draft.cells.minusEdgeCol(left),
            if (left) kept.map { t -> t.map { (r, c) -> r to c - 1 } } else kept,
        )
    }

    /** Problems that block creating or saving; see [SinkaminoRules.formatProblems]. */
    fun formatProblems(draft: SinkaminoGrid): List<String> = SinkaminoRules.formatProblems(draft)

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: SinkaminoGrid): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        addAll(formatProblems(draft))
        if (draft.arrows.isEmpty()) add("No arrows")
    }
}
