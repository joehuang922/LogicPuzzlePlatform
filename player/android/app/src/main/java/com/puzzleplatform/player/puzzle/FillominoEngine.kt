package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Fillomino (puzzle type 14). Ports:
 *  - answer extraction from frontend/src/extractors/fillomino.ts
 *  - progress from frontend/src/progress/fillomino.ts
 *  - room flood-fill + completion logic from frontend/src/components/FillominoBoard.tsx
 *    (computeRooms / validateSolution)
 *
 * canonRepr: { cells: number[][] } — rows x cols; 0 = empty (player fills it in),
 *   positive = a fixed number clue.
 *
 * answer: { numbers: number[][], edges: { h: number[][], v: number[][] } }
 *   - numbers: rows x cols, the canon clue merged with the player's entries.
 *   - edges.h: (rows-1) x cols; h[r][c] = 1 is a wall between (r,c) and (r+1,c).
 *   - edges.v: rows x (cols-1); v[r][c] = 1 is a wall between (r,c) and (r,c+1).
 *
 * Both kinds of input ride in the flat userValues map, matching the web client's
 * transport exactly so extracted answers are byte-identical and snapshots sync
 * cross-platform:
 *   - a cell number is "c:col,row" -> value (note col,row order, like the web board),
 *   - a wall is "h:r,c" -> 1 or "v:r,c" -> 1 (row,col order).
 */
object FillominoEngine : PuzzleEngine {
    override val puzzleType: Int = 14

    /** Build the flat userValues key for a player-entered cell number at (col, row). */
    fun cellKey(col: Int, row: Int): String = "c:$col,$row"

    /** Build the flat userValues key for a horizontal wall between (r,c) and (r+1,c). */
    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    /** Build the flat userValues key for a vertical wall between (r,c) and (r,c+1). */
    fun vKey(r: Int, c: Int): String = "v:$r,$c"

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

    /** h: (rows-1) x cols, v: rows x (cols-1) — 1 = a drawn wall. */
    class Edges(val h: Array<IntArray>, val v: Array<IntArray>)

    /** Materialize the h/v wall grids from the flat userValues map (a wall is present when its key maps to 1). */
    fun edges(cells: List<List<Int>>, userValues: Map<String, Int>): Edges {
        val (rows, cols) = dims(cells)
        val h = Array(if (rows > 0) rows - 1 else 0) { IntArray(cols) }
        val v = Array(rows) { IntArray(if (cols > 0) cols - 1 else 0) }
        for ((key, value) in userValues) {
            if (value != 1) continue
            when {
                key.startsWith("h:") -> {
                    val (r, c) = parseRC(key.removePrefix("h:")) ?: continue
                    if (r in 0 until rows - 1 && c in 0 until cols) h[r][c] = 1
                }
                key.startsWith("v:") -> {
                    val (r, c) = parseRC(key.removePrefix("v:")) ?: continue
                    if (r in 0 until rows && c in 0 until cols - 1) v[r][c] = 1
                }
            }
        }
        return Edges(h, v)
    }

    private fun parseRC(s: String): Pair<Int, Int>? {
        val parts = s.split(",")
        if (parts.size != 2) return null
        val r = parts[0].toIntOrNull() ?: return null
        val c = parts[1].toIntOrNull() ?: return null
        return r to c
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        val e = edges(cells, userValues)

        val numbers = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c -> JsonPrimitive(valueAt(cells, userValues, r, c)) })
        })
        fun grid(rowsArr: Array<IntArray>) = JsonArray(rowsArr.map { row ->
            JsonArray(row.map { JsonPrimitive(it) })
        })
        return JsonObject(
            mapOf(
                "numbers" to numbers,
                "edges" to JsonObject(mapOf("h" to grid(e.h), "v" to grid(e.v))),
            ),
        )
    }

    /**
     * Progress = filled empty cells / total empty cells * 100 (clue cells don't count).
     * Mirrors frontend/src/progress/fillomino.ts exactly; walls don't contribute.
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

        // Cell numbers: only non-clue cells are player input; keep positive entries.
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

        val edgesObj = answer["edges"] as? JsonObject
        (edgesObj?.get("h") as? JsonArray)?.let { h ->
            for (r in 0 until rows - 1) {
                val rowArr = h.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[hKey(r, c)] = 1
                }
            }
        }
        (edgesObj?.get("v") as? JsonArray)?.let { v ->
            for (r in 0 until rows) {
                val rowArr = v.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols - 1) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[vKey(r, c)] = 1
                }
            }
        }
        return result
    }

    /**
     * Flood-fill the grid into rooms, treating a wall between two cells as a barrier
     * (port of FillominoBoard.tsx computeRooms). Returns a rows x cols grid of room ids.
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
                    // up: wall h[cr-1][cc]
                    if (cr > 0 && roomIds[cr - 1][cc] < 0 && e.h[cr - 1][cc] == 0) {
                        roomIds[cr - 1][cc] = id; stack.addLast(cr - 1 to cc)
                    }
                    // down: wall h[cr][cc]
                    if (cr < rows - 1 && roomIds[cr + 1][cc] < 0 && e.h[cr][cc] == 0) {
                        roomIds[cr + 1][cc] = id; stack.addLast(cr + 1 to cc)
                    }
                    // left: wall v[cr][cc-1]
                    if (cc > 0 && roomIds[cr][cc - 1] < 0 && e.v[cr][cc - 1] == 0) {
                        roomIds[cr][cc - 1] = id; stack.addLast(cr to cc - 1)
                    }
                    // right: wall v[cr][cc]
                    if (cc < cols - 1 && roomIds[cr][cc + 1] < 0 && e.v[cr][cc] == 0) {
                        roomIds[cr][cc + 1] = id; stack.addLast(cr to cc + 1)
                    }
                }
            }
        }
        return roomIds
    }

    /**
     * True when every cell is filled, at least one wall is drawn, each room of size N
     * holds only the digit N, and no two wall-separated adjacent rooms share a number
     * (port of FillominoBoard.tsx validateSolution).
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        val (rows, cols) = dims(cells)
        if (rows == 0 || cols == 0) return false
        val e = edges(cells, userValues)

        // Every cell must have a value (clue or player-entered).
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val clue = cells.getOrNull(r)?.getOrNull(c) ?: 0
                if (clue > 0) continue
                if (userValues[cellKey(c, r)] == null) return false
            }
        }

        // At least one wall must exist (an empty board is never a valid solution).
        val hasWall = e.h.any { row -> row.any { it == 1 } } || e.v.any { row -> row.any { it == 1 } }
        if (!hasWall) return false

        val roomIds = computeRooms(rows, cols, e)

        // Group cells by room id.
        val roomCells = HashMap<Int, MutableList<Pair<Int, Int>>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                roomCells.getOrPut(roomIds[r][c]) { mutableListOf() }.add(r to c)
            }
        }

        // Each room: every cell carries the number N = the room's size.
        val roomNumbers = HashMap<Int, Int>()
        for ((rid, members) in roomCells) {
            val size = members.size
            for ((r, c) in members) {
                if (valueAt(cells, userValues, r, c) != size) return false
            }
            roomNumbers[rid] = size
        }

        // No two adjacent rooms separated by a wall may share a number.
        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                if (e.h[r][c] != 1) continue
                val a = roomIds[r][c]
                val b = roomIds[r + 1][c]
                if (a != b && roomNumbers[a] == roomNumbers[b]) return false
            }
        }
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                if (e.v[r][c] != 1) continue
                val a = roomIds[r][c]
                val b = roomIds[r][c + 1]
                if (a != b && roomNumbers[a] == roomNumbers[b]) return false
            }
        }
        return true
    }
}
