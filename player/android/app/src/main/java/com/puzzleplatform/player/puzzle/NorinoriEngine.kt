package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Norinori (puzzle type 23). Ports:
 *  - answer extraction from frontend/src/extractors/norinori.ts
 *  - progress from frontend/src/progress/norinori.ts
 *  - region flood-fill + full completion validation from
 *    frontend/src/components/NorinoriBoard.tsx (computeRegions / validateSolution).
 *
 * The grid is pre-divided into regions by thick borders (same canon shape as LITS); the
 * player shades cells so that every region holds exactly two shaded cells and all shaded
 * cells partition into dominoes (each shaded cell is orthogonally adjacent to exactly one
 * other shaded cell). Dominoes may cross region boundaries.
 *
 * canonRepr: { grids: { h: number[][], v: number[][] } } — the thick-border grids.
 *   - h: (rows-1) x cols; h[r][c] = 1 is a thick border below cell (r,c).
 *   - v: rows x (cols-1); v[r][c] = 1 is a thick border right of cell (r,c).
 *   rows = h.length + 1, cols = v[0].length + 1 (matching the web board's derivation).
 *
 * answer: { states: number[][] } — rows x cols; 0 = empty, 1 = shaded, 2 = marked. The full
 *   grid is emitted (including 0s), matching the web extractor exactly so answers are
 *   byte-identical and snapshots sync cross-platform. Both shaded and marked cells are
 *   persisted: a mark (a solver-aid dot meaning "definitely not shaded") is real player
 *   input, not noise, so it survives save/restore. The legacy web shape { shaded } (shaded
 *   cells only, marks dropped) is still read on restore for answers saved before marks were
 *   persisted.
 *
 * User input rides in the flat userValues map keyed "c:col,row" -> state (web convention),
 * with empty cells absent. Input is cell-level: a tap cycles a single cell empty -> shaded
 * -> marked -> empty. Marked (2) counts as NOT shaded for every rule.
 */
object NorinoriEngine : ShadeMarkEngine {
    override val puzzleType: Int = 23

    const val EMPTY = ShadeCycle.EMPTY
    const val SHADED = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    /** Build the flat userValues key for the cell at (col, row) — col,row order, like the web board. */
    override fun cellKey(col: Int, row: Int): String = "c:$col,$row"

    /** The thick-border grids. h: (rows-1) x cols, v: rows x (cols-1). */
    class Grids(val h: List<List<Int>>, val v: List<List<Int>>) {
        val rows: Int get() = h.size + 1
        // Keyed off v[0] like the web board (cols = v[0].length + 1); 0 when degenerate.
        val cols: Int get() = (v.firstOrNull()?.size ?: -1) + 1
    }

    /** Parse grids.h / grids.v from a puzzle's canonRepr; missing/invalid -> empty. */
    fun parseGrids(puzzle: Puzzle): Grids {
        val grids = puzzle.canonRepr["grids"] as? JsonObject
        return Grids(parseGrid(grids?.get("h")), parseGrid(grids?.get("v")))
    }

    private fun parseGrid(element: Any?): List<List<Int>> {
        val outer = element as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Int>()
            rowArr.map { (it as? JsonPrimitive)?.intOrNull ?: 0 }
        }
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val grids = parseGrids(puzzle)
        val rows = grids.rows
        val cols = grids.cols
        // Full grid, including 0s and marks — matches the web extractor (states[r][c] = val).
        val states = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c ->
                val v = userValues[cellKey(c, r)] ?: EMPTY
                JsonPrimitive(if (v == SHADED || v == MARKED) v else EMPTY)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /**
     * Progress = regions holding exactly two shaded cells / total regions * 100.
     * Mirrors frontend/src/progress/norinori.ts exactly (marks don't contribute).
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val grids = parseGrids(puzzle)
        val rows = grids.rows
        val cols = grids.cols
        if (rows <= 0 || cols <= 0) return 0.0

        val regionIds = computeRegions(rows, cols, grids)
        val shaded = shadedSet(rows, cols, userValues)

        val shadedCounts = HashMap<Int, Int>()
        val allRegions = HashSet<Int>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                allRegions.add(regionIds[r][c])
                if (shaded.contains(r to c)) {
                    shadedCounts[regionIds[r][c]] = (shadedCounts[regionIds[r][c]] ?: 0) + 1
                }
            }
        }
        if (allRegions.isEmpty()) return 0.0

        val validRegions = allRegions.count { (shadedCounts[it] ?: 0) == 2 }
        return validRegions.toDouble() / allRegions.size * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val grids = parseGrids(puzzle)
        val rows = grids.rows
        val cols = grids.cols
        val result = mutableMapOf<String, Int>()

        // Prefer the tri-state "states" grid; fall back to the legacy "shaded" (shaded-only)
        // shape for answers saved before marks were persisted.
        val states = answer["states"] as? JsonArray
        if (states != null) {
            for (r in 0 until rows) {
                val rowArr = states.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    val state = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: EMPTY
                    if (state == SHADED || state == MARKED) result[cellKey(c, r)] = state
                }
            }
            return result
        }
        val shaded = answer["shaded"] as? JsonArray ?: return result
        for (r in 0 until rows) {
            val rowArr = shaded.getOrNull(r) as? JsonArray ?: continue
            for (c in 0 until cols) {
                if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[cellKey(c, r)] = SHADED
            }
        }
        return result
    }

    /**
     * True when the shaded cells form a valid Norinori solution (port of NorinoriBoard.tsx
     * validateSolution):
     *  1. every region contains exactly two shaded cells,
     *  2. every shaded cell has exactly one orthogonally-adjacent shaded cell (so all shaded
     *     cells partition into dominoes; dominoes may cross region boundaries),
     *  3. there is at least one shaded cell.
     * Marked (2) and empty (0) cells both count as not shaded.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val grids = parseGrids(puzzle)
        val rows = grids.rows
        val cols = grids.cols
        if (rows <= 0 || cols <= 0) return false

        val regionIds = computeRegions(rows, cols, grids)
        val shaded = shadedSet(rows, cols, userValues)
        if (shaded.isEmpty()) return false

        // 1. Exactly two shaded cells per region.
        val shadedCounts = HashMap<Int, Int>()
        val allRegions = HashSet<Int>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                allRegions.add(regionIds[r][c])
                if (shaded.contains(r to c)) {
                    shadedCounts[regionIds[r][c]] = (shadedCounts[regionIds[r][c]] ?: 0) + 1
                }
            }
        }
        for (rid in allRegions) {
            if ((shadedCounts[rid] ?: 0) != 2) return false
        }

        // 2. Every shaded cell has exactly one shaded orthogonal neighbor.
        for ((r, c) in shaded) {
            var neighbors = 0
            for ((dr, dc) in DIRS) {
                if (shaded.contains((r + dr) to (c + dc))) neighbors++
            }
            if (neighbors != 1) return false
        }

        return true
    }

    // -- shared helpers (ports of the web board) --------------------------------

    /** The set of shaded (state 1) cells as (row, col) pairs. */
    private fun shadedSet(rows: Int, cols: Int, userValues: Map<String, Int>): Set<Pair<Int, Int>> {
        val set = HashSet<Pair<Int, Int>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((userValues[cellKey(c, r)] ?: EMPTY) == SHADED) set.add(r to c)
            }
        }
        return set
    }

    /**
     * Flood-fill the grid into regions, treating a thick border between two cells as a
     * barrier (port of NorinoriBoard.tsx computeRegions). Returns a rows x cols grid of ids.
     */
    fun computeRegions(rows: Int, cols: Int, grids: Grids): Array<IntArray> {
        val h = grids.h
        val v = grids.v
        val regionIds = Array(rows) { IntArray(cols) { -1 } }
        var nextId = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (regionIds[r][c] >= 0) continue
                val id = nextId++
                val stack = ArrayDeque<Pair<Int, Int>>()
                regionIds[r][c] = id
                stack.addLast(r to c)
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    // up: border h[cr-1][cc]
                    if (cr > 0 && regionIds[cr - 1][cc] < 0 && edge(h, cr - 1, cc) == 0) {
                        regionIds[cr - 1][cc] = id; stack.addLast(cr - 1 to cc)
                    }
                    // down: border h[cr][cc]
                    if (cr < rows - 1 && regionIds[cr + 1][cc] < 0 && edge(h, cr, cc) == 0) {
                        regionIds[cr + 1][cc] = id; stack.addLast(cr + 1 to cc)
                    }
                    // left: border v[cr][cc-1]
                    if (cc > 0 && regionIds[cr][cc - 1] < 0 && edge(v, cr, cc - 1) == 0) {
                        regionIds[cr][cc - 1] = id; stack.addLast(cr to cc - 1)
                    }
                    // right: border v[cr][cc]
                    if (cc < cols - 1 && regionIds[cr][cc + 1] < 0 && edge(v, cr, cc) == 0) {
                        regionIds[cr][cc + 1] = id; stack.addLast(cr to cc + 1)
                    }
                }
            }
        }
        return regionIds
    }

    /** Safe border lookup; a missing/ragged entry reads as 0 (thin), never a barrier. */
    private fun edge(grid: List<List<Int>>, r: Int, c: Int): Int =
        grid.getOrNull(r)?.getOrNull(c) ?: 0

    private val DIRS = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)
}
