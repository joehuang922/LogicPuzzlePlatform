package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Shakashaka (puzzle type 11). Ports:
 *  - answer extraction from frontend/src/extractors/shakashaka.ts
 *  - progress from frontend/src/progress/shakashaka.ts
 *  - the completion rules of frontend/src/components/ShakashakaBoard.tsx
 *
 * canonRepr: { cells: number[][] } — rows x cols; -1 = white cell, 0..4 = black cell
 *   numbered with how many orthogonal neighbours hold a triangle, 5 = unnumbered black.
 *
 * answer: { states: number[][] } — rows x cols; 0 = unset, 1..4 = a black half-cell
 *   triangle named by its right-angle corner (1 ◤ top-left, 2 ◥ top-right,
 *   3 ◣ bottom-left, 4 ◢ bottom-right), 5 = a dot mark (solver aid, counts as white).
 *   Black cells are always 0.
 *
 * User input rides in the flat userValues map keyed "col,row" -> state (col first),
 * matching the web client so extracted answers are byte-identical.
 */
object ShakashakaEngine : PuzzleEngine {
    override val puzzleType: Int = 11

    const val WHITE = -1
    const val UNSET = 0
    const val TRI_TL = 1
    const val TRI_TR = 2
    const val TRI_BL = 3
    const val TRI_BR = 4
    const val MARK = 5

    fun cellKey(col: Int, row: Int): String = "$col,$row"

    /** Parse the rows x cols grid from a puzzle's canonRepr; missing/invalid -> white. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> {
        val outer = puzzle.canonRepr["cells"] as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Int>()
            rowArr.map { (it as? JsonPrimitive)?.intOrNull ?: WHITE }
        }
    }

    private fun dims(cells: List<List<Int>>): Pair<Int, Int> =
        cells.size to (cells.maxOfOrNull { it.size } ?: 0)

    /** True when (r,c) is a white (playable) cell; off-grid and black cells are not. */
    fun isWhiteCell(cells: List<List<Int>>, r: Int, c: Int): Boolean =
        (cells.getOrNull(r)?.getOrNull(c) ?: 0) == WHITE

    fun isTriangle(state: Int): Boolean = state in TRI_TL..TRI_BR

    /**
     * The triangle a tap places, picked by the quadrant tapped: the triangle's right
     * angle sits in that corner (web getQuadrant). [fx]/[fy] are the tap's position
     * within the cell, 0..1.
     */
    fun quadrant(fx: Float, fy: Float): Int = when {
        fx < 0.5f && fy < 0.5f -> TRI_TL
        fy < 0.5f -> TRI_TR
        fx < 0.5f -> TRI_BL
        else -> TRI_BR
    }

    /**
     * The state after tapping a cell in [quadrant]: an empty cell takes that triangle,
     * a different triangle swaps to it, the same triangle turns into a dot mark, and a
     * mark clears. One tap gesture covers both of the web board's modes, so there are
     * no mode chips.
     */
    fun nextState(current: Int, quadrant: Int): Int = when (current) {
        UNSET -> quadrant
        quadrant -> MARK
        MARK -> UNSET
        else -> quadrant
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val states = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c ->
                val v = if (isWhiteCell(cells, r, c)) userValues[cellKey(c, r)] ?: UNSET else UNSET
                JsonPrimitive(v)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /** Progress = white cells holding a triangle or mark / white cells * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        var total = 0
        var filled = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!isWhiteCell(cells, r, c)) continue
                total++
                if ((userValues[cellKey(c, r)] ?: UNSET) != UNSET) filled++
            }
        }
        if (total == 0) return 100.0
        return filled.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val states = answer["states"] as? JsonArray
        val result = mutableMapOf<String, Int>()
        for (r in 0 until rows) {
            val rowArr = states?.getOrNull(r) as? JsonArray
            for (c in 0 until cols) {
                if (!isWhiteCell(cells, r, c)) continue
                val v = (rowArr?.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (v in TRI_TL..MARK) result[cellKey(c, r)] = v
            }
        }
        return result
    }

    // Each cell splits along both diagonals into four quarter-triangles: top, right,
    // bottom, left. A triangle state blackens the two quarters at its right angle.
    private const val Q_TOP = 0
    private const val Q_RIGHT = 1
    private const val Q_BOTTOM = 2
    private const val Q_LEFT = 3

    private fun quarterBlack(state: Int, q: Int): Boolean = when (state) {
        TRI_TL -> q == Q_TOP || q == Q_LEFT
        TRI_TR -> q == Q_TOP || q == Q_RIGHT
        TRI_BL -> q == Q_BOTTOM || q == Q_LEFT
        TRI_BR -> q == Q_BOTTOM || q == Q_RIGHT
        else -> false
    }

    /**
     * True when the current input is a full, valid Shakashaka solution:
     *  1. every numbered black cell has exactly that many orthogonal neighbours holding
     *     a triangle, and
     *  2. every white area (unset/marked cells plus the white halves of triangle cells)
     *     is a rectangle, either axis-aligned or rotated 45°.
     *
     * Rule 2 works on quarter-triangles: flood-fill white quarters across shared edges,
     * then compare each area against its bounding box in (x, y) and in the 45° frame
     * (x+y, x-y). An area is a subset of both boxes, so it's a rectangle exactly when its
     * area fills one of them.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        fun state(r: Int, c: Int): Int =
            if (isWhiteCell(cells, r, c)) userValues[cellKey(c, r)] ?: UNSET else UNSET

        // 1. Numbered clues.
        val dirs = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = cells.getOrNull(r)?.getOrNull(c) ?: continue
                if (clue !in 0..4) continue
                val count = dirs.count { (dr, dc) -> isTriangle(state(r + dr, c + dc)) }
                if (count != clue) return false
            }
        }

        // 2. White areas are rectangles.
        fun white(r: Int, c: Int, q: Int): Boolean =
            isWhiteCell(cells, r, c) && !quarterBlack(state(r, c), q)

        val visited = Array(rows) { Array(cols) { BooleanArray(4) } }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                for (q in 0 until 4) {
                    if (visited[r][c][q] || !white(r, c, q)) continue
                    // Coordinates are doubled so cell corners and centres are integers;
                    // a quarter then has area 1 and a whole cell area 4.
                    var area = 0
                    var minX = Int.MAX_VALUE; var maxX = Int.MIN_VALUE
                    var minY = Int.MAX_VALUE; var maxY = Int.MIN_VALUE
                    var minU = Int.MAX_VALUE; var maxU = Int.MIN_VALUE
                    var minV = Int.MAX_VALUE; var maxV = Int.MIN_VALUE
                    val stack = ArrayDeque<Triple<Int, Int, Int>>()
                    visited[r][c][q] = true
                    stack.addLast(Triple(r, c, q))
                    while (stack.isNotEmpty()) {
                        val (cr, cc, cq) = stack.removeLast()
                        area++
                        val x0 = 2 * cc; val y0 = 2 * cr
                        val corners = when (cq) {
                            Q_TOP -> listOf(x0 to y0, x0 + 2 to y0)
                            Q_RIGHT -> listOf(x0 + 2 to y0, x0 + 2 to y0 + 2)
                            Q_BOTTOM -> listOf(x0 to y0 + 2, x0 + 2 to y0 + 2)
                            else -> listOf(x0 to y0, x0 to y0 + 2)
                        } + (x0 + 1 to y0 + 1)
                        for ((x, y) in corners) {
                            minX = minOf(minX, x); maxX = maxOf(maxX, x)
                            minY = minOf(minY, y); maxY = maxOf(maxY, y)
                            minU = minOf(minU, x + y); maxU = maxOf(maxU, x + y)
                            minV = minOf(minV, x - y); maxV = maxOf(maxV, x - y)
                        }
                        // Neighbours across shared edges: the two adjacent quarters in
                        // this cell, and the facing quarter of the next cell over.
                        val across = when (cq) {
                            Q_TOP -> Triple(cr - 1, cc, Q_BOTTOM)
                            Q_RIGHT -> Triple(cr, cc + 1, Q_LEFT)
                            Q_BOTTOM -> Triple(cr + 1, cc, Q_TOP)
                            else -> Triple(cr, cc - 1, Q_RIGHT)
                        }
                        for (n in listOf(Triple(cr, cc, (cq + 1) % 4), Triple(cr, cc, (cq + 3) % 4), across)) {
                            val (nr, nc, nq) = n
                            if (nr !in 0 until rows || nc !in 0 until cols) continue
                            if (visited[nr][nc][nq] || !white(nr, nc, nq)) continue
                            visited[nr][nc][nq] = true
                            stack.addLast(n)
                        }
                    }
                    val axisArea = (maxX - minX) * (maxY - minY)
                    // In the (u, v) frame lengths scale by sqrt 2, so xy-area = du*dv / 2.
                    val diagArea2 = (maxU - minU) * (maxV - minV)
                    if (area != axisArea && 2 * area != diagArea2) return false
                }
            }
        }
        return true
    }
}
