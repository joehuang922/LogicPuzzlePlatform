package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlin.math.abs

/**
 * Minus Room (puzzle type 39). Ports frontend/src/components/minusRoomRules.ts and its
 * extractor (extractors/minusRoom.ts) and progress (progress/minusRoom.ts).
 *
 * canonRepr: { rows, cols, max, cells: rows x cols (0 = empty, 1..max given),
 *   edges: { h, v } room walls, circles: [{dr, dc, value}] } — circles in doubled
 *   coordinates, cell (r, c) at (2r, 2c), an edge with exactly one odd coordinate.
 *
 * answer: { numbers: rows x cols } — givens included, 0 = empty.
 *
 * userValues: "col,row" -> 1..max for each non-given cell, as Ripple Effect and the web
 * board.
 *
 * Rules: inside a room, adjacent equal numbers form blocks; a block of k has k cells and
 * a room has at most one block per number. A circle is its two cells' difference. Equal
 * numbers never form a 2x2 square.
 */
object MinusRoomEngine : PuzzleEngine {
    override val puzzleType: Int = 39

    data class Circle(val dr: Int, val dc: Int, val value: Int) {
        /** Its two cells (row, col), or null when it isn't on an edge. */
        fun cells(rows: Int, cols: Int): Pair<Pair<Int, Int>, Pair<Int, Int>>? {
            if ((dr + dc) % 2 != 1 || dr < 0 || dc < 0 || dr > 2 * (rows - 1) || dc > 2 * (cols - 1)) return null
            return (dr / 2 to dc / 2) to ((dr + 1) / 2 to (dc + 1) / 2)
        }
    }

    data class Board(
        val rows: Int,
        val cols: Int,
        val max: Int,
        val cells: List<List<Int>>,
        val h: List<List<Int>>,
        val v: List<List<Int>>,
        val circles: List<Circle>,
    ) {
        fun given(r: Int, c: Int): Int = cells.getOrNull(r)?.getOrNull(c) ?: 0

        fun wallBelow(r: Int, c: Int): Boolean = h.getOrNull(r)?.getOrNull(c) == 1

        fun wallRight(r: Int, c: Int): Boolean = v.getOrNull(r)?.getOrNull(c) == 1

        fun inside(r: Int, c: Int): Boolean = r in 0 until rows && c in 0 until cols
    }

    fun cellKey(col: Int, row: Int): String = "$col,$row"

    fun parseBoard(puzzle: Puzzle): Board = parseBoard(puzzle.canonRepr)

    fun parseBoard(canon: JsonObject): Board {
        fun int(name: String) = (canon[name] as? JsonPrimitive)?.intOrNull ?: 0
        fun grid(el: Any?) = (el as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList()
        } ?: emptyList()
        val edges = canon["edges"] as? JsonObject
        val circles = (canon["circles"] as? JsonArray)?.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            val dr = (o["dr"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val dc = (o["dc"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            val value = (o["value"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
            Circle(dr, dc, value)
        } ?: emptyList()
        return Board(
            rows = int("rows"),
            cols = int("cols"),
            max = int("max").takeIf { it >= 1 } ?: 4,
            cells = grid(canon["cells"]),
            h = grid(edges?.get("h")),
            v = grid(edges?.get("v")),
            circles = circles,
        )
    }

    /** Every cell's number: the given, else the player's value in 1..max, else 0. */
    fun grid(board: Board, userValues: Map<String, Int>): Array<IntArray> = Array(board.rows) { r ->
        IntArray(board.cols) { c ->
            val g = board.given(r, c)
            if (g > 0) g else (userValues[cellKey(c, r)] ?: 0).takeIf { it in 1..board.max } ?: 0
        }
    }

    fun roomIds(board: Board): Array<IntArray> {
        val ids = Array(board.rows) { IntArray(board.cols) { -1 } }
        var next = 0
        for (r in 0 until board.rows) for (c in 0 until board.cols) {
            if (ids[r][c] >= 0) continue
            ids[r][c] = next
            val stack = ArrayDeque(listOf(r to c))
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                fun go(nr: Int, nc: Int, open: Boolean) {
                    if (open && ids[nr][nc] < 0) {
                        ids[nr][nc] = next
                        stack.addLast(nr to nc)
                    }
                }
                if (cr > 0) go(cr - 1, cc, !board.wallBelow(cr - 1, cc))
                if (cr < board.rows - 1) go(cr + 1, cc, !board.wallBelow(cr, cc))
                if (cc > 0) go(cr, cc - 1, !board.wallRight(cr, cc - 1))
                if (cc < board.cols - 1) go(cr, cc + 1, !board.wallRight(cr, cc))
            }
            next++
        }
        return ids
    }

    /** A block: equal numbers joined inside one room; [open] when an empty room cell touches it. */
    data class Block(val num: Int, val room: Int, val cells: List<Pair<Int, Int>>, val open: Boolean)

    fun blocks(board: Board, grid: Array<IntArray>, rooms: Array<IntArray>): List<Block> {
        val seen = Array(board.rows) { BooleanArray(board.cols) }
        val out = mutableListOf<Block>()
        for (r in 0 until board.rows) for (c in 0 until board.cols) {
            val num = grid[r][c]
            if (num == 0 || seen[r][c]) continue
            val room = rooms[r][c]
            val cells = mutableListOf<Pair<Int, Int>>()
            var open = false
            val stack = ArrayDeque(listOf(r to c))
            seen[r][c] = true
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                cells.add(cr to cc)
                for ((nr, nc) in listOf(cr - 1 to cc, cr + 1 to cc, cr to cc - 1, cr to cc + 1)) {
                    if (!board.inside(nr, nc) || rooms[nr][nc] != room) continue
                    when {
                        grid[nr][nc] == 0 -> open = true
                        grid[nr][nc] == num && !seen[nr][nc] -> {
                            seen[nr][nc] = true
                            stack.addLast(nr to nc)
                        }
                    }
                }
            }
            out.add(Block(num, room, cells, open))
        }
        return out
    }

    /** Top-left corners of 2x2 squares of four equal numbers. */
    private fun squares(grid: Array<IntArray>): List<Pair<Int, Int>> = buildList {
        for (r in 0 until grid.size - 1) for (c in 0 until (grid[r].size - 1)) {
            val v = grid[r][c]
            if (v > 0 && grid[r][c + 1] == v && grid[r + 1][c] == v && grid[r + 1][c + 1] == v) add(r to c)
        }
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val g = grid(parseBoard(puzzle), userValues)
        return JsonObject(mapOf("numbers" to JsonArray(g.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val b = parseBoard(puzzle)
        val rows = answer["numbers"] as? JsonArray ?: return emptyMap()
        val out = mutableMapOf<String, Int>()
        for (r in 0 until b.rows) {
            val row = rows.getOrNull(r) as? JsonArray ?: continue
            for (c in 0 until b.cols) {
                val v = (row.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                if (v in 1..b.max && b.given(r, c) == 0) out[cellKey(c, r)] = v
            }
        }
        return out
    }

    /** (non-given cells holding a number / non-given cells) * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val b = parseBoard(puzzle)
        val g = grid(b, userValues)
        var open = 0
        var filled = 0
        for (r in 0 until b.rows) for (c in 0 until b.cols) {
            if (b.given(r, c) > 0) continue
            open++
            if (g[r][c] > 0) filled++
        }
        return if (open == 0) 100.0 else filled.toDouble() / open * 100.0
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val b = parseBoard(puzzle)
        if (b.rows < 1 || b.cols < 1) return false
        val g = grid(b, userValues)
        if (g.any { row -> row.any { it == 0 } }) return false
        val rooms = roomIds(b)
        val perRoom = mutableSetOf<Pair<Int, Int>>()
        for (block in blocks(b, g, rooms)) {
            if (block.cells.size != block.num) return false
            if (!perRoom.add(block.room to block.num)) return false
        }
        for (k in b.circles) {
            val (p, q) = k.cells(b.rows, b.cols) ?: return false
            if (abs(g[p.first][p.second] - g[q.first][q.second]) != k.value) return false
        }
        return squares(g).isEmpty()
    }

    /** Live-validation marks: cells ("r,c") and circle indices into [Board.circles]. */
    data class LiveErrors(val cells: Set<String>, val circles: Set<Int>)

    /** Port of minusRoomRules.liveErrors: only errors more numbers can't fix. */
    fun liveErrors(board: Board, userValues: Map<String, Int>): LiveErrors {
        val g = grid(board, userValues)
        val rooms = roomIds(board)
        val cells = mutableSetOf<String>()
        fun mark(list: List<Pair<Int, Int>>) = list.forEach { (r, c) -> cells.add("$r,$c") }
        val complete = mutableMapOf<Pair<Int, Int>, MutableList<Block>>()
        for (b in blocks(board, g, rooms)) {
            val size = b.cells.size
            if (size > b.num || (size < b.num && !b.open)) mark(b.cells)
            if (size == b.num) complete.getOrPut(b.room to b.num) { mutableListOf() }.add(b)
        }
        complete.values.filter { it.size > 1 }.forEach { list -> list.forEach { mark(it.cells) } }
        for ((r, c) in squares(g)) mark(listOf(r to c, r to c + 1, r + 1 to c, r + 1 to c + 1))
        val circles = mutableSetOf<Int>()
        board.circles.forEachIndexed { i, k ->
            val (p, q) = k.cells(board.rows, board.cols) ?: return@forEachIndexed
            val a = g[p.first][p.second]
            val b = g[q.first][q.second]
            if (a > 0 && b > 0 && abs(a - b) != k.value) circles.add(i)
        }
        return LiveErrors(cells, circles)
    }
}
