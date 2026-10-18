package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Akari / Light Up (puzzle type 18). Ports:
 *  - answer extraction from frontend/src/extractors/akari.ts
 *  - progress from frontend/src/progress/akari.ts
 *  - illumination + completion logic from frontend/src/components/AkariBoard.tsx
 *    (computeIllumination / validateSolution)
 *
 * canonRepr: { cells: number[][] } — rows x cols; -1 = white (playable) cell, 0..4 = black
 *   wall with that number, 5 = black wall with no number. Walls are read-only.
 *
 * answer: { states: number[][] } — rows x cols; 0 = empty, 1 = bulb, 2 = dot mark (the
 *   player asserts no bulb). Walls always read 0.
 *
 * User input rides in the flat userValues map keyed "col,row" -> state, matching the web
 * client's transport so extracted answers are byte-identical and snapshots sync
 * cross-platform. A bulb is the shared shade/mark cycle's "shaded" state, so a tap cycles
 * empty -> bulb -> dot -> empty, the web board's left-click order.
 */
object AkariEngine : ShadeMarkEngine {
    override val puzzleType: Int = 18

    const val EMPTY = ShadeCycle.EMPTY
    const val BULB = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    /** The canon value of a white (playable) cell; anything else is a wall. */
    const val WHITE = -1

    private val DIRS = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)

    /** Build the flat userValues key for the cell at (col, row) — col,row order, like the web board. */
    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    /** Parse the rows x cols cell grid from a puzzle's canonRepr; missing/invalid -> white. */
    fun parseCells(puzzle: Puzzle): List<List<Int>> {
        val outer = puzzle.canonRepr["cells"] as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Int>()
            rowArr.map { (it as? JsonPrimitive)?.intOrNull ?: WHITE }
        }
    }

    private fun dims(cells: List<List<Int>>): Pair<Int, Int> =
        cells.size to (cells.maxOfOrNull { it.size } ?: 0)

    /** True when (r,c) is a black wall (numbered or not). Out-of-range reads as a wall. */
    fun isWall(cells: List<List<Int>>, r: Int, c: Int): Boolean =
        (cells.getOrNull(r)?.getOrNull(c) ?: 5) != WHITE

    /** A tap cycles the single cell; walls take no input. */
    override fun shadeGroup(puzzle: Puzzle, col: Int, row: Int): ShadeGroup? =
        if (isWall(parseCells(puzzle), row, col)) null else ShadeGroup(listOf(col to row))

    private fun hasBulb(cells: List<List<Int>>, userValues: Map<String, Int>, r: Int, c: Int): Boolean =
        !isWall(cells, r, c) && (userValues[cellKey(c, r)] ?: EMPTY) == BULB

    /**
     * Which white cells are lit, and which bulbs see another bulb ([conflict]), both
     * indexed [row][col]. A bulb lights its own cell and shines along its row and column
     * until a wall or the edge.
     */
    class Illumination(val lit: Array<BooleanArray>, val conflict: Array<BooleanArray>)

    fun illuminate(cells: List<List<Int>>, userValues: Map<String, Int>): Illumination {
        val (rows, cols) = dims(cells)
        val lit = Array(rows) { BooleanArray(cols) }
        val conflict = Array(rows) { BooleanArray(cols) }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!hasBulb(cells, userValues, r, c)) continue
                lit[r][c] = true
                for ((dr, dc) in DIRS) {
                    var nr = r + dr
                    var nc = c + dc
                    while (nr in 0 until rows && nc in 0 until cols && !isWall(cells, nr, nc)) {
                        lit[nr][nc] = true
                        if (hasBulb(cells, userValues, nr, nc)) {
                            conflict[r][c] = true
                            conflict[nr][nc] = true
                            break
                        }
                        nr += dr
                        nc += dc
                    }
                }
            }
        }
        return Illumination(lit, conflict)
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val states = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c ->
                // Walls always 0; white cells mirror the player's state (web passes the
                // stored value through, and the board only ever stores 1 or 2).
                val v = if (isWall(cells, r, c)) EMPTY else (userValues[cellKey(c, r)] ?: EMPTY)
                JsonPrimitive(v)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /**
     * Progress = white cells lit by at least one bulb / total white cells * 100 (bulb cells
     * count as lit). 100 when the board has no white cells. Mirrors
     * frontend/src/progress/akari.ts.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val lit = illuminate(cells, userValues).lit
        var white = 0
        var litCount = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (isWall(cells, r, c)) continue
                white++
                if (lit[r][c]) litCount++
            }
        }
        if (white == 0) return 100.0
        return litCount.toDouble() / white * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val states = answer["states"] as? JsonArray
        val result = mutableMapOf<String, Int>()
        for (r in 0 until rows) {
            val rowArr = states?.getOrNull(r) as? JsonArray
            for (c in 0 until cols) {
                if (isWall(cells, r, c)) continue
                val v = (rowArr?.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: EMPTY
                if (v == BULB || v == MARKED) result[cellKey(c, r)] = v
            }
        }
        return result
    }

    /**
     * True when the bulbs solve the puzzle (port of AkariBoard.tsx validateSolution):
     *  1. no bulb lights another,
     *  2. every white cell is lit,
     *  3. each numbered wall (0..4) has exactly that many orthogonally adjacent bulbs.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val illumination = illuminate(cells, userValues)
        val lit = illumination.lit
        val conflict = illumination.conflict
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (conflict[r][c]) return false
                if (!isWall(cells, r, c) && !lit[r][c]) return false
            }
        }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = cells.getOrNull(r)?.getOrNull(c) ?: continue
                if (clue !in 0..4) continue
                val adjacent = DIRS.count { (dr, dc) -> hasBulb(cells, userValues, r + dr, c + dc) }
                if (adjacent != clue) return false
            }
        }
        return true
    }
}
