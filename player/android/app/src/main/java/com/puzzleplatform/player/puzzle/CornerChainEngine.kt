package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * Corner Chain (puzzle type 30). Ports the completion logic of
 * frontend/src/components/CornerChainBoard.tsx (validateCornerChain).
 *
 * Canon, answer, input and progress are Nurikabe's exactly — canon `{ cells }` with
 * 0 = empty / positive = clue, answer `{ states }` with 0 unset / 1 black / 2 marked,
 * userValues keyed "col,row", read-only clue cells — so those delegate to
 * [NurikabeEngine] (it reads only the canon, never the puzzle type). Only the rules
 * differ:
 *  1. each island's size equals every clue inside it (any number of clues, or none),
 *  2. an even-sized island is a rectangle, an odd-sized island is not,
 *  3. all islands link into one network through cells touching at a corner.
 * Black cells have no connectivity requirement.
 */
object CornerChainEngine : ShadeMarkEngine {
    override val puzzleType: Int = 30

    override fun cellKey(col: Int, row: Int): String = NurikabeEngine.cellKey(col, row)

    override fun shadeGroup(puzzle: Puzzle, col: Int, row: Int): ShadeGroup? =
        NurikabeEngine.shadeGroup(puzzle, col, row)

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject =
        NurikabeEngine.extractAnswer(puzzle, userValues)

    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double =
        NurikabeEngine.computeProgress(puzzle, userValues)

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> =
        NurikabeEngine.restoreUserValues(puzzle, answer)

    /** True when the current paint is a full, valid solution. Marks count as white. */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = NurikabeEngine.parseCells(puzzle)
        val rows = cells.size
        val cols = cells.maxOfOrNull { it.size } ?: 0
        if (rows == 0 || cols == 0) return false
        fun isBlack(r: Int, c: Int) = (userValues[cellKey(c, r)] ?: ShadeCycle.EMPTY) == ShadeCycle.SHADED
        val dirs = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)

        // Label islands and check size, clues and shape.
        val island = Array(rows) { IntArray(cols) { -1 } }
        var islandCount = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (isBlack(r, c) || island[r][c] >= 0) continue
                val id = islandCount++
                val stack = ArrayDeque<Pair<Int, Int>>()
                island[r][c] = id
                stack.addLast(r to c)
                var size = 0
                var minR = r; var maxR = r; var minC = c; var maxC = c
                val clues = ArrayList<Int>()
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    size++
                    minR = minOf(minR, cr); maxR = maxOf(maxR, cr)
                    minC = minOf(minC, cc); maxC = maxOf(maxC, cc)
                    val clue = cells.getOrNull(cr)?.getOrNull(cc) ?: 0
                    if (clue > 0) clues.add(clue)
                    for ((dr, dc) in dirs) {
                        val nr = cr + dr
                        val nc = cc + dc
                        if (nr in 0 until rows && nc in 0 until cols && island[nr][nc] < 0 && !isBlack(nr, nc)) {
                            island[nr][nc] = id
                            stack.addLast(nr to nc)
                        }
                    }
                }
                if (clues.any { it != size }) return false
                val isRect = size == (maxR - minR + 1) * (maxC - minC + 1)
                if ((size % 2 == 0) != isRect) return false
            }
        }
        if (islandCount == 0) return false

        // Union islands that touch at a corner, then require a single network.
        val parent = IntArray(islandCount) { it }
        fun find(x: Int): Int {
            var y = x
            while (parent[y] != y) {
                parent[y] = parent[parent[y]]
                y = parent[y]
            }
            return y
        }
        var networks = islandCount
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                val a = island[r][c]
                if (a < 0) continue
                for (nc in intArrayOf(c - 1, c + 1)) {
                    if (nc !in 0 until cols) continue
                    val b = island[r + 1][nc]
                    if (b < 0) continue
                    val ra = find(a)
                    val rb = find(b)
                    if (ra != rb) {
                        parent[ra] = rb
                        networks--
                    }
                }
            }
        }
        return networks == 1
    }
}
