package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * The L-Ring rules shared by play and authoring, a port of
 * frontend/src/components/lRingRules.ts. Pure, so it's unit-testable.
 *
 * Cells: 0 = empty, 1-4 = an arrow pointing up / right / down / left. A single loop runs
 * through cell centres, passes every arrow cell and turns there; the arm in the arrow's
 * direction (segments walked straight from the arrow cell until the loop turns) is
 * exactly one longer than the other arm.
 */
object LRingRules {
    const val EMPTY = 0

    /** (dRow, dCol) for arrow codes 1-4, and their names in picker order. */
    val ARROWS = listOf(
        Triple(1, -1 to 0, "Up"),
        Triple(2, 0 to 1, "Right"),
        Triple(3, 1 to 0, "Down"),
        Triple(4, 0 to -1, "Left"),
    )
    private val DIRS = listOf(-1 to 0, 0 to 1, 1 to 0, 0 to -1)

    fun isArrow(v: Int): Boolean = v in 1..4
    fun step(v: Int): Pair<Int, Int>? = ARROWS.firstOrNull { it.first == v }?.second

    enum class ArrowState { OK, BAD, OPEN }

    private fun linked(e: MasyuEngine.Edges, r: Int, c: Int, dr: Int, dc: Int): Boolean =
        if (dr == 0) e.h.getOrNull(r)?.getOrNull(if (dc > 0) c else c - 1) == 1
        else e.v.getOrNull(if (dr > 0) r else r - 1)?.getOrNull(c) == 1

    private fun degree(e: MasyuEngine.Edges, r: Int, c: Int): Int =
        DIRS.count { (dr, dc) -> linked(e, r, c, dr, dc) }

    /**
     * Segments walked straight from (r, c) along (dr, dc) until the loop turns; null while
     * undecided (no segment that way, or the line stops without turning).
     */
    fun armLength(e: MasyuEngine.Edges, r: Int, c: Int, dr: Int, dc: Int, rows: Int, cols: Int): Int? {
        if (!linked(e, r, c, dr, dc)) return null
        var len = 0
        var cr = r
        var cc = c
        while (linked(e, cr, cc, dr, dc)) {
            cr += dr
            cc += dc
            len++
            if (len > rows * cols) return null
        }
        return if (degree(e, cr, cc) == 2) len else null
    }

    /**
     * OK when the arrow cell turns with one arm in the arrow's direction and that arm is
     * exactly one longer than the other; BAD when that's already impossible; else OPEN.
     */
    fun arrowState(cells: List<List<Int>>, e: MasyuEngine.Edges, r: Int, c: Int): ArrowState {
        val (ar, ac) = step(cells.getOrNull(r)?.getOrNull(c) ?: EMPTY) ?: return ArrowState.OPEN
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        val deg = degree(e, r, c)
        if (deg > 2) return ArrowState.BAD
        if (linked(e, r, c, -ar, -ac)) return ArrowState.BAD
        if (r + ar !in 0 until rows || c + ac !in 0 until cols) return ArrowState.BAD
        if (deg < 2 || !linked(e, r, c, ar, ac)) return ArrowState.OPEN
        val (or, oc) = DIRS.first { (dr, dc) -> !(dr == ar && dc == ac) && linked(e, r, c, dr, dc) }
        val main = armLength(e, r, c, ar, ac, rows, cols) ?: return ArrowState.OPEN
        val side = armLength(e, r, c, or, oc, rows, cols) ?: return ArrowState.OPEN
        return if (main == side + 1) ArrowState.OK else ArrowState.BAD
    }

    fun satisfiedArrows(cells: List<List<Int>>, e: MasyuEngine.Edges): Int {
        var n = 0
        for (r in cells.indices) for (c in cells[r].indices) {
            if (isArrow(cells[r][c]) && arrowState(cells, e, r, c) == ArrowState.OK) n++
        }
        return n
    }

    /** One closed loop (every cell degree 0 or 2, all loop cells connected) and every arrow OK. */
    fun isSolved(cells: List<List<Int>>, e: MasyuEngine.Edges): Boolean {
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        var loopCells = 0
        var start: Pair<Int, Int>? = null
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val d = degree(e, r, c)
                if (d != 0 && d != 2) return false
                if (d == 2) {
                    loopCells++
                    if (start == null) start = r to c
                }
                if (isArrow(cells[r].getOrNull(c) ?: EMPTY) && arrowState(cells, e, r, c) != ArrowState.OK) return false
            }
        }
        val first = start ?: return false
        val seen = hashSetOf(first)
        val stack = ArrayDeque(listOf(first))
        while (stack.isNotEmpty()) {
            val (r, c) = stack.removeLast()
            for ((dr, dc) in DIRS) {
                if (!linked(e, r, c, dr, dc)) continue
                val next = r + dr to c + dc
                if (seen.add(next)) stack.addLast(next)
            }
        }
        return seen.size == loopCells
    }
}

/**
 * L-Ring (puzzle type 33). Ports frontend/src/progress/lRing.ts and the completion check
 * in lRingRules.ts. Answer and transport are Masyu's — `{ edges: { h, v } }`, userValues
 * keyed "h:row,col" / "v:row,col" -> 1 — so extraction and restore delegate to
 * [MasyuEngine] (it reads only the canon's grid size).
 */
object LRingEngine : PuzzleEngine {
    override val puzzleType: Int = 33

    fun parseCells(puzzle: Puzzle): List<List<Int>> = MasyuEngine.parseCells(puzzle)

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject =
        MasyuEngine.extractAnswer(puzzle, userValues)

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> =
        MasyuEngine.restoreUserValues(puzzle, answer)

    /** Satisfied arrows / all arrows * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val total = cells.sumOf { row -> row.count(LRingRules::isArrow) }
        if (total == 0) return 0.0
        val done = LRingRules.satisfiedArrows(cells, MasyuEngine.edges(cells, userValues))
        return (done.toDouble() / total * 100.0).coerceAtMost(100.0)
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        return LRingRules.isSolved(cells, MasyuEngine.edges(cells, userValues))
    }
}
