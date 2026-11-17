package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlin.math.abs

/**
 * Zebra Rope (puzzle type 36). Ports:
 *  - answer extraction from frontend/src/extractors/zebraRope.ts
 *  - progress from frontend/src/progress/zebraRope.ts
 *  - completion and live errors from frontend/src/components/zebraRopeRules.ts
 *
 * canonRepr: { width, height, ropes: [[row, col], ...][], circles: [{dr, dc, color}] } —
 *   each rope lists the cells it passes through in order (consecutive cells are
 *   8-neighbours); circles sit on grid lines in doubled coordinates (Kuralin's encoding:
 *   0 = white, 1 = black, 2 = gray).
 *
 * answer: { states: number[][] } — height x width; 0 = unset, 1 = shaded, 2 = marked.
 *
 * Input is the shared shade/mark tap cycle on every cell, keyed "col,row" like the web
 * board. Marks and unset cells both count as unshaded when checking.
 */
object ZebraRopeEngine : ShadeMarkEngine {
    override val puzzleType: Int = 36

    const val UNSET = ShadeCycle.EMPTY
    const val SHADED = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    const val WHITE_CIRCLE = 0
    const val BLACK_CIRCLE = 1
    const val GRAY_CIRCLE = 2

    data class Circle(val dr: Int, val dc: Int, val color: Int)

    /** A rope's cells as (row, col), in order. */
    data class Board(
        val rows: Int,
        val cols: Int,
        val ropes: List<List<Pair<Int, Int>>>,
        val circles: List<Circle>,
    )

    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    fun parseBoard(puzzle: Puzzle): Board = parseBoard(puzzle.canonRepr)

    fun parseBoard(canon: JsonObject): Board {
        val cols = ((canon["width"] as? JsonPrimitive)?.intOrNull ?: 0).coerceAtLeast(0)
        val rows = ((canon["height"] as? JsonPrimitive)?.intOrNull ?: 0).coerceAtLeast(0)
        val ropes = (canon["ropes"] as? JsonArray)?.mapNotNull { ropeEl ->
            val cells = (ropeEl as? JsonArray)?.mapNotNull { cellEl ->
                val pair = cellEl as? JsonArray ?: return@mapNotNull null
                val r = (pair.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
                val c = (pair.getOrNull(1) as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
                if (r in 0 until rows && c in 0 until cols) r to c else null
            }
            cells?.takeIf { it.size >= 2 }
        } ?: emptyList()
        val circles = (canon["circles"] as? JsonArray)?.mapNotNull { el ->
            val obj = el as? JsonObject ?: return@mapNotNull null
            val dr = (obj["dr"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val dc = (obj["dc"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val color = (obj["color"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            Circle(dr, dc, color).takeIf { touchedCells(it).all { (r, c) -> r in 0 until rows && c in 0 until cols } }
        } ?: emptyList()
        return Board(rows, cols, ropes, circles)
    }

    /** The cells (row, col) a circle touches: 2 for an edge midpoint, 4 for a corner. */
    fun touchedCells(circle: Circle): List<Pair<Int, Int>> {
        val rs = if (circle.dr % 2 == 1) listOf((circle.dr - 1) / 2) else listOf(circle.dr / 2 - 1, circle.dr / 2)
        val cs = if (circle.dc % 2 == 1) listOf((circle.dc - 1) / 2) else listOf(circle.dc / 2 - 1, circle.dc / 2)
        return rs.flatMap { r -> cs.map { c -> r to c } }
    }

    /** Whether a circle's majority holds. */
    fun circleHolds(color: Int, shaded: Int, unshaded: Int): Boolean = when (color) {
        BLACK_CIRCLE -> shaded > unshaded
        WHITE_CIRCLE -> unshaded > shaded
        else -> shaded == unshaded
    }

    /** Whether a rope's cells (true = shaded, in order) are uniform or alternate. */
    fun ropeHolds(shaded: List<Boolean>): Boolean =
        shaded.all { it } || shaded.none { it } || shaded.zipWithNext().all { (a, b) -> a != b }

    private fun state(userValues: Map<String, Int>, r: Int, c: Int): Int =
        userValues[cellKey(c, r)] ?: UNSET

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parseBoard(puzzle)
        val states = JsonArray((0 until board.rows).map { r ->
            JsonArray((0 until board.cols).map { c ->
                val v = state(userValues, r, c)
                JsonPrimitive(if (v == SHADED || v == MARKED) v else UNSET)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /** Cells shaded or marked / all cells * 100. Mirrors frontend/src/progress/zebraRope.ts. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val total = board.rows * board.cols
        if (total < 1) return 0.0
        var assigned = 0
        for (r in 0 until board.rows) {
            for (c in 0 until board.cols) {
                val v = state(userValues, r, c)
                if (v == SHADED || v == MARKED) assigned++
            }
        }
        return (assigned.toDouble() / total * 100.0).coerceAtMost(100.0)
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val board = parseBoard(puzzle)
        val states = answer["states"] as? JsonArray
        val result = mutableMapOf<String, Int>()
        for (r in 0 until board.rows) {
            val rowArr = states?.getOrNull(r) as? JsonArray
            for (c in 0 until board.cols) {
                val v = (rowArr?.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (v == SHADED || v == MARKED) result[cellKey(c, r)] = v
            }
        }
        return result
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        if (board.rows == 0 || board.cols == 0) return false
        fun shaded(r: Int, c: Int) = state(userValues, r, c) == SHADED
        for (circle in board.circles) {
            val cells = touchedCells(circle)
            val s = cells.count { (r, c) -> shaded(r, c) }
            if (!circleHolds(circle.color, s, cells.size - s)) return false
        }
        return board.ropes.all { rope -> ropeHolds(rope.map { (r, c) -> shaded(r, c) }) }
    }

    /**
     * Indices of circles and ropes already broken by the decided (shaded or marked) cells,
     * whatever the unset cells become. Port of brokenClues in zebraRopeRules.ts.
     */
    fun brokenClues(board: Board, userValues: Map<String, Int>): Pair<Set<Int>, Set<Int>> {
        val circles = board.circles.indices.filter { i ->
            val circle = board.circles[i]
            var shaded = 0
            var unshaded = 0
            var open = 0
            for ((r, c) in touchedCells(circle)) {
                when (state(userValues, r, c)) {
                    SHADED -> shaded++
                    MARKED -> unshaded++
                    else -> open++
                }
            }
            when (circle.color) {
                BLACK_CIRCLE -> shaded + open <= unshaded
                WHITE_CIRCLE -> unshaded + open <= shaded
                else -> abs(shaded - unshaded) > open
            }
        }.toSet()
        val ropes = board.ropes.indices.filter { i ->
            val decided = board.ropes[i].withIndex().mapNotNull { (j, cell) ->
                when (state(userValues, cell.first, cell.second)) {
                    SHADED -> j to true
                    MARKED -> j to false
                    else -> null
                }
            }
            if (decided.isEmpty()) return@filter false
            val (j0, s0) = decided[0]
            val uniform = decided.all { it.second } || decided.none { it.second }
            val alternating = decided.all { (j, s) -> (s == s0) == ((j - j0) % 2 == 0) }
            !uniform && !alternating
        }.toSet()
        return circles to ropes
    }

    /**
     * Row-major packed-ARGB picture: shaded cells black, marked (unshaded) cells white,
     * undecided cells on a grey ground, as Nonogram's. Shared by the board's live preview
     * and the solved collection thumbnail.
     */
    fun pictureCells(board: Board, userValues: Map<String, Int>): IntArray =
        IntArray(board.rows * board.cols) { i ->
            when (state(userValues, i / board.cols, i % board.cols)) {
                SHADED -> FILL_ARGB
                MARKED -> MARK_ARGB
                else -> GROUND_ARGB
            }
        }

    /** Opaque black for a shaded cell of the picture. */
    const val FILL_ARGB: Int = 0xFF000000.toInt()

    /** Opaque white for a marked (unshaded) cell. */
    const val MARK_ARGB: Int = 0xFFFFFFFF.toInt()

    /** Light-grey ground, matching the nonogram and picto link previews. */
    const val GROUND_ARGB: Int = 0xFFD9D9D9.toInt()

    override fun renderThumbnail(puzzle: Puzzle, answer: JsonObject): PuzzleThumbnail? {
        val board = parseBoard(puzzle)
        if (board.rows == 0 || board.cols == 0) return null
        return PuzzleThumbnail(
            width = board.cols,
            height = board.rows,
            cells = pictureCells(board, restoreUserValues(puzzle, answer)),
        )
    }
}
