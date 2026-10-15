package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Slalom (puzzle type 10). Ports:
 *  - answer extraction from frontend/src/extractors/slalom.ts
 *  - progress from frontend/src/progress/slalom.ts
 *  - completion logic from frontend/src/components/SlalomBoard.tsx (validateSolution)
 *
 * canonRepr: { cells: number[][] (0 empty, 1 wall), start: {row, col}, gateCount,
 *   gates: [{ orientation: "h"|"v", line, from, to, number|null }] } — a "v" gate runs
 *   down column `line` over rows from..to (the trail crosses it horizontally); an "h" gate
 *   runs along row `line` over columns from..to (crossed vertically).
 *
 * answer: { trail: { h: number[][], v: number[][] } } — the same edge grids as Masyu.
 * userValues use the web keys "h:r,c" / "v:r,c" -> 1.
 *
 * Completion follows the documented rules (docs/slalom/slalom.md) a little more strictly
 * than the web check: the drawn segments must form ONE loop (web only traces the loop
 * through the start), each gate is crossed exactly once (web dedupes repeat crossings),
 * and the trail never runs along a gate.
 */
object SlalomEngine : PuzzleEngine {
    override val puzzleType: Int = 10

    data class Gate(val vertical: Boolean, val line: Int, val from: Int, val to: Int, val number: Int?) {
        /** True when (r,c) is one of this gate's cells. */
        fun covers(r: Int, c: Int): Boolean =
            if (vertical) c == line && r in from..to else r == line && c in from..to
    }

    class Canon(
        val cells: List<List<Int>>,
        val startRow: Int,
        val startCol: Int,
        val gateCount: Int,
        val gates: List<Gate>,
    ) {
        val rows get() = cells.size
        val cols get() = cells.maxOfOrNull { it.size } ?: 0
        fun isWall(r: Int, c: Int): Boolean = cells.getOrNull(r)?.getOrNull(c) == 1
    }

    fun hKey(r: Int, c: Int): String = "h:$r,$c"
    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    fun parse(puzzle: Puzzle): Canon {
        val repr = puzzle.canonRepr
        val cells = (repr["cells"] as? JsonArray)?.map { rowEl ->
            (rowEl as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList()
        } ?: emptyList()
        val start = repr["start"] as? JsonObject
        fun int(o: JsonObject?, k: String) = (o?.get(k) as? JsonPrimitive)?.intOrNull
        val gates = (repr["gates"] as? JsonArray)?.mapNotNull { el ->
            val g = el as? JsonObject ?: return@mapNotNull null
            val orientation = (g["orientation"] as? JsonPrimitive)?.contentOrNull
            Gate(
                vertical = orientation == "v",
                line = int(g, "line") ?: return@mapNotNull null,
                from = int(g, "from") ?: return@mapNotNull null,
                to = int(g, "to") ?: return@mapNotNull null,
                number = int(g, "number"),
            )
        } ?: emptyList()
        return Canon(
            cells = cells,
            startRow = int(start, "row") ?: 0,
            startCol = int(start, "col") ?: 0,
            gateCount = int(repr, "gateCount") ?: gates.size,
            gates = gates,
        )
    }

    /** h: rows x (cols-1), v: (rows-1) x cols — 1 = a drawn segment. */
    class Trail(val h: Array<IntArray>, val v: Array<IntArray>)

    fun trail(rows: Int, cols: Int, userValues: Map<String, Int>): Trail {
        val h = Array(rows) { IntArray((cols - 1).coerceAtLeast(0)) }
        val v = Array((rows - 1).coerceAtLeast(0)) { IntArray(cols) }
        for ((key, value) in userValues) {
            if (value != 1 || key.length < 2 || key[1] != ':') continue
            val parts = key.substring(2).split(",")
            if (parts.size != 2) continue
            val r = parts[0].toIntOrNull() ?: continue
            val c = parts[1].toIntOrNull() ?: continue
            when (key[0]) {
                'h' -> if (r in 0 until rows && c in 0 until cols - 1) h[r][c] = 1
                'v' -> if (r in 0 until rows - 1 && c in 0 until cols) v[r][c] = 1
            }
        }
        return Trail(h, v)
    }

    private fun neighbors(t: Trail, r: Int, c: Int, rows: Int, cols: Int): List<Pair<Int, Int>> = buildList {
        if (c < cols - 1 && t.h[r][c] == 1) add(r to c + 1)
        if (c > 0 && t.h[r][c - 1] == 1) add(r to c - 1)
        if (r < rows - 1 && t.v[r][c] == 1) add(r + 1 to c)
        if (r > 0 && t.v[r - 1][c] == 1) add(r - 1 to c)
    }

    fun degree(canon: Canon, t: Trail, r: Int, c: Int): Int = neighbors(t, r, c, canon.rows, canon.cols).size

    /** True when the step between adjacent cells a and b runs along a single gate. */
    fun runsAlongGate(canon: Canon, a: Pair<Int, Int>, b: Pair<Int, Int>): Boolean =
        canon.gates.any { it.covers(a.first, a.second) && it.covers(b.first, b.second) }

    /**
     * Whether a segment may be drawn between adjacent cells a and b on touch: neither is a
     * wall, neither already has two segments (no branches), and the step doesn't run along
     * a gate.
     */
    fun canDraw(canon: Canon, t: Trail, a: Pair<Int, Int>, b: Pair<Int, Int>): Boolean =
        !canon.isWall(a.first, a.second) && !canon.isWall(b.first, b.second) &&
            degree(canon, t, a.first, a.second) < 2 && degree(canon, t, b.first, b.second) < 2 &&
            !runsAlongGate(canon, a, b)

    /** A gate is crossed when a perpendicular segment touches one of its cells (web isCrossed). */
    fun isCrossed(gate: Gate, t: Trail): Boolean {
        if (gate.vertical) {
            val col = gate.line
            for (r in gate.from..gate.to) {
                if (t.h.getOrNull(r)?.getOrNull(col) == 1) return true
                if (col > 0 && t.h.getOrNull(r)?.getOrNull(col - 1) == 1) return true
            }
        } else {
            val row = gate.line
            for (c in gate.from..gate.to) {
                if (t.v.getOrNull(row)?.getOrNull(c) == 1) return true
                if (row > 0 && t.v.getOrNull(row - 1)?.getOrNull(c) == 1) return true
            }
        }
        return false
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val canon = parse(puzzle)
        val t = trail(canon.rows, canon.cols, userValues)
        fun grid(a: Array<IntArray>) = JsonArray(a.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(mapOf("trail" to JsonObject(mapOf("h" to grid(t.h), "v" to grid(t.v)))))
    }

    /** Progress = gates crossed / gateCount (web progress/slalom.ts). */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val canon = parse(puzzle)
        if (canon.gateCount <= 0 || canon.rows == 0) return 0.0
        val t = trail(canon.rows, canon.cols, userValues)
        val crossed = canon.gates.count { isCrossed(it, t) }
        return crossed.toDouble() / canon.gateCount * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val canon = parse(puzzle)
        val trail = answer["trail"] as? JsonObject ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        fun read(grid: Any?, nr: Int, nc: Int, key: (Int, Int) -> String) {
            val outer = grid as? JsonArray ?: return
            for (r in 0 until nr) {
                val rowArr = outer.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until nc) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[key(r, c)] = 1
                }
            }
        }
        read(trail["h"], canon.rows, canon.cols - 1, ::hKey)
        read(trail["v"], canon.rows - 1, canon.cols, ::vKey)
        return result
    }

    /**
     * The loop as a cell sequence starting at the start cell, or null unless every drawn
     * segment belongs to one closed loop through the start.
     */
    fun traceLoop(canon: Canon, t: Trail): List<Pair<Int, Int>>? {
        val rows = canon.rows
        val cols = canon.cols
        var loopCells = 0
        for (r in 0 until rows) for (c in 0 until cols) {
            when (neighbors(t, r, c, rows, cols).size) {
                0 -> {}
                2 -> loopCells++
                else -> return null
            }
        }
        val start = canon.startRow to canon.startCol
        if (canon.startRow !in 0 until rows || canon.startCol !in 0 until cols) return null
        if (neighbors(t, start.first, start.second, rows, cols).size != 2) return null

        val path = mutableListOf(start)
        var prev: Pair<Int, Int>? = null
        var cur = start
        while (true) {
            val next = neighbors(t, cur.first, cur.second, rows, cols).first { it != prev }
            if (next == start) break
            path.add(next)
            prev = cur
            cur = next
            if (path.size > loopCells) return null
        }
        return if (path.size == loopCells) path else null
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val canon = parse(puzzle)
        if (canon.rows == 0 || canon.cols == 0) return false
        if (canon.isWall(canon.startRow, canon.startCol)) return false
        val t = trail(canon.rows, canon.cols, userValues)
        val path = traceLoop(canon, t) ?: return false
        if (path.any { (r, c) -> canon.isWall(r, c) }) return false

        // Walk the loop, recording each gate as the trail steps perpendicularly into it.
        val order = mutableListOf<Int>()
        for (i in path.indices) {
            val cur = path[i]
            val next = path[(i + 1) % path.size]
            if (runsAlongGate(canon, cur, next)) return false
            val horizontal = cur.first == next.first
            canon.gates.forEachIndexed { gi, gate ->
                if (gate.vertical == horizontal && gate.covers(next.first, next.second)) order.add(gi)
            }
        }
        if (order.size != canon.gateCount || order.toSet().size != order.size) return false

        fun inOrder(o: List<Int>) = o.withIndex().all { (i, gi) ->
            canon.gates[gi].number.let { it == null || it == i + 1 }
        }
        return inOrder(order) || inOrder(order.reversed())
    }
}
