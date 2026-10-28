package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Kuralin (puzzle type 28). Ports:
 *  - answer extraction from frontend/src/extractors/kuralin.ts
 *  - progress from frontend/src/progress/kuralin.ts
 *  - completion logic from frontend/src/components/KuralinBoard.tsx (validateSolution)
 *
 * canonRepr: { width, height, circles: [{ dr, dc, color }] } — circles sit on grid lines in
 *   doubled coordinates (cell (r,c) center is (2r+1, 2c+1)): odd/even or even/odd is an edge
 *   midpoint touching 2 cells, even/even an interior corner touching 4. Never a cell center.
 *   color: 0 = white (more white cells), 1 = black (more black cells), 2 = gray (equal).
 *
 * answer: { blacks: number[][], edges: { h: number[][], v: number[][] } } — Yajilin's shape:
 *   - blacks: rows x cols; 1 = blackened, 2 = marked (solver-aid dot), 0 = neither
 *   - h: rows x (cols-1); h[r][c] = 1 means a loop segment between (r,c) and (r,c+1)
 *   - v: (rows-1) x cols; v[r][c] = 1 means a loop segment between (r,c) and (r+1,c)
 *
 * User input rides in the flat userValues map with the web client's keys: "b:r,c" -> 1/2,
 * "h:r,c" / "v:r,c" -> 1 (all row-first). Shading is the shared [ShadeMarkEngine] tap cycle;
 * the loop is drag-drawn by KuralinBoard, which uses [canDrawEdge] to keep it legal.
 */
object KuralinEngine : ShadeMarkEngine {
    override val puzzleType: Int = 28

    const val BLACK = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    const val WHITE_CIRCLE = 0
    const val BLACK_CIRCLE = 1
    const val GRAY_CIRCLE = 2

    data class Circle(val dr: Int, val dc: Int, val color: Int)

    data class Board(val rows: Int, val cols: Int, val circles: List<Circle>)

    override fun cellKey(col: Int, row: Int): String = "b:$row,$col"

    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    fun parseBoard(puzzle: Puzzle): Board = parseBoard(puzzle.canonRepr)

    fun parseBoard(canon: JsonObject): Board {
        val cols = (canon["width"] as? JsonPrimitive)?.intOrNull ?: 0
        val rows = (canon["height"] as? JsonPrimitive)?.intOrNull ?: 0
        val circles = (canon["circles"] as? JsonArray)?.mapNotNull { el ->
            val obj = el as? JsonObject ?: return@mapNotNull null
            val dr = (obj["dr"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val dc = (obj["dc"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val color = (obj["color"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            Circle(dr, dc, color)
        } ?: emptyList()
        return Board(rows.coerceAtLeast(0), cols.coerceAtLeast(0), circles)
    }

    /** Whether (dr, dc) is a place a circle may sit: an interior edge midpoint or corner. */
    fun isValidPoint(dr: Int, dc: Int, rows: Int, cols: Int): Boolean =
        dr in 1 until 2 * rows && dc in 1 until 2 * cols && (dr % 2 == 0 || dc % 2 == 0)

    /** The cells (row, col) a circle touches: 2 for an edge midpoint, 4 for a corner. */
    fun touchedCells(circle: Circle): List<Pair<Int, Int>> {
        val rs = if (circle.dr % 2 == 1) listOf((circle.dr - 1) / 2) else listOf(circle.dr / 2 - 1, circle.dr / 2)
        val cs = if (circle.dc % 2 == 1) listOf((circle.dc - 1) / 2) else listOf(circle.dc / 2 - 1, circle.dc / 2)
        return rs.flatMap { r -> cs.map { c -> r to c } }
    }

    /** Whether a circle's black/white comparison holds. */
    fun circleSatisfied(color: Int, black: Int, white: Int): Boolean = when (color) {
        BLACK_CIRCLE -> black > white
        WHITE_CIRCLE -> white > black
        else -> black == white
    }

    /**
     * Snap a fractional tap (in cell units; col 1.5 is the middle of col 1) to the nearest
     * valid circle point, as doubled (dr, dc), or null off the board's interior. A tap
     * nearest a cell center moves onto whichever grid line is closer (web editor parity).
     */
    fun nearestPoint(fx: Float, fy: Float, rows: Int, cols: Int): Pair<Int, Int>? {
        val fdc = fx * 2
        val fdr = fy * 2
        var dc = fdc.roundToInt()
        var dr = fdr.roundToInt()
        if (dr % 2 != 0 && dc % 2 != 0) {
            fun nearEven(f: Float) = 2 * (f / 2).roundToInt()
            if (abs(fdc - nearEven(fdc)) <= abs(fdr - nearEven(fdr))) dc = nearEven(fdc) else dr = nearEven(fdr)
        }
        return if (isValidPoint(dr, dc, rows, cols)) dr to dc else null
    }

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
     * Whether a new segment may join (r,c): it must not be blackened and must have fewer
     * than two segments. The web board only blocks blackened cells; on touch we also keep
     * the loop branch-free, as Yajilin does.
     */
    fun canDrawEdge(g: Grids, r: Int, c: Int): Boolean =
        g.blacks[r][c] != BLACK && degree(g, r, c) < 2

    /**
     * Live validation: a circle is in error once every cell it touches is decided (black,
     * or on the loop) and its comparison fails — the web board's red outline.
     */
    fun circleInError(circle: Circle, g: Grids): Boolean {
        var black = 0
        var white = 0
        for ((r, c) in touchedCells(circle)) {
            if (r !in g.blacks.indices || c !in g.blacks[r].indices) return false
            when {
                g.blacks[r][c] == BLACK -> black++
                degree(g, r, c) > 0 -> white++
                else -> return false
            }
        }
        return !circleSatisfied(circle.color, black, white)
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parseBoard(puzzle)
        val g = grids(board.rows, board.cols, userValues)
        fun grid(a: Array<IntArray>) = JsonArray(a.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(
            mapOf(
                "blacks" to grid(g.blacks),
                "edges" to JsonObject(mapOf("h" to grid(g.h), "v" to grid(g.v))),
            ),
        )
    }

    /**
     * Progress = cells that are blackened or touched by a segment, over all cells. Unlike
     * Yajilin, marks don't count (web progress/kuralin.ts counts only "b:" -> 1).
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        if (rows == 0 || cols == 0) return 0.0
        val g = grids(rows, cols, userValues)
        var resolved = 0
        for (r in 0 until rows) for (c in 0 until cols) {
            if (g.blacks[r][c] == BLACK || degree(g, r, c) > 0) resolved++
        }
        return resolved.toDouble() / (rows * cols) * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
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
     * True when the segments form one closed loop, every cell is exactly one of on-the-loop
     * or blackened, and every circle's comparison holds (port of KuralinBoard.tsx
     * validateSolution). Marks (2) are solver aids and count as unshaded.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        if (rows == 0 || cols == 0) return false
        val g = grids(rows, cols, userValues)

        var loopCells = 0
        var start: Pair<Int, Int>? = null
        for (r in 0 until rows) for (c in 0 until cols) {
            val d = degree(g, r, c)
            val onLoop = d > 0
            if (onLoop && d != 2) return false
            if (onLoop == (g.blacks[r][c] == BLACK)) return false
            if (onLoop) {
                loopCells++
                if (start == null) start = r to c
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

        for (circle in board.circles) {
            val touched = touchedCells(circle)
            if (touched.any { (r, c) -> r !in 0 until rows || c !in 0 until cols }) return false
            val black = touched.count { (r, c) -> g.blacks[r][c] == BLACK }
            if (!circleSatisfied(circle.color, black, touched.size - black)) return false
        }
        return true
    }
}
