package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * Authoring for Skeleton Puzzle (type 35), the analog of
 * frontend/src/components/SkeletonPuzzleEditor.tsx. The draft is the canon itself
 * ([SkeletonRules.Board]: cells, words, marks).
 *
 * The editor may hold boards whose slots and words don't match yet; those are
 * [formatProblems] — listed, and a block on creating or saving (the API's semanticChecks
 * rejects them too). [problems] adds the overridable warning: a cell in no slot.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object SkeletonPuzzleAuthoring {
    const val PUZZLE_TYPE = 35

    fun draftFromCanon(canon: JsonObject): SkeletonRules.Board = SkeletonRules.parse(canon)

    fun canonFromDraft(draft: SkeletonRules.Board): JsonObject = SkeletonRules.toCanon(draft)

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id keys
     * the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: SkeletonRules.Board): Puzzle = Puzzle(
        id = "admin-skeleton-puzzle-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "skeleton-puzzle",
        puzzleTypeJpLabel = "スケルトンパズル",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    fun formatProblems(draft: SkeletonRules.Board): List<String> = SkeletonRules.formatProblems(draft)

    fun problems(draft: SkeletonRules.Board): List<String> =
        formatProblems(draft) + SkeletonRules.warnings(draft)

    /** Toggle (col, row) between cell and not a cell; a mark on a square that stops being a cell goes too. */
    fun toggleCell(draft: SkeletonRules.Board, col: Int, row: Int): SkeletonRules.Board {
        if (row !in 0 until draft.rows || col !in 0 until draft.cols) return draft
        val cells = draft.cells.mapIndexed { r, line ->
            if (r != row) line else line.mapIndexed { c, v -> if (c == col) 1 - v else v }
        }
        return draft.copy(cells = cells, marks = draft.marks.filter { SkeletonRules.isCell(cells, it.r, it.c) })
    }

    /** Add a double-frame mark on the cell at (col, row) with the next free letter, or remove its mark. */
    fun toggleMark(draft: SkeletonRules.Board, col: Int, row: Int): SkeletonRules.Board {
        if (!SkeletonRules.isCell(draft.cells, row, col)) return draft
        if (draft.marks.any { it.r == row && it.c == col }) {
            return draft.copy(marks = draft.marks.filterNot { it.r == row && it.c == col })
        }
        val taken = draft.marks.map { it.label }.toSet()
        val label = ('A'..'Z').map { it.toString() }.firstOrNull { it !in taken } ?: "${draft.marks.size + 1}"
        return draft.copy(marks = draft.marks + SkeletonRules.Mark(row, col, label))
    }

    /** Replace the word list from the editor's text: one word per line, "word (hint)". */
    fun setWords(draft: SkeletonRules.Board, text: String): SkeletonRules.Board =
        draft.copy(words = SkeletonRules.parseWordLines(text))

    /** Append a non-cell row at the bottom. */
    fun addRow(draft: SkeletonRules.Board): SkeletonRules.Board =
        draft.copy(cells = draft.cells + listOf(List(draft.cols) { 0 }))

    /** Append a non-cell column at the right. */
    fun addCol(draft: SkeletonRules.Board): SkeletonRules.Board = draft.copy(cells = draft.cells.map { it + 0 })

    /** Drop row [row] (a parser's phantom line), with its marks; later marks move up. Keeps one row. */
    fun removeRow(draft: SkeletonRules.Board, row: Int): SkeletonRules.Board {
        if (draft.rows <= 1) return draft
        return draft.copy(
            cells = draft.cells.filterIndexed { i, _ -> i != row },
            marks = draft.marks.filter { it.r != row }.map { if (it.r > row) it.copy(r = it.r - 1) else it },
        )
    }

    /** Drop column [col], with its marks; later marks move left. Keeps one column. */
    fun removeCol(draft: SkeletonRules.Board, col: Int): SkeletonRules.Board {
        if (draft.cols <= 1) return draft
        return draft.copy(
            cells = draft.cells.map { line -> line.filterIndexed { i, _ -> i != col } },
            marks = draft.marks.filter { it.c != col }.map { if (it.c > col) it.copy(c = it.c - 1) else it },
        )
    }
}
