package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Choco Banana (puzzle type 16). Ports:
 *  - answer extraction from frontend/src/extractors/chocoBanana.ts
 *  - progress from frontend/src/progress/chocoBanana.ts
 *  - completion logic from frontend/src/components/ChocoBananaBoard.tsx (validateSolution)
 *
 * canonRepr: { cells: number[][] } — rows x cols; 0 = no clue, N > 0 = the size of the
 *   connected group (shaded or not) the cell belongs to. Clue cells are playable too.
 *
 * answer: { states: number[][] } — 0 = unknown, 1 = shaded (chocolate), 2 = marked (banana);
 *   0 and 2 both count as unshaded.
 *
 * userValues are keyed "c:col,row" -> state, the web board's transport. A shade/mark
 * puzzle, so a tap cycles empty -> shaded -> marked -> empty via the shared [ShadeCycle].
 */
object ChocoBananaEngine : ShadeMarkEngine {
    override val puzzleType: Int = 16

    const val UNKNOWN = ShadeCycle.EMPTY
    const val SHADED = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    override fun cellKey(col: Int, row: Int): String = "c:$col,$row"

    fun parseCells(puzzle: Puzzle): List<List<Int>> = MasyuEngine.parseCells(puzzle)

    private fun dims(cells: List<List<Int>>) = cells.size to (cells.maxOfOrNull { it.size } ?: 0)

    private fun state(userValues: Map<String, Int>, col: Int, row: Int): Int =
        (userValues[cellKey(col, row)] ?: UNKNOWN).takeIf { it == SHADED || it == MARKED } ?: UNKNOWN

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val (rows, cols) = dims(parseCells(puzzle))
        val states = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c -> JsonPrimitive(state(userValues, c, r)) })
        })
        return JsonObject(mapOf("states" to states))
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val (rows, cols) = dims(parseCells(puzzle))
        val states = answer["states"] as? JsonArray ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        for (r in 0 until rows) {
            val row = states.getOrNull(r) as? JsonArray ?: continue
            for (c in 0 until cols) {
                val v = (row.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNKNOWN
                if (v == SHADED || v == MARKED) result[cellKey(c, r)] = v
            }
        }
        return result
    }

    /** Cells marked shaded or banana / all cells * 100. */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val (rows, cols) = dims(parseCells(puzzle))
        if (rows * cols == 0) return 0.0
        var decided = 0
        for (r in 0 until rows) for (c in 0 until cols) if (state(userValues, c, r) != UNKNOWN) decided++
        return decided.toDouble() / (rows * cols) * 100.0
    }

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val shaded = Array(rows) { r -> BooleanArray(cols) { c -> state(userValues, c, r) == SHADED } }
        return isSolved(cells, shaded)
    }

    /**
     * Every shaded group is a rectangle, every unshaded group is not, and every clue equals
     * the size of its group. Groups are orthogonally connected cells of one kind.
     */
    fun isSolved(cells: List<List<Int>>, shaded: Array<BooleanArray>): Boolean {
        val rows = shaded.size
        val cols = shaded.firstOrNull()?.size ?: 0
        for (group in groups(shaded)) {
            val isRect = isRectangle(group)
            val (r0, c0) = group.first()
            if (shaded[r0][c0] != isRect) return false
            for ((r, c) in group) {
                val clue = cells.getOrNull(r)?.getOrNull(c) ?: 0
                if (clue > 0 && clue != group.size) return false
            }
        }
        return rows > 0 && cols > 0
    }

    /** Connected groups of same-kind cells, each as (row, col) cells. */
    fun groups(shaded: Array<BooleanArray>): List<List<Pair<Int, Int>>> {
        val rows = shaded.size
        val cols = shaded.firstOrNull()?.size ?: 0
        val seen = Array(rows) { BooleanArray(cols) }
        val out = mutableListOf<List<Pair<Int, Int>>>()
        for (r in 0 until rows) for (c in 0 until cols) {
            if (seen[r][c]) continue
            val kind = shaded[r][c]
            val group = mutableListOf<Pair<Int, Int>>()
            val stack = ArrayDeque(listOf(r to c))
            seen[r][c] = true
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                group.add(cr to cc)
                for ((dr, dc) in listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)) {
                    val nr = cr + dr
                    val nc = cc + dc
                    if (nr !in 0 until rows || nc !in 0 until cols || seen[nr][nc] || shaded[nr][nc] != kind) continue
                    seen[nr][nc] = true
                    stack.addLast(nr to nc)
                }
            }
            out.add(group)
        }
        return out
    }

    /** A connected group is a solid rectangle iff it fills its bounding box. */
    fun isRectangle(group: List<Pair<Int, Int>>): Boolean {
        val h = group.maxOf { it.first } - group.minOf { it.first } + 1
        val w = group.maxOf { it.second } - group.minOf { it.second } + 1
        return h * w == group.size
    }
}
