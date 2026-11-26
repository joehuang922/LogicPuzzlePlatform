package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import kotlin.math.abs

/**
 * Tetro Chain K (puzzle type 50). Ports frontend/src/components/tetroChainKRules.ts, the
 * extractor (frontend/src/extractors/tetroChainK.ts) and progress
 * (frontend/src/progress/tetroChainK.ts).
 *
 * canonRepr: Kuralin's { width, height, circles: [{ dr, dc, color }] } ([KuralinEngine.Board]).
 * Shade tetrominoes: circles show the majority of the cells they touch, the tetrominoes
 * link through corners, and two of the same shape never touch.
 *
 * userValues "col,row" -> 1 shaded / 2 dot, through the shared shade/mark tap cycle.
 * answer: { states: rows x cols } (0 unset, 1 shaded, 2 dot).
 */
object TetroChainKEngine : ShadeMarkEngine {
    override val puzzleType: Int = 50

    const val UNSET = ShadeCycle.EMPTY
    const val SHADED = ShadeCycle.SHADED
    const val DOT = ShadeCycle.MARKED

    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    fun parseBoard(puzzle: Puzzle): KuralinEngine.Board = KuralinEngine.parseBoard(puzzle.canonRepr)

    fun states(board: KuralinEngine.Board, userValues: Map<String, Int>): Array<IntArray> =
        Array(board.rows) { r ->
            IntArray(board.cols) { c ->
                when (val v = userValues[cellKey(c, r)]) {
                    SHADED, DOT -> v
                    else -> UNSET
                }
            }
        }

    private val ORTHO = listOf(1 to 0, -1 to 0, 0 to 1, 0 to -1)

    /** The orthogonally connected groups of shaded cells (web: groups). */
    fun groups(board: KuralinEngine.Board, states: Array<IntArray>): List<List<Pair<Int, Int>>> {
        val seen = Array(board.rows) { BooleanArray(board.cols) }
        val out = ArrayList<List<Pair<Int, Int>>>()
        for (r in 0 until board.rows) for (c in 0 until board.cols) {
            if (states[r][c] != SHADED || seen[r][c]) continue
            seen[r][c] = true
            val group = ArrayList<Pair<Int, Int>>()
            val stack = ArrayDeque<Pair<Int, Int>>()
            stack.addLast(r to c)
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                group.add(cr to cc)
                for ((dr, dc) in ORTHO) {
                    val nr = cr + dr
                    val nc = cc + dc
                    if (nr in 0 until board.rows && nc in 0 until board.cols && states[nr][nc] == SHADED && !seen[nr][nc]) {
                        seen[nr][nc] = true
                        stack.addLast(nr to nc)
                    }
                }
            }
            out.add(group)
        }
        return out
    }

    /** The tetromino a 4-cell group forms, rotations and reflections the same (web: shapeOf). */
    fun shapeOf(cells: List<Pair<Int, Int>>): Char? {
        if (cells.size != 4) return null
        val rows = cells.map { it.first }.toSet()
        val cols = cells.map { it.second }.toSet()
        if (rows.size == 1 || cols.size == 1) return 'I'
        if (rows.size == 2 && cols.size == 2) return 'O'
        val set = cells.toSet()
        if (cells.any { (r, c) -> ORTHO.count { (dr, dc) -> (r + dr to c + dc) in set } == 3 }) return 'T'
        val tall = rows.size == 3
        val counts = (if (tall) cols else rows).map { v -> cells.count { (r, c) -> (if (tall) c else r) == v } }
        return if (3 in counts) 'L' else 'S'
    }

    /** All shaded cells connected through the 8-neighbourhood (web: chained). */
    fun chained(board: KuralinEngine.Board, states: Array<IntArray>): Boolean {
        val cells = ArrayList<Pair<Int, Int>>()
        for (r in 0 until board.rows) for (c in 0 until board.cols) if (states[r][c] == SHADED) cells.add(r to c)
        if (cells.isEmpty()) return false
        val seen = hashSetOf(cells[0])
        val stack = ArrayDeque<Pair<Int, Int>>()
        stack.addLast(cells[0])
        while (stack.isNotEmpty()) {
            val (r, c) = stack.removeLast()
            for (dr in -1..1) for (dc in -1..1) {
                val n = r + dr to c + dc
                if (n.first in 0 until board.rows && n.second in 0 until board.cols &&
                    states[n.first][n.second] == SHADED && seen.add(n)
                ) {
                    stack.addLast(n)
                }
            }
        }
        return seen.size == cells.size
    }

    /** Index pairs of same-shape groups touching at a corner (web: twinTouches). */
    fun twinTouches(groups: List<List<Pair<Int, Int>>>): List<Pair<Int, Int>> {
        val shapes = groups.map { shapeOf(it) }
        val out = ArrayList<Pair<Int, Int>>()
        for (i in groups.indices) for (j in i + 1 until groups.size) {
            val s = shapes[i] ?: continue
            if (s != shapes[j]) continue
            val touch = groups[i].any { (r1, c1) -> groups[j].any { (r2, c2) -> abs(r1 - r2) <= 1 && abs(c1 - c2) <= 1 } }
            if (touch) out.add(i to j)
        }
        return out
    }

    /** The in-board cells (row, col) a circle touches. */
    fun circleCells(board: KuralinEngine.Board, circle: KuralinEngine.Circle): List<Pair<Int, Int>> =
        KuralinEngine.touchedCells(circle).filter { (r, c) -> r in 0 until board.rows && c in 0 until board.cols }

    private fun circleHolds(color: Int, shaded: Int, n: Int): Boolean = when (color) {
        KuralinEngine.BLACK_CIRCLE -> 2 * shaded > n
        KuralinEngine.WHITE_CIRCLE -> 2 * shaded < n
        else -> 2 * shaded == n
    }

    /** The five rules (web: validateTetroChainK). */
    fun solved(board: KuralinEngine.Board, states: Array<IntArray>): Boolean {
        for (k in board.circles) {
            val cells = circleCells(board, k)
            if (!circleHolds(k.color, cells.count { (r, c) -> states[r][c] == SHADED }, cells.size)) return false
        }
        val gs = groups(board, states)
        if (gs.isEmpty() || gs.any { it.size != 4 }) return false
        if (!chained(board, states)) return false
        return twinTouches(gs).isEmpty()
    }

    /** Circles (by index) and cells of broken groups (web: brokenClues). */
    data class Broken(val circles: Set<Int>, val cells: Set<Pair<Int, Int>>)

    fun brokenClues(board: KuralinEngine.Board, userValues: Map<String, Int>): Broken {
        val states = states(board, userValues)
        val circles = HashSet<Int>()
        board.circles.forEachIndexed { i, k ->
            val cells = circleCells(board, k)
            val n = cells.size
            val on = cells.count { (r, c) -> states[r][c] == SHADED }
            val off = cells.count { (r, c) -> states[r][c] == DOT }
            val ok = when (k.color) {
                KuralinEngine.BLACK_CIRCLE -> 2 * (n - off) > n
                KuralinEngine.WHITE_CIRCLE -> 2 * on < n
                else -> 2 * on <= n && 2 * off <= n
            }
            if (!ok) circles.add(i)
        }
        val cells = HashSet<Pair<Int, Int>>()
        val gs = groups(board, states)
        for (g in gs) {
            if (g.size > 4) {
                cells.addAll(g)
            } else if (g.size < 4) {
                val grows = g.any { (r, c) ->
                    ORTHO.any { (dr, dc) ->
                        val nr = r + dr
                        val nc = c + dc
                        nr in 0 until board.rows && nc in 0 until board.cols && states[nr][nc] == UNSET
                    }
                }
                if (!grows) cells.addAll(g)
            }
        }
        for ((i, j) in twinTouches(gs)) {
            cells.addAll(gs[i])
            cells.addAll(gs[j])
        }
        return Broken(circles, cells)
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

    /** Cells shaded or dotted, over all cells (web: tetroChainKProgress). */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val total = board.rows * board.cols
        if (total == 0) return 0.0
        return states(board, userValues).sumOf { row -> row.count { it != UNSET } }.toDouble() / total * 100.0
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        return board.rows > 0 && board.cols > 0 && solved(board, states(board, userValues))
    }
}
