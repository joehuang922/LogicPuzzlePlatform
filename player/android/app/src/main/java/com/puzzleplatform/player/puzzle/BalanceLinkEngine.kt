package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * The Balance Link rules shared by play and authoring, a port of
 * frontend/src/components/balanceLinkRules.ts. Pure, so it's unit-testable.
 *
 * Cells: 0 = white, 1 = black, 10-71 = a symbol whose tens digit is the shape ([SHAPES])
 * and ones digit the colour (0 outlined / 1 filled). Points are (row, col).
 */
object BalanceLinkRules {
    const val EMPTY = 0
    const val BLACK = 1

    /** Shape id (the code's tens digit) -> name, in picker order. */
    val SHAPES = listOf(
        1 to "Circle",
        2 to "Square",
        3 to "Diamond",
        4 to "Triangle ▲",
        5 to "Triangle ▼",
        6 to "Star",
        7 to "4-point star",
    )

    fun isSymbol(v: Int): Boolean = v >= 10
    fun shapeOf(v: Int): Int = v / 10
    fun isBlackSymbol(v: Int): Boolean = v % 10 == 1
    fun code(shape: Int, black: Boolean): Int = shape * 10 + if (black) 1 else 0
    fun isKnown(v: Int): Boolean =
        v == EMPTY || v == BLACK || (isSymbol(v) && SHAPES.any { it.first == shapeOf(v) } && v % 10 <= 1)

    /** Segments a cell may hold: black cells none, symbols one (a line ends there), others two. */
    fun capacity(v: Int): Int = when {
        v == BLACK -> 0
        isSymbol(v) -> 1
        else -> 2
    }

    private fun linked(e: NumberLinkEngine.Edges, rows: Int, cols: Int, r: Int, c: Int): List<Pair<Int, Int>> {
        val ns = ArrayList<Pair<Int, Int>>(4)
        if (c > 0 && e.h[r][c - 1] == NumberLinkEngine.SEGMENT) ns.add(r to c - 1)
        if (c < cols - 1 && e.h[r][c] == NumberLinkEngine.SEGMENT) ns.add(r to c + 1)
        if (r > 0 && e.v[r - 1][c] == NumberLinkEngine.SEGMENT) ns.add(r - 1 to c)
        if (r < rows - 1 && e.v[r][c] == NumberLinkEngine.SEGMENT) ns.add(r + 1 to c)
        return ns
    }

    /**
     * The mirror that swaps a line's two ends, or null when no grid mirror can: the ends
     * must share a row (vertical mirror), a column (horizontal mirror) or a 45° diagonal.
     * Those are the only mirrors that map a grid path onto itself. Coordinates are doubled
     * so half-cell mirror lines stay integral.
     */
    private fun mirrorFor(a: Pair<Int, Int>, b: Pair<Int, Int>): ((Pair<Int, Int>) -> Pair<Int, Int>)? {
        val (r0, c0) = a
        val (rn, cn) = b
        return when {
            r0 == rn -> { p -> p.first to (c0 + cn - p.second) }
            c0 == cn -> { p -> (r0 + rn - p.first) to p.second }
            rn - r0 == cn - c0 -> {
                val k2 = r0 + c0 + rn + cn // mirror r + c = k2 / 2
                if (k2 % 2 != 0) null else { p -> (k2 / 2 - p.second) to (k2 / 2 - p.first) }
            }
            rn - r0 == c0 - cn -> {
                val k2 = r0 - c0 + rn - cn // mirror r - c = k2 / 2
                if (k2 % 2 != 0) null else { p -> (p.second + k2 / 2) to (p.first - k2 / 2) }
            }
            else -> null
        }
    }

    /** True when the line P0..Pn is line-symmetric about its midpoint: R(Pi) = P(n-i). */
    fun isBalanced(points: List<Pair<Int, Int>>): Boolean {
        if (points.size < 2) return false
        val n = points.size - 1
        val mirror = mirrorFor(points[0], points[n]) ?: return false
        return points.indices.all { i -> mirror(points[i]) == points[n - i] }
    }

    data class Line(val points: List<Pair<Int, Int>>, val matched: Boolean, val balanced: Boolean)

    /** Every line that starts at a symbol, reported once from its first end in reading order. */
    fun traceLines(cells: List<List<Int>>, e: NumberLinkEngine.Edges): List<Line> {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        fun at(r: Int, c: Int) = cells.getOrNull(r)?.getOrNull(c) ?: EMPTY
        val seen = HashSet<Pair<Int, Int>>()
        val lines = ArrayList<Line>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!isSymbol(at(r, c)) || (r to c) in seen) continue
                val first = linked(e, rows, cols, r, c)
                if (first.size != 1) continue
                val points = arrayListOf(r to c)
                var prev = r to c
                var cur = first[0]
                while (true) {
                    points.add(cur)
                    if (isSymbol(at(cur.first, cur.second))) break
                    val next = linked(e, rows, cols, cur.first, cur.second).filter { it != prev }
                    if (next.size != 1 || points.size > rows * cols) break
                    prev = cur
                    cur = next[0]
                }
                val end = points.last()
                seen.add(r to c)
                seen.add(end)
                val matched = end != (r to c) && at(end.first, end.second) == at(r, c)
                lines.add(Line(points, matched, matched && isBalanced(points)))
            }
        }
        return lines
    }

    /** Symbols on a matched, balanced line. */
    fun finishedSymbols(cells: List<List<Int>>, e: NumberLinkEngine.Edges): Int =
        traceLines(cells, e).count { it.matched && it.balanced } * 2

    /**
     * A full solution: no segment touches a black cell, every symbol has exactly one segment
     * and every other cell 0 or 2, every line joins two identical symbols and is balanced,
     * and there are no loops.
     */
    fun isSolved(cells: List<List<Int>>, e: NumberLinkEngine.Edges): Boolean {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        if (rows == 0 || cols == 0) return false
        var symbols = 0
        var used = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val v = cells.getOrNull(r)?.getOrNull(c) ?: EMPTY
                val deg = linked(e, rows, cols, r, c).size
                if (v == BLACK && deg > 0) return false
                if (isSymbol(v)) {
                    symbols++
                    if (deg != 1) return false
                } else if (deg != 0 && deg != 2) {
                    return false
                }
                if (deg > 0) used++
            }
        }
        if (symbols == 0) return false
        val lines = traceLines(cells, e)
        if (lines.size * 2 != symbols || !lines.all { it.matched && it.balanced }) return false
        return lines.sumOf { it.points.size } == used
    }
}

/**
 * Balance Link (puzzle type 32). Ports frontend/src/progress/balanceLink.ts and the
 * completion check in balanceLinkRules.ts. Answer and transport are Number Link's —
 * `{ edges: { h, v } }`, userValues keyed "h:row,col" / "v:row,col" -> 1 — so extraction
 * and restore delegate to [NumberLinkEngine] (it reads only the canon's grid size).
 */
object BalanceLinkEngine : PuzzleEngine {
    override val puzzleType: Int = 32

    fun parseCells(puzzle: Puzzle): List<List<Int>> = NumberLinkEngine.parseCells(puzzle)

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject =
        NumberLinkEngine.extractAnswer(puzzle, userValues)

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> =
        NumberLinkEngine.restoreUserValues(puzzle, answer)

    /** Symbols on a finished (matched and balanced) line / all symbols * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val total = cells.sumOf { row -> row.count(BalanceLinkRules::isSymbol) }
        if (total == 0) return 0.0
        val done = BalanceLinkRules.finishedSymbols(cells, NumberLinkEngine.edges(cells, userValues))
        return (done.toDouble() / total * 100.0).coerceAtMost(100.0)
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        return BalanceLinkRules.isSolved(cells, NumberLinkEngine.edges(cells, userValues))
    }
}
