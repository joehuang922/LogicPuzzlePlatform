package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Yajilin (puzzle type 13). Ports:
 *  - answer extraction from frontend/src/extractors/yajilin.ts
 *  - progress from frontend/src/progress/yajilin.ts
 *  - completion logic from frontend/src/components/YajilinBoard.tsx (validateSolution)
 *
 * canonRepr: { cells: (null | { dir: "up"|"down"|"left"|"right", num: int })[][] } —
 *   null = an empty cell, an object = a directional clue (exactly `num` blackened cells
 *   lie in direction `dir`). Clue cells are never blackened and the loop avoids them.
 *
 * answer: { blacks: number[][], edges: { h: number[][], v: number[][] } }
 *   - blacks: rows x cols; 1 = blackened, 2 = marked (solver-aid dot), 0 = neither
 *   - h: rows x (cols-1); h[r][c] = 1 means a loop segment between (r,c) and (r,c+1)
 *   - v: (rows-1) x cols; v[r][c] = 1 means a loop segment between (r,c) and (r+1,c)
 *
 * The player both shades cells and draws a loop. User input rides in the flat userValues
 * map with the web client's keys: "b:r,c" -> 1/2 for the cell state, "h:r,c" / "v:r,c" -> 1
 * for segments (all row-first). Shading is the shared [ShadeMarkEngine] tap cycle; the loop
 * is drag-drawn by YajilinBoard, which uses [canDrawEdge] to keep it legal as it goes.
 */
object YajilinEngine : ShadeMarkEngine {
    override val puzzleType: Int = 13

    const val BLACK = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    enum class Dir { UP, DOWN, LEFT, RIGHT }

    data class Clue(val dir: Dir, val num: Int)

    /** The cell-state key for (col, row). Row-first, like the web transport. */
    override fun cellKey(col: Int, row: Int): String = "b:$row,$col"

    /** The key for a horizontal segment left-anchored at (r,c). */
    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    /** The key for a vertical segment top-anchored at (r,c). */
    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    /** Parse the rows x cols clue grid; null = empty cell (also for malformed entries). */
    fun parseCells(puzzle: Puzzle): List<List<Clue?>> {
        val outer = puzzle.canonRepr["cells"] as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Clue?>()
            rowArr.map { parseClue(it) }
        }
    }

    private fun parseClue(el: Any?): Clue? {
        val obj = el as? JsonObject ?: return null
        val dir = when ((obj["dir"] as? JsonPrimitive)?.contentOrNull) {
            "up" -> Dir.UP
            "down" -> Dir.DOWN
            "left" -> Dir.LEFT
            "right" -> Dir.RIGHT
            else -> return null
        }
        val num = (obj["num"] as? JsonPrimitive)?.intOrNull ?: return null
        return Clue(dir, num)
    }

    private fun dims(cells: List<List<Clue?>>): Pair<Int, Int> =
        cells.size to (cells.maxOfOrNull { it.size } ?: 0)

    fun isClue(cells: List<List<Clue?>>, r: Int, c: Int): Boolean =
        cells.getOrNull(r)?.getOrNull(c) != null

    /** A tap cycles the single cell; clue cells take no input. */
    override fun shadeGroup(puzzle: Puzzle, col: Int, row: Int): ShadeGroup? =
        if (isClue(parseCells(puzzle), row, col)) null else ShadeGroup(listOf(col to row))

    /** Materialized answer grids. */
    class Grids(val blacks: Array<IntArray>, val h: Array<IntArray>, val v: Array<IntArray>)

    fun grids(rows: Int, cols: Int, userValues: Map<String, Int>): Grids {
        val blacks = Array(rows) { IntArray(cols) }
        val h = Array(rows) { IntArray((cols - 1).coerceAtLeast(0)) }
        val v = Array((rows - 1).coerceAtLeast(0)) { IntArray(cols) }
        for ((key, value) in userValues) {
            if (value == 0 || key.length < 2 || key[1] != ':') continue
            val (r, c) = parseRC(key.substring(2)) ?: continue
            when (key[0]) {
                'b' -> if (r in 0 until rows && c in 0 until cols) blacks[r][c] = value
                'h' -> if (r in 0 until rows && c in 0 until cols - 1) h[r][c] = value
                'v' -> if (r in 0 until rows - 1 && c in 0 until cols) v[r][c] = value
            }
        }
        return Grids(blacks, h, v)
    }

    private fun parseRC(s: String): Pair<Int, Int>? {
        val parts = s.split(",")
        if (parts.size != 2) return null
        val r = parts[0].toIntOrNull() ?: return null
        val c = parts[1].toIntOrNull() ?: return null
        return r to c
    }

    /** Number of drawn segments touching (r,c). */
    fun degree(g: Grids, r: Int, c: Int): Int {
        val rows = g.blacks.size
        val cols = g.blacks.firstOrNull()?.size ?: 0
        var d = 0
        if (c > 0 && g.h[r][c - 1] == 1) d++
        if (c < cols - 1 && g.h[r][c] == 1) d++
        if (r > 0 && g.v[r - 1][c] == 1) d++
        if (r < rows - 1 && g.v[r][c] == 1) d++
        return d
    }

    /**
     * Whether a new segment may join (r,c) — one end of a segment being drawn: it must be
     * an empty (non-clue) cell that isn't blackened and has fewer than two segments. The
     * web board only blocks blackened cells; on touch we also keep the loop off clues and
     * branch-free, since a stray finger is far easier to make than a stray mouse drag.
     */
    fun canDrawEdge(cells: List<List<Clue?>>, g: Grids, r: Int, c: Int): Boolean =
        !isClue(cells, r, c) && g.blacks[r][c] != BLACK && degree(g, r, c) < 2

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val (rows, cols) = dims(parseCells(puzzle))
        val g = grids(rows, cols, userValues)
        fun grid(a: Array<IntArray>) = JsonArray(a.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(
            mapOf(
                "blacks" to grid(g.blacks),
                "edges" to JsonObject(mapOf("h" to grid(g.h), "v" to grid(g.v))),
            ),
        )
    }

    /**
     * Progress = non-clue cells that are blackened/marked or touched by a segment, over all
     * non-clue cells (web progress/yajilin.ts counts any non-zero "b:" value, marks included).
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return 0.0
        val g = grids(rows, cols, userValues)
        var total = 0
        var resolved = 0
        for (r in 0 until rows) for (c in 0 until cols) {
            if (isClue(cells, r, c)) continue
            total++
            if (g.blacks[r][c] != 0 || degree(g, r, c) > 0) resolved++
        }
        if (total == 0) return 0.0
        return resolved.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val (rows, cols) = dims(parseCells(puzzle))
        val result = mutableMapOf<String, Int>()
        fun read(grid: Any?, nr: Int, nc: Int, key: (Int, Int) -> String) {
            val outer = grid as? JsonArray ?: return
            for (r in 0 until nr) {
                val rowArr = outer.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until nc) {
                    val v = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                    if (v != 0) result[key(r, c)] = v
                }
            }
        }
        read(answer["blacks"], rows, cols) { r, c -> cellKey(c, r) }
        val edges = answer["edges"] as? JsonObject
        read(edges?.get("h"), rows, cols - 1, ::hKey)
        read(edges?.get("v"), rows - 1, cols, ::vKey)
        return result
    }

    /**
     * True when every non-clue cell is blackened or on a single closed loop, no two
     * blackened cells touch orthogonally, and every arrow clue counts correctly (port of
     * YajilinBoard.tsx validateSolution). Marks (2) are solver aids and count as unshaded.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val g = grids(rows, cols, userValues)
        fun black(r: Int, c: Int) = g.blacks[r][c] == BLACK

        for (r in 0 until rows) for (c in 0 until cols) {
            if (!black(r, c)) continue
            if (isClue(cells, r, c)) return false
            if (c < cols - 1 && black(r, c + 1)) return false
            if (r < rows - 1 && black(r + 1, c)) return false
        }

        var loopCells = 0
        var start: Pair<Int, Int>? = null
        for (r in 0 until rows) for (c in 0 until cols) {
            val d = degree(g, r, c)
            if (d > 0) {
                if (d != 2 || isClue(cells, r, c) || black(r, c)) return false
                loopCells++
                if (start == null) start = r to c
            } else if (!isClue(cells, r, c) && !black(r, c)) {
                return false // an empty cell that's neither blackened nor on the loop
            }
        }
        if (start == null) return false

        // One connected loop: walking from any loop cell reaches all of them.
        val visited = Array(rows) { BooleanArray(cols) }
        val stack = ArrayDeque<Pair<Int, Int>>()
        stack.addLast(start)
        visited[start.first][start.second] = true
        var seen = 1
        while (stack.isNotEmpty()) {
            val (r, c) = stack.removeLast()
            val next = buildList {
                if (c < cols - 1 && g.h[r][c] == 1) add(r to c + 1)
                if (c > 0 && g.h[r][c - 1] == 1) add(r to c - 1)
                if (r < rows - 1 && g.v[r][c] == 1) add(r + 1 to c)
                if (r > 0 && g.v[r - 1][c] == 1) add(r - 1 to c)
            }
            for ((nr, nc) in next) {
                if (visited[nr][nc]) continue
                visited[nr][nc] = true
                seen++
                stack.addLast(nr to nc)
            }
        }
        if (seen != loopCells) return false

        for (r in 0 until rows) for (c in 0 until cols) {
            val clue = cells.getOrNull(r)?.getOrNull(c) ?: continue
            val count = when (clue.dir) {
                Dir.UP -> (0 until r).count { black(it, c) }
                Dir.DOWN -> (r + 1 until rows).count { black(it, c) }
                Dir.LEFT -> (0 until c).count { black(r, it) }
                Dir.RIGHT -> (c + 1 until cols).count { black(r, it) }
            }
            if (count != clue.num) return false
        }
        return true
    }
}
