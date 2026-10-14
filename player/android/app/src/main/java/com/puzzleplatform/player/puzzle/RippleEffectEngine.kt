package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Ripple Effect (puzzle type 25). Ports:
 *  - answer extraction from frontend/src/extractors/rippleEffect.ts
 *  - progress from frontend/src/progress/rippleEffect.ts
 *  - room flood-fill + completion logic from
 *    frontend/src/components/RippleEffectBoard.tsx (computeRooms / validateSolution)
 *
 * Unlike Fillomino, the room partition is FIXED — it ships in the canon's `edges`
 * grids, not drawn by the player — so the only player input is a number per cell.
 * Those entries ride in the flat userValues map keyed "col,row" (column first,
 * matching the web board) -> the entered value; cleared cells are absent. This is
 * the plain Sudoku-style key, not Fillomino's prefixed "c:col,row".
 *
 * canonRepr: { cells: number[][], edges: { h: number[][], v: number[][] } }
 *   - cells: rows x cols; 0 = empty (player fills it), positive = a fixed clue.
 *   - edges.h: (rows-1) x cols; h[r][c] = 1 is a thick room border between
 *     (r,c) and (r+1,c). 0 = same room.
 *   - edges.v: rows x (cols-1); v[r][c] = 1 is a thick room border between
 *     (r,c) and (r,c+1). 0 = same room.
 *
 * answer: { numbers: number[][] } — the canon clues merged with the player's
 *   entries, every cell filled.
 */
object RippleEffectEngine : PuzzleEngine {
    override val puzzleType: Int = 25

    /** Build the flat userValues key for a cell at (col, row). */
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

    /** The value shown at (r,c): the canon clue when positive, else the player's entry (or 0). */
    private fun valueAt(cells: List<List<Int>>, userValues: Map<String, Int>, r: Int, c: Int): Int {
        val clue = cells.getOrNull(r)?.getOrNull(c) ?: 0
        if (clue > 0) return clue
        return userValues[cellKey(c, r)] ?: 0
    }

    /** h: (rows-1) x cols, v: rows x (cols-1) — 1 = a thick room border. */
    class Edges(val h: Array<IntArray>, val v: Array<IntArray>)

    /** Materialize the fixed room-border grids from the canon's `edges` object. */
    fun parseEdges(puzzle: Puzzle): Edges {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val h = Array(if (rows > 0) rows - 1 else 0) { IntArray(cols) }
        val v = Array(rows) { IntArray(if (cols > 0) cols - 1 else 0) }
        val edges = puzzle.canonRepr["edges"] as? JsonObject ?: return Edges(h, v)
        (edges["h"] as? JsonArray)?.let { grid ->
            for (r in 0 until rows - 1) {
                val rowArr = grid.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) h[r][c] = 1
                }
            }
        }
        (edges["v"] as? JsonArray)?.let { grid ->
            for (r in 0 until rows) {
                val rowArr = grid.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols - 1) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) v[r][c] = 1
                }
            }
        }
        return Edges(h, v)
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val numbers = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c -> JsonPrimitive(valueAt(cells, userValues, r, c)) })
        })
        return JsonObject(mapOf("numbers" to numbers))
    }

    /**
     * Progress = filled empty cells / total empty cells * 100 (clue cells don't count).
     * Mirrors frontend/src/progress/rippleEffect.ts exactly.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        var empty = 0
        var filled = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((cells.getOrNull(r)?.getOrNull(c) ?: 0) != 0) continue
                empty++
                if (userValues[cellKey(c, r)] != null) filled++
            }
        }
        if (empty == 0) return 100.0
        return filled.toDouble() / empty * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val result = mutableMapOf<String, Int>()
        // Only non-clue cells are player input; keep positive entries.
        (answer["numbers"] as? JsonArray)?.let { numbers ->
            for (r in 0 until rows) {
                val rowArr = numbers.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    if ((cells.getOrNull(r)?.getOrNull(c) ?: 0) != 0) continue
                    val v = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                    if (v > 0) result[cellKey(c, r)] = v
                }
            }
        }
        return result
    }

    /**
     * Flood-fill the grid into rooms, treating a thick border between two cells as a
     * barrier (port of RippleEffectBoard.tsx computeRooms). Returns a rows x cols grid
     * of room ids.
     */
    private fun computeRooms(rows: Int, cols: Int, e: Edges): Array<IntArray> {
        val roomIds = Array(rows) { IntArray(cols) { -1 } }
        var nextId = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (roomIds[r][c] >= 0) continue
                val id = nextId++
                val stack = ArrayDeque<Pair<Int, Int>>()
                roomIds[r][c] = id
                stack.addLast(r to c)
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    if (cr > 0 && roomIds[cr - 1][cc] < 0 && e.h[cr - 1][cc] == 0) {
                        roomIds[cr - 1][cc] = id; stack.addLast(cr - 1 to cc)
                    }
                    if (cr < rows - 1 && roomIds[cr + 1][cc] < 0 && e.h[cr][cc] == 0) {
                        roomIds[cr + 1][cc] = id; stack.addLast(cr + 1 to cc)
                    }
                    if (cc > 0 && roomIds[cr][cc - 1] < 0 && e.v[cr][cc - 1] == 0) {
                        roomIds[cr][cc - 1] = id; stack.addLast(cr to cc - 1)
                    }
                    if (cc < cols - 1 && roomIds[cr][cc + 1] < 0 && e.v[cr][cc] == 0) {
                        roomIds[cr][cc + 1] = id; stack.addLast(cr to cc + 1)
                    }
                }
            }
        }
        return roomIds
    }

    /**
     * True when the board is fully filled, every room of size N holds exactly {1..N},
     * and no two equal values K in a row/column sit within K cells of each other
     * (port of RippleEffectBoard.tsx validateSolution).
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val e = parseEdges(puzzle)

        // Fully filled, with every value a positive integer.
        val grid = Array(rows) { IntArray(cols) }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val v = valueAt(cells, userValues, r, c)
                if (v <= 0) return false
                grid[r][c] = v
            }
        }

        // Each room of size N must contain exactly {1..N}.
        val roomIds = computeRooms(rows, cols, e)
        val roomCells = HashMap<Int, MutableList<Pair<Int, Int>>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                roomCells.getOrPut(roomIds[r][c]) { mutableListOf() }.add(r to c)
            }
        }
        for ((_, members) in roomCells) {
            val size = members.size
            val seen = HashSet<Int>()
            for ((r, c) in members) {
                val v = grid[r][c]
                if (v < 1 || v > size || !seen.add(v)) return false
            }
            // `seen` now holds `size` distinct values in 1..size => exactly {1..size}.
        }

        // Ripple: equal values K in a row/column must be at least K+1 cells apart.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val k = grid[r][c]
                var d = 1
                while (d <= k && c + d < cols) {
                    if (grid[r][c + d] == k) return false
                    d++
                }
                d = 1
                while (d <= k && r + d < rows) {
                    if (grid[r + d][c] == k) return false
                    d++
                }
            }
        }
        return true
    }
}
