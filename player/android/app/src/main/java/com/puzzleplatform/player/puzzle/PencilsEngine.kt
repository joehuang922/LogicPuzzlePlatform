package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * The Pencils rules shared by play and authoring, a port of validateSolution and
 * getHeadEdge in frontend/src/components/PencilsBoard.tsx. Pure, so it's unit-testable.
 *
 * Cells: 0 = empty, > 0 = a number clue, -1..-4 = a given head pointing up / down / left
 * / right. The player draws trails between cell centres, places heads and draws body
 * edges. Each head's body is the wall-bounded rectangle behind it; its trail runs from the
 * head cell exactly as many segments as the body has cells; every cell belongs to exactly
 * one pencil.
 *
 * Grids (all row-major, matching the answer JSON):
 *  - trails.h rows x (cols-1): a segment between (r,c) and (r,c+1)
 *  - trails.v (rows-1) x cols: a segment between (r,c) and (r+1,c)
 *  - heads rows x cols: 0 or a head code
 *  - edges.h (rows-1) x cols: a wall between (r,c) and (r+1,c)
 *  - edges.v rows x (cols-1): a wall between (r,c) and (r,c+1)
 */
object PencilsRules {
    const val UP = -1
    const val DOWN = -2
    const val LEFT = -3
    const val RIGHT = -4

    /** Head codes and their names, in picker order. */
    val HEADS = listOf(UP to "Up", DOWN to "Down", LEFT to "Left", RIGHT to "Right")

    fun isHead(v: Int): Boolean = v in RIGHT..UP

    // userValues keys, the web renderer's transport.
    fun trailHKey(r: Int, c: Int) = "th:$r,$c"
    fun trailVKey(r: Int, c: Int) = "tv:$r,$c"
    fun headKey(r: Int, c: Int) = "hd:$r,$c"
    fun edgeHKey(r: Int, c: Int) = "eh:$r,$c"
    fun edgeVKey(r: Int, c: Int) = "ev:$r,$c"

    /**
     * The edge a head at (r, c) implies — its flat base, between the head and its body —
     * as a userValues key, or null when the base is the board's border.
     */
    fun headEdgeKey(r: Int, c: Int, dir: Int, rows: Int, cols: Int): String? = when (dir) {
        UP -> if (r < rows - 1) edgeHKey(r, c) else null
        DOWN -> if (r > 0) edgeHKey(r - 1, c) else null
        LEFT -> if (c < cols - 1) edgeVKey(r, c) else null
        RIGHT -> if (c > 0) edgeVKey(r, c - 1) else null
        else -> null
    }

    /** The cell behind a head (where its body starts), or null for a non-head. */
    fun bodyStart(r: Int, c: Int, dir: Int): Pair<Int, Int>? = when (dir) {
        UP -> r + 1 to c
        DOWN -> r - 1 to c
        LEFT -> r to c + 1
        RIGHT -> r to c - 1
        else -> null
    }

    class Answer(
        val trailsH: Array<IntArray>,
        val trailsV: Array<IntArray>,
        val heads: Array<IntArray>,
        val edgesH: Array<IntArray>,
        val edgesV: Array<IntArray>,
    )

    /** Materialize the answer grids from userValues, like the web extractor. */
    fun answer(rows: Int, cols: Int, userValues: Map<String, Int>): Answer {
        val a = Answer(
            trailsH = Array(rows) { IntArray(maxOf(cols - 1, 0)) },
            trailsV = Array(maxOf(rows - 1, 0)) { IntArray(cols) },
            heads = Array(rows) { IntArray(cols) },
            edgesH = Array(maxOf(rows - 1, 0)) { IntArray(cols) },
            edgesV = Array(rows) { IntArray(maxOf(cols - 1, 0)) },
        )
        for ((key, value) in userValues) {
            val prefix = key.substringBefore(':', "")
            val (r, c) = parseRC(key.substringAfter(':')) ?: continue
            val grid = when (prefix) {
                "th" -> a.trailsH
                "tv" -> a.trailsV
                "hd" -> a.heads
                "eh" -> a.edgesH
                "ev" -> a.edgesV
                else -> continue
            }
            if (r in grid.indices && c in grid[r].indices) grid[r][c] = value
        }
        return a
    }

    private fun parseRC(s: String): Pair<Int, Int>? {
        val parts = s.split(",")
        if (parts.size != 2) return null
        val r = parts[0].toIntOrNull() ?: return null
        val c = parts[1].toIntOrNull() ?: return null
        return r to c
    }

    /** True when any trail segment is drawn (the web only checks completion then). */
    fun hasTrail(a: Answer): Boolean =
        a.trailsH.any { row -> row.any { it == 1 } } || a.trailsV.any { row -> row.any { it == 1 } }

    /** A full, valid solution; the port of the web validateSolution. */
    fun isSolved(cells: List<List<Int>>, a: Answer): Boolean {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        if (rows == 0 || cols == 0) return false
        fun canon(r: Int, c: Int) = cells[r].getOrNull(c) ?: 0

        val allHeads = Array(rows) { r -> IntArray(cols) { c -> if (canon(r, c) < 0) canon(r, c) else a.heads[r][c] } }

        // Walls incl. the border: wallH[r][c] above row r, wallV[r][c] left of column c.
        val wallH = Array(rows + 1) { r -> BooleanArray(cols) { c -> r == 0 || r == rows || a.edgesH[r - 1][c] == 1 } }
        val wallV = Array(rows) { r -> BooleanArray(cols + 1) { c -> c == 0 || c == cols || a.edgesV[r][c - 1] == 1 } }
        for (r in 0 until rows) for (c in 0 until cols) {
            when (allHeads[r][c]) {
                UP -> wallH[r + 1][c] = true
                DOWN -> wallH[r][c] = true
                LEFT -> wallV[r][c + 1] = true
                RIGHT -> wallV[r][c] = true
            }
        }

        val trailAdj = Array(rows * cols) { mutableListOf<Int>() }
        for (r in 0 until rows) for (c in 0 until cols - 1) {
            if (a.trailsH[r][c] == 1) {
                trailAdj[r * cols + c].add(r * cols + c + 1)
                trailAdj[r * cols + c + 1].add(r * cols + c)
            }
        }
        for (r in 0 until rows - 1) for (c in 0 until cols) {
            if (a.trailsV[r][c] == 1) {
                trailAdj[r * cols + c].add((r + 1) * cols + c)
                trailAdj[(r + 1) * cols + c].add(r * cols + c)
            }
        }

        val claimed = BooleanArray(rows * cols)
        for (hr in 0 until rows) for (hc in 0 until cols) {
            val dir = allHeads[hr][hc]
            if (dir >= 0) continue
            val (br, bc) = bodyStart(hr, hc, dir) ?: return false
            if (br !in 0 until rows || bc !in 0 until cols) return false

            // Body: flood-fill behind the head, bounded by walls; must be a rectangle.
            val body = hashSetOf(br * cols + bc)
            val stack = ArrayDeque(listOf(br to bc))
            while (stack.isNotEmpty()) {
                val (r, c) = stack.removeLast()
                fun visit(nr: Int, nc: Int) {
                    if (body.add(nr * cols + nc)) stack.addLast(nr to nc)
                }
                if (r > 0 && !wallH[r][c]) visit(r - 1, c)
                if (r < rows - 1 && !wallH[r + 1][c]) visit(r + 1, c)
                if (c > 0 && !wallV[r][c]) visit(r, c - 1)
                if (c < cols - 1 && !wallV[r][c + 1]) visit(r, c + 1)
            }
            val minR = body.minOf { it / cols }
            val maxR = body.maxOf { it / cols }
            val minC = body.minOf { it % cols }
            val maxC = body.maxOf { it % cols }
            if (body.size != (maxR - minR + 1) * (maxC - minC + 1)) return false
            val numbers = mutableListOf<Int>()
            for (idx in body) {
                val v = canon(idx / cols, idx % cols)
                if (v > 0) numbers.add(v)
                if (allHeads[idx / cols][idx % cols] < 0) return false
            }

            // Trail: a non-branching path through the head cell (an end or the middle).
            val headIdx = hr * cols + hc
            val headNeighbors = trailAdj[headIdx]
            if (headNeighbors.isEmpty() || headNeighbors.size > 2) return false
            val trail = linkedSetOf(headIdx)
            for (startNbr in headNeighbors) {
                var cur = startNbr
                val visited = hashSetOf(headIdx)
                while (true) {
                    if (cur in trail && cur != headIdx) break
                    visited.add(cur)
                    trail.add(cur)
                    val next = trailAdj[cur].filter { it !in visited }
                    if (next.size > 1) return false
                    if (next.isEmpty()) break
                    cur = next[0]
                }
            }
            val trailLength = trail.size - 1
            if (trailLength != body.size) return false
            if (numbers.any { it != trailLength }) return false
            if (trail.any { it != headIdx && it in body }) return false

            for (idx in trail) {
                if (claimed[idx]) return false
                claimed[idx] = true
            }
            for (idx in body) {
                if (claimed[idx]) return false
                claimed[idx] = true
            }
        }
        return claimed.all { it }
    }

    /**
     * Cells touched by a given head, a placed head, a trail segment or an edge, as a share
     * of all cells; the port of frontend/src/progress/pencils.ts.
     */
    fun progress(cells: List<List<Int>>, userValues: Map<String, Int>): Double {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        if (rows == 0 || cols == 0) return 0.0
        val touched = Array(rows) { r -> BooleanArray(cols) { c -> (cells[r].getOrNull(c) ?: 0) < 0 } }
        fun touch(r: Int, c: Int) {
            if (r in 0 until rows && c in 0 until cols) touched[r][c] = true
        }
        for ((key, value) in userValues) {
            if (value == 0) continue
            val (r, c) = parseRC(key.substringAfter(':')) ?: continue
            when (key.substringBefore(':', "")) {
                "th", "ev" -> { touch(r, c); touch(r, c + 1) }
                "tv", "eh" -> { touch(r, c); touch(r + 1, c) }
                "hd" -> touch(r, c)
            }
        }
        return touched.sumOf { row -> row.count { it } }.toDouble() / (rows * cols) * 100.0
    }
}

/**
 * Pencils (puzzle type 8). Ports frontend/src/extractors/pencils.ts,
 * frontend/src/progress/pencils.ts and the completion check in PencilsBoard.tsx.
 *
 * answer: { trails: { h, v }, heads, edges: { h, v } } (see [PencilsRules]); userValues
 * ride the web renderer's keys "th:r,c" / "tv:r,c" -> 1, "hd:r,c" -> head code,
 * "eh:r,c" / "ev:r,c" -> 1. A placed head also sets the edge it implies.
 */
object PencilsEngine : PuzzleEngine {
    override val puzzleType: Int = 8

    fun parseCells(puzzle: Puzzle): List<List<Int>> = MasyuEngine.parseCells(puzzle)

    private fun dims(cells: List<List<Int>>) = cells.size to (cells.maxOfOrNull { it.size } ?: 0)

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val (rows, cols) = dims(parseCells(puzzle))
        val a = PencilsRules.answer(rows, cols, userValues)
        fun grid(g: Array<IntArray>) = JsonArray(g.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(
            mapOf(
                "trails" to JsonObject(mapOf("h" to grid(a.trailsH), "v" to grid(a.trailsV))),
                "heads" to grid(a.heads),
                "edges" to JsonObject(mapOf("h" to grid(a.edgesH), "v" to grid(a.edgesV))),
            ),
        )
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val (rows, cols) = dims(parseCells(puzzle))
        val result = mutableMapOf<String, Int>()
        fun read(el: Any?, rowCount: Int, colCount: Int, key: (Int, Int) -> String) {
            val outer = el as? JsonArray ?: return
            for (r in 0 until rowCount) {
                val row = outer.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until colCount) {
                    val v = (row.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                    if (v != 0) result[key(r, c)] = v
                }
            }
        }
        val trails = answer["trails"] as? JsonObject
        val edges = answer["edges"] as? JsonObject
        read(trails?.get("h"), rows, cols - 1, PencilsRules::trailHKey)
        read(trails?.get("v"), rows - 1, cols, PencilsRules::trailVKey)
        read(answer["heads"], rows, cols, PencilsRules::headKey)
        read(edges?.get("h"), rows - 1, cols, PencilsRules::edgeHKey)
        read(edges?.get("v"), rows, cols - 1, PencilsRules::edgeVKey)
        return result
    }

    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double =
        PencilsRules.progress(parseCells(puzzle), userValues)

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val a = PencilsRules.answer(rows, cols, userValues)
        return PencilsRules.hasTrail(a) && PencilsRules.isSolved(cells, a)
    }
}
