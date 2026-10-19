package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Hitori (puzzle type 26). Ports:
 *  - answer extraction from frontend/src/extractors/hitori.ts
 *  - progress from frontend/src/progress/hitori.ts
 *  - completion logic from frontend/src/components/HitoriBoard.tsx (validateSolution)
 *
 * canonRepr: { cells: number[][] } — rows x cols; every cell is a positive integer. Unlike
 *   Nurikabe there are no clue/read-only cells: every cell is playable and keeps showing its
 *   number so the player can check for remaining duplicates.
 *
 * answer: { states: number[][] } — rows x cols; 0 = unset, 1 = shaded (removed),
 *   2 = marked (a solver-aid circle on a cell the player has decided stays unshaded). Both
 *   0 and 2 count as unshaded.
 *
 * User input rides in the flat userValues map keyed "col,row" -> state (col first), matching
 * the web client's transport exactly so extracted answers are byte-identical and snapshots
 * sync cross-platform. Hitori is a shade/mark puzzle, so a tap cycles empty -> shaded ->
 * marked -> empty via the shared [ShadeCycle].
 */
object HitoriEngine : ShadeMarkEngine {
    override val puzzleType: Int = 26

    const val UNSET = ShadeCycle.EMPTY
    const val SHADED = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    /** Build the flat userValues key for the cell at (col, row) — col,row order, like the web board. */
    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    /** Parse the rows x cols number grid from a puzzle's canonRepr; missing/invalid -> 0. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> {
        val outer = puzzle.canonRepr["cells"] as? JsonArray ?: return emptyList()
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

    // Every cell is playable, so the default shadeGroup (the single tapped cell) is correct;
    // no shadeGroup override is needed.

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val states = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c ->
                JsonPrimitive(userValues[cellKey(c, r)] ?: UNSET)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /**
     * Progress = cells set to shaded or marked / total cells * 100. Every Hitori cell is a
     * decision, so the denominator is the whole grid. Mirrors frontend/src/progress/hitori.ts.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val total = rows * cols
        if (total < 1) return 0.0
        var assigned = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((userValues[cellKey(c, r)] ?: UNSET) != UNSET) assigned++
            }
        }
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
                val v = (rowArr?.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (v == SHADED || v == MARKED) result[cellKey(c, r)] = v
            }
        }
        return result
    }

    /** True when the cell at (r,c) is shaded. Marks and unset both read as unshaded. */
    private fun isShaded(userValues: Map<String, Int>, r: Int, c: Int): Boolean =
        (userValues[cellKey(c, r)] ?: UNSET) == SHADED

    /**
     * True when the current paint is a full, valid Hitori solution (port of
     * HitoriBoard.tsx validateSolution). Cells in state 0 (unset) and 2 (marked) both
     * count as unshaded:
     *  1. no value repeats among the unshaded cells of any row or column,
     *  2. no two shaded cells are orthogonally adjacent,
     *  3. all unshaded cells form one orthogonally connected region.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val dirs = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)

        // 1. Row/column uniqueness among unshaded cells.
        for (r in 0 until rows) {
            val seen = HashSet<Int>()
            for (c in 0 until cols) {
                if (isShaded(userValues, r, c)) continue
                val v = cells.getOrNull(r)?.getOrNull(c) ?: continue
                if (!seen.add(v)) return false
            }
        }
        for (c in 0 until cols) {
            val seen = HashSet<Int>()
            for (r in 0 until rows) {
                if (isShaded(userValues, r, c)) continue
                val v = cells.getOrNull(r)?.getOrNull(c) ?: continue
                if (!seen.add(v)) return false
            }
        }

        // 2. No orthogonally adjacent shaded cells (checking right and down suffices).
        var unshaded = 0
        var start: Pair<Int, Int>? = null
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (isShaded(userValues, r, c)) {
                    if (c + 1 < cols && isShaded(userValues, r, c + 1)) return false
                    if (r + 1 < rows && isShaded(userValues, r + 1, c)) return false
                } else {
                    unshaded++
                    if (start == null) start = r to c
                }
            }
        }
        val origin = start ?: return false

        // 3. Unshaded cells are connected.
        val visited = Array(rows) { BooleanArray(cols) }
        val stack = ArrayDeque<Pair<Int, Int>>()
        visited[origin.first][origin.second] = true
        stack.addLast(origin)
        var reached = 0
        while (stack.isNotEmpty()) {
            val (cr, cc) = stack.removeLast()
            reached++
            for ((dr, dc) in dirs) {
                val nr = cr + dr
                val nc = cc + dc
                if (nr in 0 until rows && nc in 0 until cols &&
                    !visited[nr][nc] && !isShaded(userValues, nr, nc)
                ) {
                    visited[nr][nc] = true
                    stack.addLast(nr to nc)
                }
            }
        }
        return reached == unshaded
    }
}
