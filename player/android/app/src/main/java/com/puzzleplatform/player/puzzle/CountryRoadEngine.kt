package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Country Road (puzzle type 41). Ports frontend/src/components/countryRoadRules.ts, the
 * extractor (frontend/src/extractors/countryRoad.ts) and progress
 * (frontend/src/progress/countryRoad.ts).
 *
 * canonRepr: { cells, grids: { h, v } }: cells rows x cols (0 = no number, N = the room's
 * number), walls h (rows-1) x cols / v rows x (cols-1).
 *
 * userValues: "h:r,c" / "v:r,c" = 1 for a loop segment between (r, c) and its right /
 * lower neighbour; "m:r,c" = 1 × (the loop skips the cell) / 2 • (the loop uses it). The
 * marks ride the shared shade/mark tap cycle ([cellKey]): × is its "shaded" state.
 *
 * answer: { edges: { h, v }, marks } (full grids, like the web extractor).
 */
object CountryRoadEngine : ShadeMarkEngine {
    override val puzzleType: Int = 41

    const val CROSS = ShadeCycle.SHADED
    const val DOT = ShadeCycle.MARKED

    override fun cellKey(col: Int, row: Int): String = "m:$row,$col"

    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    data class Board(val cells: List<List<Int>>, val h: List<List<Int>>, val v: List<List<Int>>) {
        val rows: Int get() = cells.size
        val cols: Int get() = cells.firstOrNull()?.size ?: 0

        fun wallBelow(r: Int, c: Int): Boolean = h.getOrNull(r)?.getOrNull(c) == 1

        fun wallRight(r: Int, c: Int): Boolean = v.getOrNull(r)?.getOrNull(c) == 1

        fun number(r: Int, c: Int): Int = cells.getOrNull(r)?.getOrNull(c) ?: 0
    }

    /** The loop: h rows x (cols-1), v (rows-1) x cols, 1 = segment. */
    class Loop(val h: Array<IntArray>, val v: Array<IntArray>)

    fun parseBoard(puzzle: Puzzle): Board = boardFromCanon(puzzle.canonRepr)

    fun boardFromCanon(canon: JsonObject): Board {
        val grids = canon["grids"] as? JsonObject
        return Board(intGrid(canon["cells"]), intGrid(grids?.get("h")), intGrid(grids?.get("v")))
    }

    fun canonOf(board: Board): JsonObject {
        fun grid(g: List<List<Int>>) = JsonArray(g.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(
            mapOf(
                "cells" to grid(board.cells),
                "grids" to JsonObject(mapOf("h" to grid(board.h), "v" to grid(board.v))),
            )
        )
    }

    private fun intGrid(el: JsonElement?): List<List<Int>> =
        (el as? JsonArray)?.map { row -> (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList() }
            ?: emptyList()

    /** Room id per cell and the room count. */
    fun rooms(board: Board): Pair<Array<IntArray>, Int> {
        val rows = board.rows
        val cols = board.cols
        val ids = Array(rows) { IntArray(cols) { -1 } }
        var count = 0
        for (r in 0 until rows) for (c in 0 until cols) {
            if (ids[r][c] >= 0) continue
            ids[r][c] = count
            val stack = ArrayDeque<Pair<Int, Int>>()
            stack.addLast(r to c)
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                val next = listOf(
                    Triple(cr - 1, cc, cr > 0 && !board.wallBelow(cr - 1, cc)),
                    Triple(cr + 1, cc, cr < rows - 1 && !board.wallBelow(cr, cc)),
                    Triple(cr, cc - 1, cc > 0 && !board.wallRight(cr, cc - 1)),
                    Triple(cr, cc + 1, cc < cols - 1 && !board.wallRight(cr, cc)),
                )
                for ((nr, nc, open) in next) {
                    if (open && ids[nr][nc] < 0) {
                        ids[nr][nc] = count
                        stack.addLast(nr to nc)
                    }
                }
            }
            count++
        }
        return ids to count
    }

    fun loop(rows: Int, cols: Int, userValues: Map<String, Int>): Loop = Loop(
        Array(rows) { r -> IntArray(maxOf(cols - 1, 0)) { c -> if (userValues[hKey(r, c)] == 1) 1 else 0 } },
        Array(maxOf(rows - 1, 0)) { r -> IntArray(cols) { c -> if (userValues[vKey(r, c)] == 1) 1 else 0 } },
    )

    fun marks(rows: Int, cols: Int, userValues: Map<String, Int>): Array<IntArray> =
        Array(rows) { r ->
            IntArray(cols) { c ->
                when (val m = userValues[cellKey(c, r)]) {
                    CROSS, DOT -> m
                    else -> 0
                }
            }
        }

    fun degrees(rows: Int, cols: Int, loop: Loop): Array<IntArray> {
        val deg = Array(rows) { IntArray(cols) }
        for (r in 0 until rows) for (c in 0 until cols - 1) if (loop.h[r][c] == 1) { deg[r][c]++; deg[r][c + 1]++ }
        for (r in 0 until rows - 1) for (c in 0 until cols) if (loop.v[r][c] == 1) { deg[r][c]++; deg[r + 1][c]++ }
        return deg
    }

    /** Per room: loop cells, wall crossings, closed (passed through), and its number with position. */
    private class RoomState(n: Int) {
        val loopCells = IntArray(n)
        val crossings = IntArray(n)
        val closed = BooleanArray(n) { true }
        val number = arrayOfNulls<Int>(n)
        val numberAt = arrayOfNulls<Pair<Int, Int>>(n)
    }

    private fun roomState(board: Board, loop: Loop): RoomState {
        val rows = board.rows
        val cols = board.cols
        val (ids, count) = rooms(board)
        val deg = degrees(rows, cols, loop)
        val s = RoomState(count)
        for (r in 0 until rows) for (c in 0 until cols) {
            val id = ids[r][c]
            if (deg[r][c] > 0) s.loopCells[id]++
            if (deg[r][c] == 1) s.closed[id] = false
            if (board.number(r, c) > 0 && s.number[id] == null) {
                s.number[id] = board.number(r, c)
                s.numberAt[id] = r to c
            }
            if (c < cols - 1 && loop.h[r][c] == 1 && ids[r][c + 1] != id) { s.crossings[id]++; s.crossings[ids[r][c + 1]]++ }
            if (r < rows - 1 && loop.v[r][c] == 1 && ids[r + 1][c] != id) { s.crossings[id]++; s.crossings[ids[r + 1][c]]++ }
        }
        for (id in 0 until count) if (s.crossings[id] != 2) s.closed[id] = false
        return s
    }

    /** Exactly one closed loop: every used cell has two segments, all in one piece. */
    fun isSingleLoop(rows: Int, cols: Int, loop: Loop): Boolean {
        val deg = degrees(rows, cols, loop)
        var start: Pair<Int, Int>? = null
        var used = 0
        for (r in 0 until rows) for (c in 0 until cols) {
            if (deg[r][c] == 0) continue
            if (deg[r][c] != 2) return false
            used++
            if (start == null) start = r to c
        }
        val first = start ?: return false
        val seen = Array(rows) { BooleanArray(cols) }
        val stack = ArrayDeque<Pair<Int, Int>>()
        stack.addLast(first)
        seen[first.first][first.second] = true
        var reached = 0
        while (stack.isNotEmpty()) {
            val (r, c) = stack.removeLast()
            reached++
            val next = listOf(
                Triple(r, c + 1, c < cols - 1 && loop.h[r][c] == 1),
                Triple(r, c - 1, c > 0 && loop.h[r][c - 1] == 1),
                Triple(r + 1, c, r < rows - 1 && loop.v[r][c] == 1),
                Triple(r - 1, c, r > 0 && loop.v[r - 1][c] == 1),
            )
            for ((nr, nc, on) in next) if (on && !seen[nr][nc]) { seen[nr][nc] = true; stack.addLast(nr to nc) }
        }
        return reached == used
    }

    /** Pairs of cells [unused] says are unused touching across a wall. */
    private fun unusedAcrossWalls(board: Board, unused: (Int, Int) -> Boolean): List<Pair<Pair<Int, Int>, Pair<Int, Int>>> =
        buildList {
            for (r in 0 until board.rows) for (c in 0 until board.cols) {
                if (!unused(r, c)) continue
                if (r < board.rows - 1 && board.wallBelow(r, c) && unused(r + 1, c)) add((r to c) to (r + 1 to c))
                if (c < board.cols - 1 && board.wallRight(r, c) && unused(r, c + 1)) add((r to c) to (r to c + 1))
            }
        }

    /** The four rules (web: validateCountryRoad). */
    fun solved(board: Board, loop: Loop): Boolean {
        val rows = board.rows
        val cols = board.cols
        if (rows == 0 || cols == 0 || !isSingleLoop(rows, cols, loop)) return false
        val s = roomState(board, loop)
        val n = s.loopCells.size
        for (id in 0 until n) {
            if (s.loopCells[id] == 0) return false
            if (n > 1 && s.crossings[id] != 2) return false
            val num = s.number[id]
            if (num != null && s.loopCells[id] != num) return false
        }
        val deg = degrees(rows, cols, loop)
        return unusedAcrossWalls(board) { r, c -> deg[r][c] == 0 }.isEmpty()
    }

    /** What the decided marks already break (web: brokenClues). */
    data class Broken(
        val numbers: Set<Pair<Int, Int>>,
        val rooms: Set<Int>,
        val crosses: Set<Pair<Int, Int>>,
    )

    fun brokenClues(board: Board, userValues: Map<String, Int>): Broken {
        val loop = loop(board.rows, board.cols, userValues)
        val marks = marks(board.rows, board.cols, userValues)
        val s = roomState(board, loop)
        val numbers = HashSet<Pair<Int, Int>>()
        val rooms = HashSet<Int>()
        for (id in s.loopCells.indices) {
            if (s.crossings[id] > 2) rooms.add(id)
            val num = s.number[id] ?: continue
            if (s.loopCells[id] > num || (s.closed[id] && s.loopCells[id] != num)) numbers.add(s.numberAt[id]!!)
        }
        val crosses = HashSet<Pair<Int, Int>>()
        for ((a, b) in unusedAcrossWalls(board) { r, c -> marks[r][c] == CROSS }) {
            crosses.add(a)
            crosses.add(b)
        }
        return Broken(numbers, rooms, crosses)
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parseBoard(puzzle)
        val loop = loop(board.rows, board.cols, userValues)
        val marks = marks(board.rows, board.cols, userValues)
        fun grid(a: Array<IntArray>) = JsonArray(a.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(
            mapOf(
                "edges" to JsonObject(mapOf("h" to grid(loop.h), "v" to grid(loop.v))),
                "marks" to grid(marks),
            )
        )
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val out = HashMap<String, Int>()
        val edges = answer["edges"] as? JsonObject
        fun read(el: JsonElement?, key: (Int, Int) -> String, keep: (Int) -> Boolean) {
            (el as? JsonArray)?.forEachIndexed { r, row ->
                (row as? JsonArray)?.forEachIndexed { c, x ->
                    val v = (x as? JsonPrimitive)?.intOrNull ?: 0
                    if (keep(v)) out[key(r, c)] = v
                }
            }
        }
        read(edges?.get("h"), ::hKey) { it == 1 }
        read(edges?.get("v"), ::vKey) { it == 1 }
        read(answer["marks"], { r, c -> cellKey(c, r) }) { it == CROSS || it == DOT }
        return out
    }

    /** Cells touched by a segment or carrying a mark, over all cells (web: countryRoadProgress). */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        if (rows * cols == 0) return 0.0
        val deg = degrees(rows, cols, loop(rows, cols, userValues))
        val marks = marks(rows, cols, userValues)
        var decided = 0
        for (r in 0 until rows) for (c in 0 until cols) if (deg[r][c] > 0 || marks[r][c] != 0) decided++
        return decided.toDouble() / (rows * cols) * 100.0
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        return solved(board, loop(board.rows, board.cols, userValues))
    }
}
