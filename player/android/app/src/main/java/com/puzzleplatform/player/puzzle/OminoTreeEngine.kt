package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Omino Tree (puzzle type 38). Ports frontend/src/components/ominoTreeRules.ts and its
 * extractor (extractors/ominoTree.ts) and progress (progress/ominoTree.ts).
 *
 * canonRepr: { rows, cols, numbers: rows x cols (0 = none), arrows: [{r, c, dir}] } — an
 *   arrow points from its start cell (r, c) into the neighbour in dir (up/down/left/right).
 *
 * answer: { grids: { h, v } } — h[r][c] = 1 is a wall between (r, c) and (r + 1, c),
 *   v[r][c] = 1 between (r, c) and (r, c + 1).
 *
 * userValues: "h:r,c" / "v:r,c" -> 1 per wall, matching the web board exactly.
 *
 * Blocks are the components of cells joined across edges without a wall. A block is valid
 * when every number in it equals its size, it holds an arrow start or end, and every arrow
 * touching it crosses into another block whose shape is this one's (same orientation,
 * translated) plus one cell.
 */
object OminoTreeEngine : PuzzleEngine {
    override val puzzleType: Int = 38

    data class Arrow(val r: Int, val c: Int, val dir: String) {
        val end: Pair<Int, Int>
            get() {
                val (dr, dc) = STEP[dir] ?: (0 to 0)
                return (r + dr) to (c + dc)
            }

        /** The wall key of the edge it sits on. */
        val edgeKey: String
            get() {
                val (r2, c2) = end
                return if (dir == "up" || dir == "down") hKey(minOf(r, r2), c) else vKey(r, minOf(c, c2))
            }
    }

    data class Board(val rows: Int, val cols: Int, val numbers: List<List<Int>>, val arrows: List<Arrow>) {
        fun number(r: Int, c: Int): Int = numbers.getOrNull(r)?.getOrNull(c) ?: 0

        fun inside(r: Int, c: Int): Boolean = r in 0 until rows && c in 0 until cols

        /** Arrows whose start and end are both on the board. */
        val validArrows: List<Arrow>
            get() = arrows.filter { a -> inside(a.r, a.c) && a.end.let { (r, c) -> inside(r, c) } }
    }

    val STEP: Map<String, Pair<Int, Int>> = mapOf("up" to (-1 to 0), "down" to (1 to 0), "left" to (0 to -1), "right" to (0 to 1))

    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    fun parseBoard(puzzle: Puzzle): Board = parseBoard(puzzle.canonRepr)

    fun parseBoard(canon: JsonObject): Board {
        val rows = (canon["rows"] as? JsonPrimitive)?.intOrNull ?: 0
        val cols = (canon["cols"] as? JsonPrimitive)?.intOrNull ?: 0
        val numbers = (canon["numbers"] as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList()
        } ?: emptyList()
        val arrows = (canon["arrows"] as? JsonArray)?.mapNotNull { a ->
            val o = a as? JsonObject ?: return@mapNotNull null
            val r = (o["r"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val c = (o["c"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val dir = (o["dir"] as? JsonPrimitive)?.contentOrNull?.takeIf { it in STEP } ?: return@mapNotNull null
            Arrow(r, c, dir)
        } ?: emptyList()
        return Board(rows, cols, numbers, arrows)
    }

    class Walls(val h: Array<IntArray>, val v: Array<IntArray>)

    fun walls(rows: Int, cols: Int, userValues: Map<String, Int>): Walls {
        val h = Array(maxOf(rows - 1, 0)) { IntArray(cols) }
        val v = Array(rows) { IntArray(maxOf(cols - 1, 0)) }
        for ((key, value) in userValues) {
            if (value != 1) continue
            val m = KEY.matchEntire(key) ?: continue
            val r = m.groupValues[2].toInt()
            val c = m.groupValues[3].toInt()
            if (m.groupValues[1] == "h" && r < rows - 1 && c < cols) h[r][c] = 1
            if (m.groupValues[1] == "v" && r < rows && c < cols - 1) v[r][c] = 1
        }
        return Walls(h, v)
    }

    private val KEY = Regex("""([hv]):(\d+),(\d+)""")

    /** Block ids per cell and the cells of each block. */
    class Blocks(val ids: Array<IntArray>, val cells: List<List<Pair<Int, Int>>>)

    fun computeBlocks(rows: Int, cols: Int, w: Walls): Blocks {
        val ids = Array(rows) { IntArray(cols) { -1 } }
        val cells = mutableListOf<List<Pair<Int, Int>>>()
        for (r in 0 until rows) for (c in 0 until cols) {
            if (ids[r][c] >= 0) continue
            val id = cells.size
            val block = mutableListOf<Pair<Int, Int>>()
            val stack = ArrayDeque(listOf(r to c))
            ids[r][c] = id
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                block.add(cr to cc)
                fun go(nr: Int, nc: Int, open: Boolean) {
                    if (open && ids[nr][nc] < 0) {
                        ids[nr][nc] = id
                        stack.addLast(nr to nc)
                    }
                }
                if (cr > 0) go(cr - 1, cc, w.h[cr - 1][cc] != 1)
                if (cr < rows - 1) go(cr + 1, cc, w.h[cr][cc] != 1)
                if (cc > 0) go(cr, cc - 1, w.v[cr][cc - 1] != 1)
                if (cc < cols - 1) go(cr, cc + 1, w.v[cr][cc] != 1)
            }
            cells.add(block)
        }
        return Blocks(ids, cells)
    }

    private fun shapeKey(cells: List<Pair<Int, Int>>): List<Pair<Int, Int>> {
        val minR = cells.minOf { it.first }
        val minC = cells.minOf { it.second }
        return cells.map { (r, c) -> (r - minR) to (c - minC) }.sortedWith(compareBy({ it.first }, { it.second }))
    }

    /** Whether [end] is [start] in the same orientation (translated) plus one cell. */
    fun grows(start: List<Pair<Int, Int>>, end: List<Pair<Int, Int>>): Boolean {
        if (end.size != start.size + 1) return false
        val want = shapeKey(start)
        return end.indices.any { i -> shapeKey(end.filterIndexed { j, _ -> j != i }) == want }
    }

    private fun holds(a: Arrow, blocks: Blocks): Boolean {
        val (er, ec) = a.end
        val s = blocks.ids[a.r][a.c]
        val e = blocks.ids[er][ec]
        return s != e && grows(blocks.cells[s], blocks.cells[e])
    }

    fun validBlockIds(board: Board, blocks: Blocks): Set<Int> {
        val n = blocks.cells.size
        val ok = BooleanArray(n) { true }
        val touched = BooleanArray(n)
        blocks.cells.forEachIndexed { id, cells ->
            for ((r, c) in cells) {
                val num = board.number(r, c)
                if (num > 0 && num != cells.size) ok[id] = false
            }
        }
        for (a in board.validArrows) {
            val (er, ec) = a.end
            val s = blocks.ids[a.r][a.c]
            val e = blocks.ids[er][ec]
            touched[s] = true
            touched[e] = true
            if (!holds(a, blocks)) {
                ok[s] = false
                ok[e] = false
            }
        }
        return (0 until n).filterTo(HashSet()) { ok[it] && touched[it] }
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val b = parseBoard(puzzle)
        val w = walls(b.rows, b.cols, userValues)
        fun grid(rows: Array<IntArray>) = JsonArray(rows.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(mapOf("grids" to JsonObject(mapOf("h" to grid(w.h), "v" to grid(w.v)))))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val b = parseBoard(puzzle)
        val grids = answer["grids"] as? JsonObject ?: return emptyMap()
        val out = mutableMapOf<String, Int>()
        fun read(name: String, rows: Int, cols: Int, key: (Int, Int) -> String) {
            val arr = grids[name] as? JsonArray ?: return
            for (r in 0 until rows) {
                val row = arr.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) if ((row.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) out[key(r, c)] = 1
            }
        }
        read("h", b.rows - 1, b.cols, ::hKey)
        read("v", b.rows, b.cols - 1, ::vKey)
        return out
    }

    /** (cells in valid blocks / all cells) * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val b = parseBoard(puzzle)
        val total = b.rows * b.cols
        if (total == 0) return 0.0
        val blocks = computeBlocks(b.rows, b.cols, walls(b.rows, b.cols, userValues))
        val counted = validBlockIds(b, blocks).sumOf { blocks.cells[it].size }
        return counted.toDouble() / total * 100.0
    }

    /** Every block valid and every wall between two different blocks. */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val b = parseBoard(puzzle)
        if (b.rows < 1 || b.cols < 1) return false
        val w = walls(b.rows, b.cols, userValues)
        val blocks = computeBlocks(b.rows, b.cols, w)
        if (validBlockIds(b, blocks).size != blocks.cells.size) return false
        for (r in w.h.indices) for (c in w.h[r].indices) if (w.h[r][c] == 1 && blocks.ids[r][c] == blocks.ids[r + 1][c]) return false
        for (r in w.v.indices) for (c in w.v[r].indices) if (w.v[r][c] == 1 && blocks.ids[r][c] == blocks.ids[r][c + 1]) return false
        return true
    }

    /** Live-validation marks: numbers ("r,c") and arrow indices into [Board.arrows]. */
    data class LiveErrors(val numbers: Set<String>, val arrows: Set<Int>)

    /**
     * Errors more walls can't fix (port of ominoTreeRules.liveErrors): a number whose block
     * is already smaller than it; an arrow between two complete blocks (each with a number,
     * every number equal to its size) whose end isn't the start plus one cell.
     */
    fun liveErrors(board: Board, userValues: Map<String, Int>): LiveErrors {
        val blocks = computeBlocks(board.rows, board.cols, walls(board.rows, board.cols, userValues))
        val numbers = mutableSetOf<String>()
        val complete = blocks.cells.map { cells ->
            var hasNumber = false
            var allMatch = true
            for ((r, c) in cells) {
                val num = board.number(r, c)
                if (num == 0) continue
                hasNumber = true
                if (num != cells.size) allMatch = false
                if (cells.size < num) numbers.add("$r,$c")
            }
            hasNumber && allMatch
        }
        val arrows = mutableSetOf<Int>()
        board.arrows.forEachIndexed { i, a ->
            val (er, ec) = a.end
            if (!board.inside(a.r, a.c) || !board.inside(er, ec)) return@forEachIndexed
            val s = blocks.ids[a.r][a.c]
            val e = blocks.ids[er][ec]
            if (s != e && complete[s] && complete[e] && !grows(blocks.cells[s], blocks.cells[e])) arrows.add(i)
        }
        return LiveErrors(numbers, arrows)
    }
}
