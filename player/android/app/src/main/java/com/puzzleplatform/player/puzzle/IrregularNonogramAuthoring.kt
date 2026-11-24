package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pure helpers for authoring an irregular nonogram in the Admin screen, the analog of
 * frontend/src/components/IrregularNonogramEditor.tsx. The draft is the
 * [IrregularNonogramEngine.Board].
 *
 * Shape: a tap toggles a lattice cell in or out of the board (the box grows and trims to
 * fit, clues shift along and follow their pieces; never refused or "fixed"). Clues: a
 * piece's clue is set, flipped to the other side or cleared through [setPieceClue].
 * [formatProblems] mirrors the web editor's (and the API's) and blocks saving; a piece
 * without a clue is an overridable warning.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object IrregularNonogramAuthoring {

    const val PUZZLE_TYPE = 45

    fun draftFromCanon(canon: JsonObject): IrregularNonogramEngine.Board = IrregularNonogramEngine.parseBoard(canon)

    /** The canon `{ width, height, cells, rowClues, colClues }` to POST. */
    fun canonFromDraft(draft: IrregularNonogramEngine.Board): JsonObject {
        fun entry(c: IrregularNonogramEngine.Clue) = JsonObject(
            mapOf(
                (if (c.axis == "row") "row" else "col") to JsonPrimitive(c.line),
                "start" to JsonPrimitive(c.start),
                "side" to JsonPrimitive(c.side),
                "clues" to JsonArray(c.clues.map { JsonPrimitive(it) }),
            ),
        )
        val sorted = draft.clues.sortedWith(compareBy({ it.line }, { it.start }))
        return JsonObject(
            mapOf(
                "width" to JsonPrimitive(draft.cols),
                "height" to JsonPrimitive(draft.rows),
                "cells" to JsonArray(draft.cells.map { row -> JsonArray(row.map { JsonPrimitive(if (it) 1 else 0) }) }),
                "rowClues" to JsonArray(sorted.filter { it.axis == "row" }.map(::entry)),
                "colClues" to JsonArray(sorted.filter { it.axis == "col" }.map(::entry)),
            ),
        )
    }

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: IrregularNonogramEngine.Board): Puzzle = Puzzle(
        id = "admin-irregular-nonogram-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "irregular-nonogram",
        puzzleTypeJpLabel = "変形ロジック",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** An empty rectangular board, no clues. */
    fun empty(rows: Int, cols: Int) = IrregularNonogramEngine.Board(rows, cols, List(rows) { List(cols) { true } }, emptyList())

    /**
     * Toggle lattice cell (r, c) — which may lie outside the box — in or out of the
     * board: the box grows to include it and trims empty outer rows/columns, clue
     * coordinates shift along, and a clue whose first cell is still on the board follows
     * its piece's new start. A clue whose first cell left the board stays (the problems
     * list flags it). Port of setBoardCell.
     */
    fun toggleCell(draft: IrregularNonogramEngine.Board, r: Int, c: Int): IrregularNonogramEngine.Board {
        val on = !draft.isBoard(r, c)
        val top = maxOf(0, -r)
        val left = maxOf(0, -c)
        val rows = maxOf(draft.rows + top, r + top + 1)
        val cols = maxOf(draft.cols + left, c + left + 1)
        val cells = MutableList(rows) { i -> MutableList(cols) { j -> draft.isBoard(i - top, j - left) } }
        cells[r + top][c + left] = on
        var clues = draft.clues.map {
            if (it.axis == "row") it.copy(line = it.line + top, start = it.start + left)
            else it.copy(line = it.line + left, start = it.start + top)
        }
        // Trim empty outer rows and columns.
        val usedRows = cells.indices.filter { i -> cells[i].any { it } }
        val usedCols = (0 until cols).filter { j -> cells.any { it[j] } }
        var out = IrregularNonogramEngine.Board(rows, cols, cells, clues)
        if (usedRows.isNotEmpty() && usedCols.isNotEmpty()) {
            val r0 = usedRows.first()
            val r1 = usedRows.last()
            val c0 = usedCols.first()
            val c1 = usedCols.last()
            clues = clues.map {
                if (it.axis == "row") it.copy(line = it.line - r0, start = it.start - c0)
                else it.copy(line = it.line - c0, start = it.start - r0)
            }
            out = IrregularNonogramEngine.Board(
                r1 - r0 + 1,
                c1 - c0 + 1,
                (r0..r1).map { i -> (c0..c1).map { j -> cells[i][j] } },
                clues,
            )
        }
        // Clues follow their pieces.
        val taken = mutableSetOf<String>()
        val followed = out.clues.map { clue ->
            val seg = if (clue.axis == "row") IrregularNonogramEngine.segmentAt(out, "row", clue.line, clue.start)
            else IrregularNonogramEngine.segmentAt(out, "col", clue.start, clue.line)
            if (seg == null || !taken.add(seg.key)) clue else clue.copy(start = seg.start)
        }
        return out.copy(clues = followed)
    }

    /** Set (or clear, with an empty list) the clue of the piece through (r, c) along [axis]. */
    fun setPieceClue(
        draft: IrregularNonogramEngine.Board,
        axis: String,
        r: Int,
        c: Int,
        clues: List<Int>,
        side: String,
    ): IrregularNonogramEngine.Board {
        val seg = IrregularNonogramEngine.segmentAt(draft, axis, r, c) ?: return draft
        val rest = draft.clues.filterNot { it.axis == axis && it.line == seg.line && it.start == seg.start }
        val next = if (clues.isEmpty()) rest else rest + IrregularNonogramEngine.Clue(axis, seg.line, seg.start, side, clues)
        return draft.copy(clues = next)
    }

    /** The clue of the piece through (r, c) along [axis], if any. */
    fun pieceClue(draft: IrregularNonogramEngine.Board, axis: String, r: Int, c: Int): IrregularNonogramEngine.Clue? {
        val seg = IrregularNonogramEngine.segmentAt(draft, axis, r, c) ?: return null
        return draft.clues.firstOrNull { it.axis == axis && it.line == seg.line && it.start == seg.start }
    }

    /** "2 5 1" -> [2, 5, 1]; null when any part isn't a positive whole number. */
    fun parseClues(text: String): List<Int>? {
        val parts = text.trim().split(Regex("[\\s,]+")).filter { it.isNotEmpty() }
        val nums = parts.map { it.toIntOrNull() }
        return if (nums.all { it != null && it >= 1 }) nums.filterNotNull() else null
    }

    /** Problems the API rejects too (port of irregularNonogramFormatProblems); they block saving. */
    fun formatProblems(draft: IrregularNonogramEngine.Board): List<String> =
        IrregularNonogramEngine.formatProblems(draft).map { it.first }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: IrregularNonogramEngine.Board): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        addAll(formatProblems(draft))
        addAll(IrregularNonogramEngine.warnings(draft).map { it.first })
        if (draft.clues.isEmpty()) add("No clues")
    }
}
