package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * Picturesque Maze (浮き出しメイロ, puzzle type 44). Ports:
 *  - answer extraction from frontend/src/extractors/picturesqueMaze.ts
 *  - progress from frontend/src/progress/picturesqueMaze.ts
 *  - completion, solving, format problems and warnings from
 *    frontend/src/components/picturesqueMazeRules.ts
 *
 * canonRepr: { width, height, walls: { h, v }, entrance: {side, index}, exit: {side, index} }
 *   walls.h is (height-1) x width (1 = wall between (r,c) and (r+1,c)); walls.v is
 *   height x (width-1) (1 = wall between (r,c) and (r,c+1)). The outer border is a wall
 *   except at the two openings.
 *
 * answer: { edges: { h, v } } — the drawn path as segments between cell centres, as Picto
 *   Link: h is height x (width-1), v is (height-1) x width.
 *
 * User values are the web board's: "h:r,c" / "v:r,c" -> 1 for a path segment. The path
 * always starts at the entrance cell and is walked along the segments.
 */
object PicturesqueMazeEngine : PuzzleEngine {
    override val puzzleType: Int = 44

    data class Opening(val side: String, val index: Int)

    data class Board(
        val rows: Int,
        val cols: Int,
        // (rows - 1) x cols and rows x (cols - 1); 1 = wall
        val wallsH: List<List<Int>>,
        val wallsV: List<List<Int>>,
        val entrance: Opening,
        val exit: Opening,
    )

    /** A cell as (row, col). */
    data class Solution(val route: List<Pair<Int, Int>>?, val unique: Boolean)

    data class Warnings(val loopCells: List<Pair<Int, Int>>, val unreachable: List<Pair<Int, Int>>)

    val SIDES = listOf("top", "bottom", "left", "right")

    fun parseBoard(puzzle: Puzzle): Board = parseBoard(puzzle.canonRepr)

    fun parseBoard(canon: JsonObject): Board {
        val cols = ((canon["width"] as? JsonPrimitive)?.intOrNull ?: 0).coerceAtLeast(0)
        val rows = ((canon["height"] as? JsonPrimitive)?.intOrNull ?: 0).coerceAtLeast(0)
        val walls = canon["walls"] as? JsonObject
        fun grid(key: String, h: Int, w: Int): List<List<Int>> {
            val arr = walls?.get(key) as? JsonArray
            return List(h) { r ->
                val row = arr?.getOrNull(r) as? JsonArray
                List(w) { c -> if ((row?.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) 1 else 0 }
            }
        }
        fun opening(key: String, fallback: Opening): Opening {
            val obj = canon[key] as? JsonObject ?: return fallback
            val side = (obj["side"] as? JsonPrimitive)?.contentOrNull?.takeIf { it in SIDES } ?: return fallback
            val index = (obj["index"] as? JsonPrimitive)?.intOrNull ?: return fallback
            return Opening(side, index)
        }
        return Board(
            rows = rows,
            cols = cols,
            wallsH = grid("h", (rows - 1).coerceAtLeast(0), cols),
            wallsV = grid("v", rows, (cols - 1).coerceAtLeast(0)),
            entrance = opening("entrance", Opening("top", 0)),
            exit = opening("exit", Opening("bottom", (cols - 1).coerceAtLeast(0))),
        )
    }

    /** The border cell an opening opens, or null when its index is off the board. */
    fun openingCell(o: Opening, rows: Int, cols: Int): Pair<Int, Int>? {
        val limit = if (o.side == "top" || o.side == "bottom") cols else rows
        if (o.index !in 0 until limit) return null
        return when (o.side) {
            "top" -> 0 to o.index
            "bottom" -> rows - 1 to o.index
            "left" -> o.index to 0
            else -> o.index to cols - 1
        }
    }

    /** Orthogonal neighbours with no wall between them. */
    fun isOpen(board: Board, r1: Int, c1: Int, r2: Int, c2: Int): Boolean {
        if (r1 !in 0 until board.rows || r2 !in 0 until board.rows) return false
        if (c1 !in 0 until board.cols || c2 !in 0 until board.cols) return false
        if (r1 == r2 && kotlin.math.abs(c1 - c2) == 1) return board.wallsV[r1][minOf(c1, c2)] == 0
        if (c1 == c2 && kotlin.math.abs(r1 - r2) == 1) return board.wallsH[minOf(r1, r2)][c1] == 0
        return false
    }

    private val STEPS = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)

    fun openNeighbours(board: Board, r: Int, c: Int): List<Pair<Int, Int>> =
        STEPS.mapNotNull { (dr, dc) -> if (isOpen(board, r, c, r + dr, c + dc)) (r + dr) to (c + dc) else null }

    private class Bfs(val dist: IntArray, val ways: IntArray, val parent: IntArray)

    private fun bfs(board: Board, start: Pair<Int, Int>): Bfs {
        val n = board.rows * board.cols
        val dist = IntArray(n) { -1 }
        val ways = IntArray(n)
        val parent = IntArray(n) { -1 }
        val s = start.first * board.cols + start.second
        dist[s] = 0
        ways[s] = 1
        val queue = ArrayDeque<Int>()
        queue.add(s)
        while (queue.isNotEmpty()) {
            val cur = queue.removeFirst()
            for ((nr, nc) in openNeighbours(board, cur / board.cols, cur % board.cols)) {
                val nb = nr * board.cols + nc
                if (dist[nb] < 0) {
                    dist[nb] = dist[cur] + 1
                    parent[nb] = cur
                    queue.add(nb)
                }
                if (dist[nb] == dist[cur] + 1) ways[nb] = minOf(2, ways[nb] + ways[cur])
            }
        }
        return Bfs(dist, ways, parent)
    }

    private fun wallShapeOk(board: Board): Boolean =
        board.wallsH.size == board.rows - 1 && board.wallsH.all { it.size == board.cols } &&
            board.wallsV.size == board.rows && board.wallsV.all { it.size == board.cols - 1 }

    /** The shortest entrance-to-exit route (cells in order) and whether it is unique. */
    fun solve(board: Board): Solution {
        if (board.rows < 1 || board.cols < 1 || !wallShapeOk(board)) return Solution(null, false)
        val start = openingCell(board.entrance, board.rows, board.cols) ?: return Solution(null, false)
        val goal = openingCell(board.exit, board.rows, board.cols) ?: return Solution(null, false)
        val b = bfs(board, start)
        val g = goal.first * board.cols + goal.second
        if (b.dist[g] < 0) return Solution(null, false)
        val route = mutableListOf<Pair<Int, Int>>()
        var cur = g
        while (cur >= 0) {
            route.add(cur / board.cols to cur % board.cols)
            cur = b.parent[cur]
        }
        route.reverse()
        return Solution(route, b.ways[g] == 1)
    }

    /** Cells on some but not all shortest routes (where tied routes part ways). */
    fun tiedRouteCells(board: Board): List<Pair<Int, Int>> {
        if (!wallShapeOk(board)) return emptyList()
        val start = openingCell(board.entrance, board.rows, board.cols) ?: return emptyList()
        val goal = openingCell(board.exit, board.rows, board.cols) ?: return emptyList()
        val a = bfs(board, start).dist
        val b = bfs(board, goal).dist
        val total = a[goal.first * board.cols + goal.second]
        if (total < 0) return emptyList()
        val layers = mutableMapOf<Int, MutableList<Int>>()
        for (i in a.indices) {
            if (a[i] >= 0 && b[i] >= 0 && a[i] + b[i] == total) layers.getOrPut(a[i]) { mutableListOf() }.add(i)
        }
        return layers.values.filter { it.size > 1 }.flatten().map { it / board.cols to it % board.cols }
    }

    /** Problems the API rejects too (port of picturesqueMazeFormatProblems). */
    fun formatProblems(board: Board): List<String> {
        if (!wallShapeOk(board)) return listOf("Wall arrays don't match a ${board.cols} x ${board.rows} grid")
        val problems = mutableListOf<String>()
        val s = openingCell(board.entrance, board.rows, board.cols)
        val g = openingCell(board.exit, board.rows, board.cols)
        if (s == null) problems += "Entrance (${board.entrance.side} ${board.entrance.index}) is off the board"
        if (g == null) problems += "Exit (${board.exit.side} ${board.exit.index}) is off the board"
        if (s == null || g == null) return problems
        if (board.entrance == board.exit) return listOf("Entrance and exit are the same opening")
        val (route, unique) = solve(board)
        if (route == null) problems += "No route from the entrance to the exit"
        else if (!unique) problems += "The shortest route is not unique"
        return problems
    }

    /** Misread warnings: loops and sealed-off cells (legal, usually a misread wall). */
    fun warnings(board: Board): Warnings {
        if (!wallShapeOk(board) || board.rows < 1 || board.cols < 1) return Warnings(emptyList(), emptyList())
        val n = board.rows * board.cols
        val degree = IntArray(n) { openNeighbours(board, it / board.cols, it % board.cols).size }
        val removed = BooleanArray(n)
        val stack = ArrayDeque<Int>()
        for (i in 0 until n) if (degree[i] <= 1) stack.add(i)
        while (stack.isNotEmpty()) {
            val i = stack.removeLast()
            if (removed[i]) continue
            removed[i] = true
            for ((nr, nc) in openNeighbours(board, i / board.cols, i % board.cols)) {
                val j = nr * board.cols + nc
                if (removed[j]) continue
                degree[j]--
                if (degree[j] <= 1) stack.add(j)
            }
        }
        val loops = (0 until n).filter { !removed[it] }.map { it / board.cols to it % board.cols }
        val start = openingCell(board.entrance, board.rows, board.cols)
        val unreachable = if (start == null) {
            emptyList()
        } else {
            val dist = bfs(board, start).dist
            (0 until n).filter { dist[it] < 0 }.map { it / board.cols to it % board.cols }
        }
        return Warnings(loops, unreachable)
    }

    fun warningMessages(w: Warnings): List<String> = buildList {
        if (w.loopCells.isNotEmpty()) {
            add("Not a perfect maze: ${w.loopCells.size} cells sit on loops (a wall may be missing)")
        }
        if (w.unreachable.isNotEmpty()) {
            add("Not a perfect maze: ${w.unreachable.size} cells can't be reached (a wall may be extra)")
        }
    }

    // ---- Player path ------------------------------------------------------------

    private fun edgeKey(r1: Int, c1: Int, r2: Int, c2: Int): String =
        if (r1 == r2) "h:$r1,${minOf(c1, c2)}" else "v:${minOf(r1, r2)},$c1"

    /** The path walked from the entrance cell along the segments in [userValues]. */
    fun path(board: Board, userValues: Map<String, Int>): List<Pair<Int, Int>> {
        val start = openingCell(board.entrance, board.rows, board.cols) ?: return emptyList()
        val path = mutableListOf(start)
        val seen = mutableSetOf(start)
        var cur = start
        while (true) {
            val next = STEPS.mapNotNull { (dr, dc) ->
                val nr = cur.first + dr
                val nc = cur.second + dc
                if (nr !in 0 until board.rows || nc !in 0 until board.cols) return@mapNotNull null
                val cell = nr to nc
                if (userValues[edgeKey(cur.first, cur.second, nr, nc)] == 1 && cell !in seen) cell else null
            }
            if (next.size != 1) break
            cur = next[0]
            seen += cur
            path += cur
        }
        return path
    }

    /** User values ("h:r,c"/"v:r,c" -> 1) for an ordered path. */
    fun valuesForPath(path: List<Pair<Int, Int>>): Map<String, Int> =
        path.zipWithNext().associate { (a, b) -> edgeKey(a.first, a.second, b.first, b.second) to 1 }

    /** The changes (0 = drop) that turn [userValues] into exactly [path]'s segments. */
    fun changesTo(userValues: Map<String, Int>, path: List<Pair<Int, Int>>): Map<String, Int> {
        val target = valuesForPath(path)
        val changes = mutableMapOf<String, Int>()
        for ((k, v) in userValues) if (isSegmentKey(k) && v != 0 && k !in target) changes[k] = 0
        for (k in target.keys) if (userValues[k] != 1) changes[k] = 1
        return changes
    }

    private fun isSegmentKey(key: String) = key.startsWith("h:") || key.startsWith("v:")

    private fun segmentCount(userValues: Map<String, Int>) = userValues.count { (k, v) -> isSegmentKey(k) && v == 1 }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        val route = solve(board).route ?: return false
        val path = path(board, userValues)
        return path == route && segmentCount(userValues) == route.size - 1
    }

    /** Path cells / route cells, capped at 99 until solved. Mirrors progress/picturesqueMaze.ts. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        if (isComplete(puzzle, userValues)) return 100.0
        val board = parseBoard(puzzle)
        val route = solve(board).route ?: return 0.0
        if (segmentCount(userValues) == 0) return 0.0
        val cells = path(board, userValues).size
        return minOf(99.0, (cells.toDouble() / route.size * 100.0).roundToInt().toDouble())
    }

    /** The path's end is stuck: a non-exit cell whose only open side is the way in. */
    fun endsInDeadEnd(board: Board, path: List<Pair<Int, Int>>): Boolean {
        if (path.size < 2) return false
        val end = path.last()
        if (end == openingCell(board.exit, board.rows, board.cols)) return false
        return openNeighbours(board, end.first, end.second).size <= 1
    }

    /**
     * The next step of a drag from [last] toward the pointer at fractional (row, col): the
     * open neighbour best matching the pointer's direction, or null. A wall never sends the
     * path sideways: a neighbour more than ~60 degrees off is refused. Port of stepToward.
     */
    fun stepToward(board: Board, last: Pair<Int, Int>, row: Float, col: Float): Pair<Int, Int>? {
        val dy = row - (last.first + 0.5f)
        val dx = col - (last.second + 0.5f)
        val len = hypot(dx, dy)
        if (len < 0.5f) return null
        var best: Pair<Int, Int>? = null
        var bestDot = 0.5f
        for ((dr, dc) in STEPS) {
            val dot = (dr * dy + dc * dx) / len
            if (dot > bestDot && isOpen(board, last.first, last.second, last.first + dr, last.second + dc)) {
                best = (last.first + dr) to (last.second + dc)
                bestDot = dot
            }
        }
        return best
    }

    /**
     * Walk the path's end toward the pointer at fractional (row, col), one open step at a
     * time: stepping back onto the previous cell retracts, a cell already on the path
     * stops the walk. Same loop as the web board's pointer move.
     */
    fun walkToward(board: Board, path: List<Pair<Int, Int>>, row: Float, col: Float): List<Pair<Int, Int>> {
        val target = kotlin.math.floor(row).toInt() to kotlin.math.floor(col).toInt()
        var next = path
        repeat(64) {
            val end = next.lastOrNull() ?: return next
            if (end == target) return next
            val step = stepToward(board, end, row, col) ?: return next
            if (next.size >= 2 && next[next.size - 2] == step) {
                next = next.dropLast(1)
            } else if (step in next) {
                return next
            } else {
                next = next + step
            }
        }
        return next
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parseBoard(puzzle)
        fun grid(prefix: String, h: Int, w: Int) = JsonArray(List(h) { r ->
            JsonArray(List(w) { c -> JsonPrimitive(if (userValues["$prefix:$r,$c"] == 1) 1 else 0) })
        })
        val edges = JsonObject(
            mapOf(
                "h" to grid("h", board.rows, (board.cols - 1).coerceAtLeast(0)),
                "v" to grid("v", (board.rows - 1).coerceAtLeast(0), board.cols),
            ),
        )
        return JsonObject(mapOf("edges" to edges))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val edges = answer["edges"] as? JsonObject ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        for (prefix in listOf("h", "v")) {
            val arr = edges[prefix] as? JsonArray ?: continue
            arr.forEachIndexed { r, rowEl ->
                (rowEl as? JsonArray)?.forEachIndexed { c, v ->
                    if ((v as? JsonPrimitive)?.intOrNull == 1) result["$prefix:$r,$c"] = 1
                }
            }
        }
        return result
    }

    /** Opaque black for a picture cell. */
    const val FILL_ARGB: Int = 0xFF000000.toInt()

    /** Light-grey ground of the live preview, as the other picture puzzles'. */
    const val GROUND_ARGB: Int = 0xFFD9D9D9.toInt()

    /** White ground of the solved thumbnail. */
    const val PAPER_ARGB: Int = 0xFFFFFFFF.toInt()

    /** Row-major packed-ARGB picture of [cells] on [ground]. */
    fun pictureCells(board: Board, cells: List<Pair<Int, Int>>, ground: Int): IntArray {
        val out = IntArray(board.rows * board.cols) { ground }
        for ((r, c) in cells) if (r in 0 until board.rows && c in 0 until board.cols) out[r * board.cols + c] = FILL_ARGB
        return out
    }

    override fun renderThumbnail(puzzle: Puzzle, answer: JsonObject): PuzzleThumbnail? {
        val board = parseBoard(puzzle)
        if (board.rows == 0 || board.cols == 0) return null
        val path = path(board, restoreUserValues(puzzle, answer))
        return PuzzleThumbnail(board.cols, board.rows, pictureCells(board, path, PAPER_ARGB))
    }
}
