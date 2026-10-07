package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Nurikabe (puzzle type 24). Ports:
 *  - answer extraction from frontend/src/extractors/nurikabe.ts
 *  - progress from frontend/src/progress/nurikabe.ts
 *  - completion logic from frontend/src/components/NurikabeBoard.tsx (validateSolution)
 *
 * canonRepr: { cells: number[][] } — rows x cols; 0 = empty cell, a positive integer is
 *   an island clue placed in that cell (its white island must hold exactly that many
 *   cells). Clue cells are fixed white by rule and are read-only.
 *
 * answer: { states: number[][] } — rows x cols; 0 = unset, 1 = black (sea),
 *   2 = white-marked (a solver-aid dot on a cell the player believes is island/white).
 *
 * User input rides in the flat userValues map keyed "col,row" -> state (col first),
 * matching the web client's transport exactly so extracted answers are byte-identical
 * and snapshots sync cross-platform. Unlike LITS, both the shade (1) and the mark (2)
 * live in the one `states` grid the web extractor already emits, so there's no separate
 * Android-only marks layer — the white-mark is a first-class answer value here.
 */
object NurikabeEngine : PuzzleEngine {
    override val puzzleType: Int = 24

    const val UNSET = 0
    const val BLACK = 1
    const val MARKED = 2

    /** Build the flat userValues key for the cell at (col, row) — col,row order, like the web board. */
    fun cellKey(col: Int, row: Int): String = "$col,$row"

    /** Parse the rows x cols clue grid from a puzzle's canonRepr; missing/invalid -> 0. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> = parseGrid(puzzle.canonRepr["cells"])

    private fun parseGrid(element: Any?): List<List<Int>> {
        val outer = element as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Int>()
            rowArr.map { (it as? JsonPrimitive)?.intOrNull ?: 0 }
        }
    }

    private fun dims(cells: List<List<Int>>): Pair<Int, Int> {
        val rows = cells.size
        // Web keys dimensions off cells[0].length; tolerate ragged input with max.
        val cols = cells.maxOfOrNull { it.size } ?: 0
        return rows to cols
    }

    /** True when (r,c) carries a positive clue — such cells are fixed white and read-only. */
    fun isClue(cells: List<List<Int>>, r: Int, c: Int): Boolean =
        (cells.getOrNull(r)?.getOrNull(c) ?: 0) > 0

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val states = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c ->
                // Clue cells are read-only (always white) -> always 0; everything else
                // mirrors the player's state (1 = black, 2 = white-marked, else 0).
                val v = if (isClue(cells, r, c)) UNSET else (userValues[cellKey(c, r)] ?: UNSET)
                JsonPrimitive(v)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /**
     * Progress = non-clue cells assigned a state (black or white-marked) / total non-clue
     * cells * 100. Clue cells are fixed white by rule, so they're excluded from both the
     * numerator and denominator. Mirrors frontend/src/progress/nurikabe.ts.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        var total = 0
        var assigned = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (isClue(cells, r, c)) continue
                total++
                if ((userValues[cellKey(c, r)] ?: UNSET) != UNSET) assigned++
            }
        }
        if (total < 1) return 0.0
        return (assigned.toDouble() / total * 100.0).coerceAtMost(100.0)
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val states = answer["states"] as? JsonArray
        val result = mutableMapOf<String, Int>()
        for (r in 0 until rows) {
            val rowArr = states?.getOrNull(r) as? JsonArray
            for (c in 0 until cols) {
                if (isClue(cells, r, c)) continue // clue cells are read-only
                val v = (rowArr?.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (v == BLACK || v == MARKED) result[cellKey(c, r)] = v
            }
        }
        return result
    }

    /** True when the cell at (r,c) is painted black (sea). Marks and clues read as white. */
    private fun isBlack(userValues: Map<String, Int>, r: Int, c: Int): Boolean =
        (userValues[cellKey(c, r)] ?: UNSET) == BLACK

    /**
     * True when the current paint is a full, valid Nurikabe solution (port of
     * NurikabeBoard.tsx validateSolution):
     *  1. all black cells form one orthogonally-connected sea (and there's at least one),
     *  2. no 2x2 area is entirely black ("no pools"),
     *  3. each white (non-black) region holds exactly one clue whose value equals the
     *     region's size.
     * White-marked cells (state 2) count as white, exactly like unpainted cells.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val dirs = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)

        // 1. All black cells form a single connected region.
        val blackCells = ArrayList<Pair<Int, Int>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (isBlack(userValues, r, c)) blackCells.add(r to c)
            }
        }
        if (blackCells.isEmpty()) return false
        run {
            val visited = Array(rows) { BooleanArray(cols) }
            val stack = ArrayDeque<Pair<Int, Int>>()
            val (sr, sc) = blackCells[0]
            visited[sr][sc] = true
            stack.addLast(blackCells[0])
            var seen = 0
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                seen++
                for ((dr, dc) in dirs) {
                    val nr = cr + dr
                    val nc = cc + dc
                    if (nr in 0 until rows && nc in 0 until cols &&
                        !visited[nr][nc] && isBlack(userValues, nr, nc)
                    ) {
                        visited[nr][nc] = true
                        stack.addLast(nr to nc)
                    }
                }
            }
            if (seen != blackCells.size) return false
        }

        // 2. No 2x2 all-black pool.
        for (r in 0 until rows - 1) {
            for (c in 0 until cols - 1) {
                if (isBlack(userValues, r, c) && isBlack(userValues, r, c + 1) &&
                    isBlack(userValues, r + 1, c) && isBlack(userValues, r + 1, c + 1)
                ) return false
            }
        }

        // 3. Each white region holds exactly one clue equal to its size.
        val visited = Array(rows) { BooleanArray(cols) }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (isBlack(userValues, r, c) || visited[r][c]) continue
                val stack = ArrayDeque<Pair<Int, Int>>()
                visited[r][c] = true
                stack.addLast(r to c)
                var size = 0
                var clueCount = 0
                var clueValue = 0
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    size++
                    val clue = cells.getOrNull(cr)?.getOrNull(cc) ?: 0
                    if (clue > 0) {
                        clueCount++
                        clueValue = clue
                    }
                    for ((dr, dc) in dirs) {
                        val nr = cr + dr
                        val nc = cc + dc
                        if (nr in 0 until rows && nc in 0 until cols &&
                            !visited[nr][nc] && !isBlack(userValues, nr, nc)
                        ) {
                            visited[nr][nc] = true
                            stack.addLast(nr to nc)
                        }
                    }
                }
                if (clueCount != 1) return false
                if (clueValue != size) return false
            }
        }
        return true
    }
}
