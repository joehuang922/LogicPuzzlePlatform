package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * The Hashi rules shared by play and authoring, a port of
 * frontend/src/components/hashiRules.ts. Pure, so it's unit-testable.
 *
 * Cells are lattice points: 0 = no island, 1-8 = an island with that number. Bridges are
 * stored per unit segment (h: rows x (cols-1), v: (rows-1) x cols) holding 0, 1 or 2; a
 * bridge between two islands covers every segment between them with the same count.
 */
object HashiRules {
    const val EMPTY = 0
    const val MAX_CLUE = 8
    private val DIRS = listOf(-1 to 0, 0 to 1, 1 to 0, 0 to -1)

    fun isIsland(v: Int): Boolean = v in 1..MAX_CLUE

    /** (row, col) of a lattice point. */
    data class Point(val r: Int, val c: Int)

    class Bridges(val h: Array<IntArray>, val v: Array<IntArray>)

    fun hKey(r: Int, c: Int) = "h:$r,$c"
    fun vKey(r: Int, c: Int) = "v:$r,$c"

    /** Bridges from player values keyed "h:r,c" / "v:r,c" (as in Masyu), counts 1 or 2. */
    fun bridges(rows: Int, cols: Int, values: Map<String, Int>): Bridges {
        val h = Array(rows) { IntArray(maxOf(0, cols - 1)) }
        val v = Array(maxOf(0, rows - 1)) { IntArray(cols) }
        for ((key, value) in values) {
            val rc = key.drop(2).split(",").mapNotNull { it.toIntOrNull() }
            if (rc.size != 2) continue
            val (r, c) = rc
            when {
                key.startsWith("h:") && r in 0 until rows && c in 0 until cols - 1 -> h[r][c] = value
                key.startsWith("v:") && r in 0 until rows - 1 && c in 0 until cols -> v[r][c] = value
            }
        }
        return Bridges(h, v)
    }

    /** Count on the unit segment from (r, c) one step along (dr, dc); 0 off the board. */
    private fun segment(b: Bridges, r: Int, c: Int, dr: Int, dc: Int): Int =
        if (dr == 0) b.h.getOrNull(r)?.getOrNull(if (dc > 0) c else c - 1) ?: 0
        else b.v.getOrNull(if (dr > 0) r else r - 1)?.getOrNull(c) ?: 0

    /** Segment key from (r, c) one step along (dr, dc). */
    private fun segmentKey(r: Int, c: Int, dr: Int, dc: Int): String =
        if (dr == 0) hKey(r, if (dc > 0) c else c - 1) else vKey(if (dr > 0) r else r - 1, c)

    /** The nearest island from [p] along (dr, dc), or null. */
    fun neighbour(cells: List<List<Int>>, p: Point, dr: Int, dc: Int): Point? {
        var r = p.r + dr
        var c = p.c + dc
        while (r in cells.indices && c in 0 until (cells[r].size)) {
            if (isIsland(cells[r][c])) return Point(r, c)
            r += dr
            c += dc
        }
        return null
    }

    private fun stepBetween(a: Point, b: Point): Pair<Int, Int>? = when {
        a.r == b.r && a.c != b.c -> 0 to Integer.signum(b.c - a.c)
        a.c == b.c && a.r != b.r -> Integer.signum(b.r - a.r) to 0
        else -> null
    }

    /** Bridges between neighbouring islands [a] and [to] (the segment leaving a towards to). */
    fun bridgeCount(b: Bridges, a: Point, to: Point): Int {
        val (dr, dc) = stepBetween(a, to) ?: return 0
        return segment(b, a.r, a.c, dr, dc)
    }

    /** userValues changes that put [n] bridges on every segment between a and to (0 removes). */
    fun bridgeChanges(a: Point, to: Point, n: Int): Map<String, Int> {
        val (dr, dc) = stepBetween(a, to) ?: return emptyMap()
        return buildMap {
            var r = a.r
            var c = a.c
            while (r != to.r || c != to.c) {
                put(segmentKey(r, c, dr, dc), n)
                r += dr
                c += dc
            }
        }
    }

    /** True when a bridge between a and to would cross a perpendicular bridge. */
    fun wouldCross(b: Bridges, a: Point, to: Point): Boolean {
        val (dr, dc) = stepBetween(a, to) ?: return false
        var r = a.r + dr
        var c = a.c + dc
        while (r != to.r || c != to.c) {
            val across = if (dr == 0) segment(b, r, c, 1, 0) + segment(b, r, c, -1, 0)
            else segment(b, r, c, 0, 1) + segment(b, r, c, 0, -1)
            if (across > 0) return true
            r += dr
            c += dc
        }
        return false
    }

    /**
     * The changes one drag from island [a] to island [to] makes: the bridge between them
     * cycles 0 -> 1 -> 2 -> 0. Empty when [to] isn't [a]'s nearest island along a line,
     * or a new bridge would cross another.
     */
    fun cycleBridge(cells: List<List<Int>>, b: Bridges, a: Point, to: Point): Map<String, Int> {
        val (dr, dc) = stepBetween(a, to) ?: return emptyMap()
        if (!isIsland(cells.getOrNull(a.r)?.getOrNull(a.c) ?: EMPTY)) return emptyMap()
        if (neighbour(cells, a, dr, dc) != to) return emptyMap()
        val count = bridgeCount(b, a, to)
        if (count == 0 && wouldCross(b, a, to)) return emptyMap()
        return bridgeChanges(a, to, (count + 1) % 3)
    }

    /** Bridges touching an island: the sum over its four sides. */
    fun islandBridges(b: Bridges, r: Int, c: Int): Int = DIRS.sumOf { (dr, dc) -> segment(b, r, c, dr, dc) }

    enum class IslandState { OPEN, DONE, OVER }

    fun islandState(cells: List<List<Int>>, b: Bridges, r: Int, c: Int): IslandState {
        val n = islandBridges(b, r, c)
        return when {
            n == cells[r][c] -> IslandState.DONE
            n > cells[r][c] -> IslandState.OVER
            else -> IslandState.OPEN
        }
    }

    fun countIslands(cells: List<List<Int>>): Int = cells.sumOf { row -> row.count(::isIsland) }

    fun satisfiedIslands(cells: List<List<Int>>, b: Bridges): Int {
        var n = 0
        for (r in cells.indices) for (c in cells[r].indices) {
            if (isIsland(cells[r][c]) && islandBridges(b, r, c) == cells[r][c]) n++
        }
        return n
    }

    /** Every island's number met, no crossing, no loose bridge ends, all islands connected. */
    fun isSolved(cells: List<List<Int>>, b: Bridges): Boolean {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        val islands = mutableListOf<Point>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val up = segment(b, r, c, -1, 0)
                val down = segment(b, r, c, 1, 0)
                val left = segment(b, r, c, 0, -1)
                val right = segment(b, r, c, 0, 1)
                if (maxOf(up, down, left, right) > 2) return false
                val v = cells[r].getOrNull(c) ?: EMPTY
                if (isIsland(v)) {
                    if (up + down + left + right != v) return false
                    islands += Point(r, c)
                } else {
                    // A bridge runs straight through an empty point, never ends or crosses there.
                    if (up != down || left != right) return false
                    if (up > 0 && left > 0) return false
                }
            }
        }
        val first = islands.firstOrNull() ?: return false
        val seen = hashSetOf(first)
        val stack = ArrayDeque(listOf(first))
        while (stack.isNotEmpty()) {
            val p = stack.removeLast()
            for ((dr, dc) in DIRS) {
                if (segment(b, p.r, p.c, dr, dc) == 0) continue
                val q = neighbour(cells, p, dr, dc) ?: continue
                if (seen.add(q)) stack.addLast(q)
            }
        }
        return seen.size == islands.size
    }

    /** Neighbouring islands of (r, c) along its row and column. */
    fun neighbourCount(cells: List<List<Int>>, r: Int, c: Int): Int =
        DIRS.count { (dr, dc) -> neighbour(cells, Point(r, c), dr, dc) != null }
}

/**
 * Hashi (puzzle type 34). Ports frontend/src/{extractors,progress}/hashi.ts and the
 * completion check in hashiRules.ts. The answer is `{ bridges: { h, v } }`, counts 0-2
 * per unit segment; userValues are keyed "h:row,col" / "v:row,col" -> 1 or 2.
 */
object HashiEngine : PuzzleEngine {
    override val puzzleType: Int = 34

    fun parseCells(puzzle: Puzzle): List<List<Int>> = MasyuEngine.parseCells(puzzle)

    private fun bridges(cells: List<List<Int>>, userValues: Map<String, Int>): HashiRules.Bridges =
        HashiRules.bridges(cells.size, cells.maxOfOrNull { it.size } ?: 0, userValues)

    fun bridges(puzzle: Puzzle, userValues: Map<String, Int>): HashiRules.Bridges =
        bridges(parseCells(puzzle), userValues)

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val b = bridges(puzzle, userValues)
        fun grid(rows: Array<IntArray>) = JsonArray(rows.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(mapOf("bridges" to JsonObject(mapOf("h" to grid(b.h), "v" to grid(b.v)))))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        val obj = answer["bridges"] as? JsonObject ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        fun read(name: String, nRows: Int, nCols: Int, key: (Int, Int) -> String) {
            val grid = obj[name] as? JsonArray ?: return
            for (r in 0 until nRows) {
                val row = grid.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until nCols) {
                    val n = (row.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                    if (n in 1..2) result[key(r, c)] = n
                }
            }
        }
        read("h", rows, cols - 1, HashiRules::hKey)
        read("v", rows - 1, cols, HashiRules::vKey)
        return result
    }

    /** Islands whose bridge count equals their number / all islands * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val total = HashiRules.countIslands(cells)
        if (total == 0) return 0.0
        val done = HashiRules.satisfiedIslands(cells, bridges(cells, userValues))
        return (done.toDouble() / total * 100.0).coerceAtMost(100.0)
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        return HashiRules.isSolved(cells, bridges(cells, userValues))
    }
}
