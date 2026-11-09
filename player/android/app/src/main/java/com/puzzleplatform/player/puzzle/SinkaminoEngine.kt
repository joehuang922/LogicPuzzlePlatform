package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * A sinkamino board: [cells] rows x cols of [SinkaminoRules.WHITE] / [SinkaminoRules.BLACK]
 * / [SinkaminoRules.GIVEN], and [arrows], each an ordered list of (row, col) from tail to
 * head.
 */
data class SinkaminoGrid(
    val cells: List<List<Int>>,
    val arrows: List<List<Pair<Int, Int>>>,
) {
    val rows: Int get() = cells.size
    val cols: Int get() = cells.maxOfOrNull { it.size } ?: 0

    fun cellAt(row: Int, col: Int): Int = cells.getOrNull(row)?.getOrNull(col) ?: SinkaminoRules.BLACK
}

/**
 * The sinkamino rules shared by play and authoring, a port of
 * frontend/src/components/sinkaminoRules.ts. Pure, so it's unit-testable.
 */
object SinkaminoRules {
    const val WHITE = 0
    const val BLACK = 1
    const val GIVEN = 2

    /** Read a canon `{ cells, arrows }`; missing or malformed parts read as empty. */
    fun parse(canon: JsonObject): SinkaminoGrid {
        val cells = (canon["cells"] as? JsonArray)?.map { row ->
            (row as? JsonArray)?.map { v ->
                val n = (v as? JsonPrimitive)?.intOrNull
                if (n != null && n in WHITE..GIVEN) n else WHITE
            } ?: emptyList()
        } ?: emptyList()
        val arrows = (canon["arrows"] as? JsonArray)?.map { trail ->
            (trail as? JsonArray)?.mapNotNull { p ->
                val pair = p as? JsonArray ?: return@mapNotNull null
                val r = (pair.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
                val c = (pair.getOrNull(1) as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
                r to c
            } ?: emptyList()
        } ?: emptyList()
        return SinkaminoGrid(cells, arrows)
    }

    fun toCanon(grid: SinkaminoGrid): JsonObject = JsonObject(
        mapOf(
            "cells" to JsonArray(grid.cells.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }),
            "arrows" to JsonArray(grid.arrows.map { trail ->
                JsonArray(trail.map { (r, c) -> JsonArray(listOf(JsonPrimitive(r), JsonPrimitive(c))) })
            }),
        )
    )

    /**
     * Trails the canon can't hold (also refused by the API): shorter than 2 cells, off
     * the grid, over a black cell, or stepping between cells that aren't neighbours.
     * Positions are 1-based "R3C5"; arrows are numbered in canon order.
     */
    fun formatProblems(grid: SinkaminoGrid): List<String> = buildList {
        grid.arrows.forEachIndexed { i, trail ->
            val name = "Arrow ${i + 1}"
            if (trail.size < 2) add("$name is shorter than 2 cells")
            trail.forEachIndexed { j, (r, c) ->
                if (r !in 0 until grid.rows || c !in 0 until grid.cols) {
                    add("$name leaves the grid at R${r + 1}C${c + 1}")
                    return@forEachIndexed
                }
                if (grid.cellAt(r, c) == BLACK) add("$name crosses the black cell R${r + 1}C${c + 1}")
                if (j > 0) {
                    val (pr, pc) = trail[j - 1]
                    if (Math.abs(pr - r) + Math.abs(pc - c) != 1) {
                        add("$name jumps from R${pr + 1}C${pc + 1} to R${r + 1}C${c + 1}")
                    }
                }
            }
        }
    }

    /** Cells of an island shifted so its bounding box starts at (0, 0). */
    private fun normalise(cells: List<Pair<Int, Int>>): Set<Pair<Int, Int>> {
        val minR = cells.minOf { it.first }
        val minC = cells.minOf { it.second }
        return cells.mapTo(HashSet()) { (r, c) -> (r - minR) to (c - minC) }
    }

    /** True when [next] is [prev]'s shape, in the same orientation, plus one square. */
    fun evolvesFrom(prev: List<Pair<Int, Int>>, next: List<Pair<Int, Int>>): Boolean {
        if (prev.isEmpty() || next.size != prev.size + 1) return false
        val target = normalise(prev)
        return next.indices.any { i -> normalise(next.filterIndexed { j, _ -> j != i }) == target }
    }

    /**
     * True when [squares] (the given squares plus the placed ones) solve [grid]:
     *  1. no square on a black cell,
     *  2. every island has exactly one square on a trail cell, over all trails,
     *  3. every trail crosses at least 2 islands,
     *  4. along each trail each island is the previous one's shape plus one square.
     */
    fun isSolved(grid: SinkaminoGrid, squares: Set<Pair<Int, Int>>): Boolean {
        val rows = grid.rows
        val cols = grid.cols
        if (rows == 0 || cols == 0 || formatProblems(grid).isNotEmpty()) return false
        if (squares.any { (r, c) -> grid.cellAt(r, c) == BLACK }) return false

        val island = Array(rows) { IntArray(cols) { -1 } }
        val islands = ArrayList<List<Pair<Int, Int>>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((r to c) !in squares || island[r][c] >= 0) continue
                val id = islands.size
                val members = ArrayList<Pair<Int, Int>>()
                val stack = ArrayDeque<Pair<Int, Int>>()
                island[r][c] = id
                stack.addLast(r to c)
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    members.add(cr to cc)
                    for ((dr, dc) in listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)) {
                        val nr = cr + dr
                        val nc = cc + dc
                        if (nr in 0 until rows && nc in 0 until cols && island[nr][nc] < 0 && (nr to nc) in squares) {
                            island[nr][nc] = id
                            stack.addLast(nr to nc)
                        }
                    }
                }
                islands.add(members)
            }
        }
        if (islands.isEmpty()) return false

        val crossings = IntArray(islands.size)
        for (trail in grid.arrows) {
            val order = trail.mapNotNull { (r, c) -> island[r][c].takeIf { it >= 0 } }
            order.forEach { crossings[it]++ }
            if (order.size < 2) return false
            for (i in 1 until order.size) {
                if (!evolvesFrom(islands[order[i - 1]], islands[order[i]])) return false
            }
        }
        return crossings.all { it == 1 }
    }
}

/**
 * Sinkamino (puzzle type 31). Ports:
 *  - answer extraction from frontend/src/extractors/sinkamino.ts
 *  - progress from frontend/src/progress/sinkamino.ts
 *  - completion logic from frontend/src/components/sinkaminoRules.ts (validateSinkamino)
 *
 * A [ShadeMarkEngine] whose "shaded" state is a placed square: a tap cycles a white cell
 * empty -> square -> marked -> empty, and black cells and given squares take no input.
 *
 * answer: { states: number[][] } — rows x cols; 0 = unset, 1 = square, 2 = marked; black
 *   cells and given squares are always 0. userValues are keyed "col,row", like the web.
 */
object SinkaminoEngine : ShadeMarkEngine {
    override val puzzleType: Int = 31

    const val UNSET = ShadeCycle.EMPTY
    const val SQUARE = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    fun parse(puzzle: Puzzle): SinkaminoGrid = SinkaminoRules.parse(puzzle.canonRepr)

    private fun isOpen(grid: SinkaminoGrid, r: Int, c: Int): Boolean = grid.cellAt(r, c) == SinkaminoRules.WHITE

    override fun shadeGroup(puzzle: Puzzle, col: Int, row: Int): ShadeGroup? =
        if (isOpen(parse(puzzle), row, col)) ShadeGroup(listOf(col to row)) else null

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val grid = parse(puzzle)
        val states = JsonArray((0 until grid.rows).map { r ->
            JsonArray((0 until grid.cols).map { c ->
                JsonPrimitive(if (isOpen(grid, r, c)) userValues[cellKey(c, r)] ?: UNSET else UNSET)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /** White cells set to square or marked / white cells * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val grid = parse(puzzle)
        var total = 0
        var assigned = 0
        for (r in 0 until grid.rows) {
            for (c in 0 until grid.cols) {
                if (!isOpen(grid, r, c)) continue
                total++
                if ((userValues[cellKey(c, r)] ?: UNSET) != UNSET) assigned++
            }
        }
        if (total < 1) return 0.0
        return (assigned.toDouble() / total * 100.0).coerceAtMost(100.0)
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val grid = parse(puzzle)
        val states = answer["states"] as? JsonArray
        val result = mutableMapOf<String, Int>()
        for (r in 0 until grid.rows) {
            val rowArr = states?.getOrNull(r) as? JsonArray
            for (c in 0 until grid.cols) {
                if (!isOpen(grid, r, c)) continue
                val v = (rowArr?.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (v == SQUARE || v == MARKED) result[cellKey(c, r)] = v
            }
        }
        return result
    }

    /** The squares on the board: givens plus placed squares on white cells. */
    fun squares(grid: SinkaminoGrid, userValues: Map<String, Int>): Set<Pair<Int, Int>> = buildSet {
        for (r in 0 until grid.rows) {
            for (c in 0 until grid.cols) {
                val cell = grid.cellAt(r, c)
                if (cell == SinkaminoRules.GIVEN ||
                    (cell == SinkaminoRules.WHITE && userValues[cellKey(c, r)] == SQUARE)
                ) add(r to c)
            }
        }
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val grid = parse(puzzle)
        return SinkaminoRules.isSolved(grid, squares(grid, userValues))
    }
}
