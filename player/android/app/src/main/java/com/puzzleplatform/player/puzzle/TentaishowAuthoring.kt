package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.TentaishowEngine.Dot
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToInt

/**
 * The editable board of a tentaishow being authored: its size and its dots (galaxy
 * centers) in doubled coordinates — cell (r, c)'s center is (2r+1, 2c+1), so odd/odd is a
 * cell center, mixed is an edge midpoint and even/even a corner.
 */
data class TentaishowDraft(
    val rows: Int = 0,
    val cols: Int = 0,
    val dots: List<Dot> = emptyList(),
) {
    fun dotAt(dr: Int, dc: Int): Dot? = dots.firstOrNull { it.dr == dr && it.dc == dc }
}

/**
 * Pure helpers for authoring a tentaishow question in the Admin screen, the analog of
 * frontend/src/components/TentaishowEditor.tsx. The parser returns the canon
 * `{ width, height, dots }` directly; the review step fixes mis-read dots and a
 * mis-counted grid.
 *
 * A tap snaps to the nearest cell center, edge midpoint or corner inside the grid and
 * cycles the dot there none -> open -> filled -> none. As for kuralin, rows and columns
 * change only at the bottom/right edge: a parser miscount shifts every dot, which a
 * middle-line delete can't fix.
 *
 * Snapped taps and the edge-only resize keep every dot on a valid point. The canon needs
 * at least one dot, so an empty board is the one [formatProblems] entry, a hard block
 * (the schema refuses it too). [problems] adds two dots that share a cell — each cell
 * belongs to one galaxy, so they can't both be right — which the admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object TentaishowAuthoring {

    const val PUZZLE_TYPE = 20

    const val OPEN = 0
    const val FILLED = 1

    /** True for a point inside a [rows] x [cols] grid (any cell center, interior edge midpoint or interior corner). */
    fun isValidPoint(dr: Int, dc: Int, rows: Int, cols: Int): Boolean =
        dr in 1 until 2 * rows && dc in 1 until 2 * cols

    /** The nearest valid point to a tap at fractional cell coordinates (fx = col, fy = row), or null outside. */
    fun nearestPoint(fx: Float, fy: Float, rows: Int, cols: Int): Pair<Int, Int>? {
        if (rows <= 0 || cols <= 0) return null
        val dr = (fy * 2).roundToInt().coerceIn(1, 2 * rows - 1)
        val dc = (fx * 2).roundToInt().coerceIn(1, 2 * cols - 1)
        return if (isValidPoint(dr, dc, rows, cols)) dr to dc else null
    }

    /** Read a parser canon into a draft, dropping dots off the grid and repeats, and reading unknown colors as open. */
    fun draftFromCanon(canon: JsonObject): TentaishowDraft {
        val board = TentaishowEngine.parseBoard(previewPuzzleOf(canon, 0, 0))
        val dots = board.dots
            .filter { isValidPoint(it.dr, it.dc, board.rows, board.cols) }
            .map { if (it.color == FILLED) it else it.copy(color = OPEN) }
            .distinctBy { it.dr to it.dc }
        return TentaishowDraft(board.rows, board.cols, sorted(dots))
    }

    /** The canon `{ width, height, dots }` to POST. */
    fun canonFromDraft(draft: TentaishowDraft): JsonObject = JsonObject(
        mapOf(
            "width" to JsonPrimitive(draft.cols),
            "height" to JsonPrimitive(draft.rows),
            "dots" to JsonArray(draft.dots.map { d ->
                JsonObject(
                    mapOf(
                        "dr" to JsonPrimitive(d.dr),
                        "dc" to JsonPrimitive(d.dc),
                        "color" to JsonPrimitive(d.color),
                    ),
                )
            }),
        ),
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id keys
     * the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: TentaishowDraft): Puzzle =
        previewPuzzleOf(canonFromDraft(draft), draft.rows, draft.cols)

    private fun previewPuzzleOf(canon: JsonObject, rows: Int, cols: Int) = Puzzle(
        id = "admin-tentaishow-draft-${rows}x$cols",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "tentaishow",
        puzzleTypeJpLabel = "天体ショー",
        difficulty = 1,
        width = cols,
        height = rows,
        canonRepr = canon,
    )

    /** Cycle the dot at (dr, dc): none -> open -> filled -> none. Invalid points are no-ops. */
    fun cycleDot(draft: TentaishowDraft, dr: Int, dc: Int): TentaishowDraft {
        if (!isValidPoint(dr, dc, draft.rows, draft.cols)) return draft
        val rest = draft.dots.filterNot { it.dr == dr && it.dc == dc }
        val next = when (draft.dotAt(dr, dc)?.color) {
            null -> OPEN
            OPEN -> FILLED
            else -> null
        }
        return draft.copy(dots = sorted(if (next == null) rest else rest + Dot(dr, dc, next)))
    }

    /** Append an empty row at the bottom. */
    fun addRow(draft: TentaishowDraft): TentaishowDraft = draft.copy(rows = draft.rows + 1)

    /** Append an empty column at the right. */
    fun addCol(draft: TentaishowDraft): TentaishowDraft = draft.copy(cols = draft.cols + 1)

    /** Drop the bottom row and the dots that leave the grid with it. Keeps at least one row. */
    fun removeLastRow(draft: TentaishowDraft): TentaishowDraft =
        if (draft.rows <= 1) draft else resized(draft, draft.rows - 1, draft.cols)

    /** Drop the rightmost column and the dots that leave the grid with it. Keeps at least one column. */
    fun removeLastCol(draft: TentaishowDraft): TentaishowDraft =
        if (draft.cols <= 1) draft else resized(draft, draft.rows, draft.cols - 1)

    private fun resized(draft: TentaishowDraft, rows: Int, cols: Int) =
        TentaishowDraft(rows, cols, draft.dots.filter { isValidPoint(it.dr, it.dc, rows, cols) })

    private fun sorted(dots: List<Dot>) = dots.sortedWith(compareBy({ it.dr }, { it.dc }))

    /** The cells (row, col) a dot sits on: 1 at a center, 2 at an edge midpoint, 4 at a corner. */
    fun touchedCells(dot: Dot): List<Pair<Int, Int>> {
        val rs = if (dot.dr % 2 == 1) listOf((dot.dr - 1) / 2) else listOf(dot.dr / 2 - 1, dot.dr / 2)
        val cs = if (dot.dc % 2 == 1) listOf((dot.dc - 1) / 2) else listOf(dot.dc / 2 - 1, dot.dc / 2)
        return rs.flatMap { r -> cs.map { c -> r to c } }
    }

    /** What keeps the draft from being a tentaishow canon: no cells, or no dots. */
    fun formatProblems(draft: TentaishowDraft): List<String> = when {
        draft.rows <= 0 || draft.cols <= 0 -> listOf("No cells")
        draft.dots.isEmpty() -> listOf("No dots")
        else -> emptyList()
    }

    /** Every issue: the [formatProblems], then pairs of dots that sit on a common cell. Empty when clean. */
    fun problems(draft: TentaishowDraft): List<String> = formatProblems(draft) + buildList {
        val owner = mutableMapOf<Pair<Int, Int>, Dot>()
        val clashes = linkedSetOf<Pair<Dot, Dot>>()
        for (dot in draft.dots) {
            for (cell in touchedCells(dot)) {
                val other = owner.putIfAbsent(cell, dot)
                if (other != null) clashes += other to dot
            }
        }
        for ((a, b) in clashes) add("Dots at ${label(a)} and ${label(b)} share a cell")
    }

    /** The cells a dot touches, for messages: "R2C3" at a center, "R2C3/R2C4" on an edge, four at a corner. */
    private fun label(dot: Dot): String =
        touchedCells(dot).joinToString("/") { (r, c) -> "R${r + 1}C${c + 1}" }
}
