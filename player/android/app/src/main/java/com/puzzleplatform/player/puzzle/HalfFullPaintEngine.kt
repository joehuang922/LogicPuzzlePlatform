package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Half-Full Paint (puzzle type 48), a picture puzzle. Ports
 * frontend/src/components/halfFullPaintRules.ts, the extractor
 * (frontend/src/extractors/halfFullPaint.ts) and progress
 * (frontend/src/progress/halfFullPaint.ts).
 *
 * canonRepr: { width, height, grids: { h, v }, circles: [{ dr, dc, color }] }
 *   - grids: Country Road's walls; h (height-1) x width, v height x (width-1).
 *   - circles: Kuralin's ([KuralinEngine.Circle]): doubled coordinates on edge midpoints
 *     and interior corners, color 0 white / 1 black / 2 gray.
 *
 * Every room is all shaded, all unshaded or half shaded with each colour connected; a
 * circle shows the majority of the cells it touches.
 *
 * userValues "col,row" -> 1 shaded / 2 dot, through the shared shade/mark tap cycle.
 * answer: { states: rows x cols } (0 unset, 1 shaded, 2 dot).
 */
object HalfFullPaintEngine : ShadeMarkEngine {
    override val puzzleType: Int = 48

    const val UNSET = ShadeCycle.EMPTY
    const val SHADED = ShadeCycle.SHADED
    const val DOT = ShadeCycle.MARKED

    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    data class Board(
        val rows: Int,
        val cols: Int,
        val h: List<List<Int>>,
        val v: List<List<Int>>,
        val circles: List<KuralinEngine.Circle>,
    ) {
        fun wallBelow(r: Int, c: Int): Boolean = h.getOrNull(r)?.getOrNull(c) == 1

        fun wallRight(r: Int, c: Int): Boolean = v.getOrNull(r)?.getOrNull(c) == 1
    }

    fun parseBoard(puzzle: Puzzle): Board = boardFromCanon(puzzle.canonRepr)

    fun boardFromCanon(canon: JsonObject): Board {
        val grids = canon["grids"] as? JsonObject
        val k = KuralinEngine.parseBoard(canon)
        return Board(k.rows, k.cols, intGrid(grids?.get("h")), intGrid(grids?.get("v")), k.circles)
    }

    fun canonOf(board: Board): JsonObject {
        fun grid(g: List<List<Int>>) = JsonArray(g.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(
            mapOf(
                "width" to JsonPrimitive(board.cols),
                "height" to JsonPrimitive(board.rows),
                "grids" to JsonObject(mapOf("h" to grid(board.h), "v" to grid(board.v))),
                "circles" to JsonArray(board.circles.map { c ->
                    JsonObject(
                        mapOf("dr" to JsonPrimitive(c.dr), "dc" to JsonPrimitive(c.dc), "color" to JsonPrimitive(c.color))
                    )
                }),
            )
        )
    }

    private fun intGrid(el: JsonElement?): List<List<Int>> =
        (el as? JsonArray)?.map { row -> (row as? JsonArray)?.map { (it as? JsonPrimitive)?.intOrNull ?: 0 } ?: emptyList() }
            ?: emptyList()

    /** Room id per cell and the room count (web: computeRooms). */
    fun rooms(board: Board): Pair<Array<IntArray>, Int> {
        val ids = Array(board.rows) { IntArray(board.cols) { -1 } }
        var count = 0
        for (r in 0 until board.rows) for (c in 0 until board.cols) {
            if (ids[r][c] >= 0) continue
            ids[r][c] = count
            val stack = ArrayDeque<Pair<Int, Int>>()
            stack.addLast(r to c)
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                val next = listOf(
                    Triple(cr - 1, cc, cr > 0 && !board.wallBelow(cr - 1, cc)),
                    Triple(cr + 1, cc, cr < board.rows - 1 && !board.wallBelow(cr, cc)),
                    Triple(cr, cc - 1, cc > 0 && !board.wallRight(cr, cc - 1)),
                    Triple(cr, cc + 1, cc < board.cols - 1 && !board.wallRight(cr, cc)),
                )
                for ((nr, nc, open) in next) if (open && ids[nr][nc] < 0) { ids[nr][nc] = count; stack.addLast(nr to nc) }
            }
            count++
        }
        return ids to count
    }

    private fun roomCells(board: Board): List<List<Pair<Int, Int>>> {
        val (ids, count) = rooms(board)
        val out = List(count) { ArrayList<Pair<Int, Int>>() }
        for (r in 0 until board.rows) for (c in 0 until board.cols) out[ids[r][c]].add(r to c)
        return out
    }

    /** The in-board cells (row, col) a circle touches (web: circleCells). */
    fun circleCells(board: Board, circle: KuralinEngine.Circle): List<Pair<Int, Int>> =
        KuralinEngine.touchedCells(circle).filter { (r, c) -> r in 0 until board.rows && c in 0 until board.cols }

    fun states(board: Board, userValues: Map<String, Int>): Array<IntArray> =
        Array(board.rows) { r ->
            IntArray(board.cols) { c ->
                when (val v = userValues[cellKey(c, r)]) {
                    SHADED, DOT -> v
                    else -> UNSET
                }
            }
        }

    private fun connected(cells: List<Pair<Int, Int>>): Boolean {
        if (cells.size <= 1) return true
        val set = cells.toHashSet()
        val seen = hashSetOf(cells[0])
        val stack = ArrayDeque<Pair<Int, Int>>()
        stack.addLast(cells[0])
        while (stack.isNotEmpty()) {
            val (r, c) = stack.removeLast()
            for (n in listOf(r - 1 to c, r + 1 to c, r to c - 1, r to c + 1)) {
                if (n in set && seen.add(n)) stack.addLast(n)
            }
        }
        return seen.size == cells.size
    }

    private fun circleHolds(color: Int, shaded: Int, n: Int): Boolean = when (color) {
        KuralinEngine.BLACK_CIRCLE -> 2 * shaded > n
        KuralinEngine.WHITE_CIRCLE -> 2 * shaded < n
        else -> 2 * shaded == n
    }

    /** Every circle and every room right (web: validateHalfFullPaint). */
    fun solved(board: Board, states: Array<IntArray>): Boolean {
        if (board.rows == 0 || board.cols == 0) return false
        for (circle in board.circles) {
            val cells = circleCells(board, circle)
            if (!circleHolds(circle.color, cells.count { (r, c) -> states[r][c] == SHADED }, cells.size)) return false
        }
        for (cells in roomCells(board)) {
            val on = cells.filter { (r, c) -> states[r][c] == SHADED }
            val off = cells.filter { (r, c) -> states[r][c] != SHADED }
            if (on.isNotEmpty() && off.isNotEmpty() && 2 * on.size != cells.size) return false
            if (!connected(on) || !connected(off)) return false
        }
        return true
    }

    /** Circles (by index) and room ids the decided cells already break (web: brokenClues). */
    data class Broken(val circles: Set<Int>, val rooms: Set<Int>)

    fun brokenClues(board: Board, userValues: Map<String, Int>): Broken {
        val states = states(board, userValues)
        val circles = HashSet<Int>()
        board.circles.forEachIndexed { i, circle ->
            val cells = circleCells(board, circle)
            val n = cells.size
            val on = cells.count { (r, c) -> states[r][c] == SHADED }
            val off = cells.count { (r, c) -> states[r][c] == DOT }
            val ok = when (circle.color) {
                KuralinEngine.BLACK_CIRCLE -> 2 * (n - off) > n
                KuralinEngine.WHITE_CIRCLE -> 2 * on < n
                else -> 2 * on <= n && 2 * off <= n
            }
            if (!ok) circles.add(i)
        }
        val rooms = HashSet<Int>()
        roomCells(board).forEachIndexed { id, cells ->
            val n = cells.size
            val on = cells.filter { (r, c) -> states[r][c] == SHADED }
            val off = cells.filter { (r, c) -> states[r][c] == DOT }
            if (on.isNotEmpty() && off.isNotEmpty() && (n % 2 == 1 || 2 * on.size > n || 2 * off.size > n)) rooms.add(id)
            if (on.size + off.size == n && (!connected(on) || !connected(off))) rooms.add(id)
        }
        return Broken(circles, rooms)
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val states = states(parseBoard(puzzle), userValues)
        return JsonObject(mapOf("states" to JsonArray(states.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val states = answer["states"] as? JsonArray ?: return emptyMap()
        val out = HashMap<String, Int>()
        states.forEachIndexed { r, rowEl ->
            (rowEl as? JsonArray)?.forEachIndexed { c, el ->
                val v = (el as? JsonPrimitive)?.intOrNull
                if (v == SHADED || v == DOT) out[cellKey(c, r)] = v
            }
        }
        return out
    }

    /** Cells shaded or dotted, over all cells (web: halfFullPaintProgress). */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val total = board.rows * board.cols
        if (total == 0) return 0.0
        return states(board, userValues).sumOf { row -> row.count { it != UNSET } }.toDouble() / total * 100.0
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        return solved(board, states(board, userValues))
    }

    const val FILL_ARGB: Int = 0xFF000000.toInt()
    const val MARK_ARGB: Int = 0xFFFFFFFF.toInt()
    const val GROUND_ARGB: Int = 0xFFD9D9D9.toInt()

    /** The picture: shaded black, dotted white, unset ground (the web preview's cells). */
    fun pictureCells(board: Board, userValues: Map<String, Int>): IntArray {
        val states = states(board, userValues)
        return IntArray(board.rows * board.cols) { i ->
            when (states[i / board.cols][i % board.cols]) {
                SHADED -> FILL_ARGB
                DOT -> MARK_ARGB
                else -> GROUND_ARGB
            }
        }
    }

    /** Solved picture: shaded black, everything else white. */
    override fun renderThumbnail(puzzle: Puzzle, answer: JsonObject): PuzzleThumbnail? {
        val board = parseBoard(puzzle)
        if (board.rows == 0 || board.cols == 0) return null
        val cells = pictureCells(board, restoreUserValues(puzzle, answer))
        return PuzzleThumbnail(
            width = board.cols,
            height = board.rows,
            cells = IntArray(cells.size) { if (cells[it] == FILL_ARGB) FILL_ARGB else MARK_ARGB },
        )
    }
}
