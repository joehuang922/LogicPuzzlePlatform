package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * LITS (puzzle type 15). Ports:
 *  - answer extraction from frontend/src/extractors/lits.ts
 *  - progress from frontend/src/progress/lits.ts
 *  - region flood-fill, tetromino classification + completion logic from
 *    frontend/src/components/LitsBoard.tsx (computeRegions / validateSolution).
 *
 * The grid is pre-divided into regions by thick borders; the player shades exactly one
 * L/I/T/S tetromino in each region (the O square is not allowed).
 *
 * canonRepr: { grids: { h: number[][], v: number[][] } } — the thick-border grids.
 *   - h: (rows-1) x cols; h[r][c] = 1 is a thick border below cell (r,c).
 *   - v: rows x (cols-1); v[r][c] = 1 is a thick border right of cell (r,c).
 *   rows = h.length + 1, cols = v[0].length + 1 (matching the web board's derivation).
 *
 * answer: { shaded: number[][] } — rows x cols; 1 = shaded, 0 = not (mirrors the web
 *   extractor, which only emits the shaded 1s).
 *
 * User input rides in the flat userValues map keyed "c:col,row" -> state, matching the
 * web board's transport exactly so extracted answers are byte-identical and snapshots
 * sync cross-platform. Two cell states carry input:
 *   - 1 = shaded (black), the only state that matters for the rules.
 *   - 2 = marked (a solver-aid dot meaning "definitely not shaded"); counts as NOT shaded.
 * Like the Nonogram port, marks (state 2) are PERSISTED in the saved answer under a
 * separate "marks" grid — the web extractor drops them, but a player's marks are a
 * solving aid that should survive save/restore. This stays forward-compatible with web:
 * the web renderer reads only answer.shaded, so a persisted "marks" grid is ignored there.
 */
object LitsEngine : PuzzleEngine {
    override val puzzleType: Int = 15

    const val UNSET = 0
    const val SHADED = 1
    const val MARKED = 2

    /** Build the flat userValues key for the cell at (col, row) — note col,row order, like the web board. */
    fun cellKey(col: Int, row: Int): String = "c:$col,$row"

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

        fun grid(predicate: (Int) -> Boolean) = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c ->
                JsonPrimitive(if (predicate(userValues[cellKey(c, r)] ?: UNSET)) 1 else 0)
            })
        })

        // shaded mirrors the web extractor exactly; marks is the Android-only solver-aid
        // layer (ignored by web, which reads only shaded).
        return JsonObject(
            mapOf(
                "shaded" to grid { it == SHADED },
                "marks" to grid { it == MARKED },
            ),
        )
    }

    /**
     * Progress = regions holding a valid tetromino / total regions * 100.
     * Mirrors frontend/src/progress/lits.ts exactly (marks don't contribute).
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val grids = parseGrids(puzzle)
        val rows = grids.rows
        val cols = grids.cols
        if (rows <= 0 || cols <= 0) return 0.0

        val regionIds = computeRegions(rows, cols, grids)
        val shaded = shadedSet(rows, cols, userValues)

        val byRegion = HashMap<Int, MutableList<Pair<Int, Int>>>()
        val allRegions = HashSet<Int>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                allRegions.add(regionIds[r][c])
                if (shaded.contains(r to c)) {
                    byRegion.getOrPut(regionIds[r][c]) { mutableListOf() }.add(r to c)
                }
            }
        }
        if (allRegions.isEmpty()) return 0.0

        val validRegions = byRegion.values.count { isValidTetromino(it) }
        return validRegions.toDouble() / allRegions.size * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val grids = parseGrids(puzzle)
        val rows = grids.rows
        val cols = grids.cols
        val result = mutableMapOf<String, Int>()

        fun readGrid(key: String, state: Int) {
            val arr = answer[key] as? JsonArray ?: return
            for (r in 0 until rows) {
                val rowArr = arr.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[cellKey(c, r)] = state
                }
            }
        }
        readGrid("shaded", SHADED)
        readGrid("marks", MARKED) // Android-only; absent on web-saved answers (no-op then).
        return result
    }

    /**
     * True when the shaded cells form a valid LITS solution (port of LitsBoard.tsx
     * validateSolution):
     *  1. every region holds exactly one valid (connected, non-O) tetromino,
     *  2. all shaded cells form a single orthogonally connected group,
     *  3. no fully-shaded 2x2 area,
     *  4. no two orthogonally adjacent tetrominoes (in different regions) share a shape.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val grids = parseGrids(puzzle)
        val rows = grids.rows
        val cols = grids.cols
        if (rows <= 0 || cols <= 0) return false

        val regionIds = computeRegions(rows, cols, grids)
        val shaded = shadedSet(rows, cols, userValues)

        // Count regions.
        val allRegions = HashSet<Int>()
        for (r in 0 until rows) for (c in 0 until cols) allRegions.add(regionIds[r][c])

        // 1. Every region holds exactly one valid tetromino.
        val regionTypes = classifyRegions(rows, cols, regionIds, shaded)
        if (regionTypes.size != allRegions.size) return false

        // 2. All shaded cells form a single orthogonally connected group.
        val shadedCoords = shaded.toList()
        if (shadedCoords.isEmpty()) return false
        if (!isConnected(shadedCoords)) return false

        // 3. No fully-shaded 2x2 area.
        for (r in 0 until rows - 1) {
            for (c in 0 until cols - 1) {
                if (shaded.contains(r to c) &&
                    shaded.contains(r to c + 1) &&
                    shaded.contains(r + 1 to c) &&
                    shaded.contains(r + 1 to c + 1)
                ) return false
            }
        }

        // 4. No two orthogonally adjacent tetrominoes (different regions) share a shape.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!shaded.contains(r to c)) continue
                val rid = regionIds[r][c]
                for ((dr, dc) in listOf(1 to 0, 0 to 1)) {
                    val nr = r + dr
                    val nc = c + dc
                    if (nr >= rows || nc >= cols) continue
                    if (!shaded.contains(nr to nc)) continue
                    val nrid = regionIds[nr][nc]
                    if (nrid == rid) continue
                    if (regionTypes[rid] == regionTypes[nrid]) return false
                }
            }
        }
        return true
    }

    // -- shared helpers (ports of the web board) --------------------------------

    /** The set of shaded (state 1) cells as (row, col) pairs. */
    private fun shadedSet(rows: Int, cols: Int, userValues: Map<String, Int>): Set<Pair<Int, Int>> {
        val set = HashSet<Pair<Int, Int>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((userValues[cellKey(c, r)] ?: UNSET) == SHADED) set.add(r to c)
            }
        }
        return set
    }

    /**
     * Flood-fill the grid into regions, treating a thick border between two cells as a
     * barrier (port of LitsBoard.tsx computeRegions). Returns a rows x cols grid of ids.
     */
    private fun computeRegions(rows: Int, cols: Int, grids: Grids): Array<IntArray> {
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

    /**
     * Group shaded cells by region and classify each; returns regionId -> letter for
     * regions holding exactly one valid (4-cell, connected, non-O) tetromino.
     */
    private fun classifyRegions(
        rows: Int,
        cols: Int,
        regionIds: Array<IntArray>,
        shaded: Set<Pair<Int, Int>>,
    ): Map<Int, String> {
        val byRegion = HashMap<Int, MutableList<Pair<Int, Int>>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!shaded.contains(r to c)) continue
                byRegion.getOrPut(regionIds[r][c]) { mutableListOf() }.add(r to c)
            }
        }
        val result = HashMap<Int, String>()
        for ((rid, cells) in byRegion) {
            if (cells.size != 4) continue
            if (!isConnected(cells)) continue
            val letter = classifyTetromino(cells) ?: continue
            result[rid] = letter
        }
        return result
    }

    /** A region is "valid" (for progress) when it holds exactly one connected non-O tetromino. */
    private fun isValidTetromino(cells: List<Pair<Int, Int>>): Boolean {
        if (cells.size != 4) return false
        if (!isConnected(cells)) return false
        val letter = classifyTetromino(cells)
        return letter != null && letter != "O"
    }

    private fun isConnected(cells: List<Pair<Int, Int>>): Boolean {
        if (cells.isEmpty()) return false
        val set = cells.toHashSet()
        val visited = HashSet<Pair<Int, Int>>()
        val queue = ArrayDeque<Pair<Int, Int>>()
        queue.addLast(cells[0]); visited.add(cells[0])
        while (queue.isNotEmpty()) {
            val (r, c) = queue.removeLast()
            for ((dr, dc) in listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)) {
                val n = (r + dr) to (c + dc)
                if (set.contains(n) && !visited.contains(n)) { visited.add(n); queue.addLast(n) }
            }
        }
        return visited.size == cells.size
    }

    // -- tetromino classification (port of LitsBoard.tsx) -----------------------

    /** Classify 4 cells: "L"|"I"|"T"|"S", or null if not a valid non-O tetromino. */
    private fun classifyTetromino(coords: List<Pair<Int, Int>>): String? {
        if (coords.size != 4) return null
        val letter = TETROMINO_KEYS[canonicalKey(coords)]
        if (letter == null || letter == "O") return null
        return letter
    }

    /** Reference shapes -> canonical key -> tetromino letter (invariant under rot/reflect). */
    private val TETROMINO_KEYS: Map<String, String> = buildMap {
        val refs = mapOf(
            "I" to listOf(0 to 0, 0 to 1, 0 to 2, 0 to 3),
            "L" to listOf(0 to 0, 1 to 0, 2 to 0, 2 to 1),
            "T" to listOf(0 to 0, 0 to 1, 0 to 2, 1 to 1),
            "S" to listOf(0 to 1, 0 to 2, 1 to 0, 1 to 1),
            "O" to listOf(0 to 0, 0 to 1, 1 to 0, 1 to 1),
        )
        for ((letter, coords) in refs) put(canonicalKey(coords), letter)
    }

    /** Canonical signature invariant under the 4 rotations x 2 reflections. */
    private fun canonicalKey(coords: List<Pair<Int, Int>>): String {
        var variant = coords
        val keys = ArrayList<String>()
        for (refl in 0 until 2) {
            for (rot in 0 until 4) {
                keys.add(serialize(variant))
                // rotate 90deg: (r, c) -> (c, -r)
                variant = variant.map { (r, c) -> c to -r }
            }
            // reflect: (r, c) -> (r, -c)
            variant = variant.map { (r, c) -> r to -c }
        }
        keys.sort()
        return keys[0]
    }

    private fun serialize(coords: List<Pair<Int, Int>>): String {
        val minR = coords.minOf { it.first }
        val minC = coords.minOf { it.second }
        return coords
            .map { (r, c) -> (r - minR) to (c - minC) }
            .sortedWith(compareBy({ it.first }, { it.second }))
            .joinToString(";") { (r, c) -> "$r,$c" }
    }
}
