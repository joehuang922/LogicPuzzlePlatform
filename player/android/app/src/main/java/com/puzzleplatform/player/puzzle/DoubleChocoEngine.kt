package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Double Choco (puzzle type 4). Ports:
 *  - answer extraction from frontend/src/extractors/doubleChoco.ts
 *  - progress from frontend/src/progress/doubleChoco.ts
 *  - room flood-fill, shape matching and completion logic from
 *    frontend/src/components/DoubleChocoBoard.tsx (computeRooms / validateSolution)
 *
 * The player draws thick borders along cell edges to divide the grid into rooms: each
 * room holds equally many white and gray cells, each color forms one connected group,
 * the two groups have the same shape (rotation/reflection allowed), and a number gives
 * the size of either group in its room.
 *
 * canonRepr: { cells: [[color, number], ...][] } — color 0 = white, 1 = gray; number 0 =
 *   no clue.
 *
 * answer: { grids: { h: number[][], v: number[][] } }
 *   - grids.h: (rows-1) x cols; h[r][c] = 1 is a border between (r,c) and (r+1,c).
 *   - grids.v: rows x (cols-1); v[r][c] = 1 is a border between (r,c) and (r,c+1).
 *
 * Borders ride in the flat userValues map as "h:r,c" -> 1 / "v:r,c" -> 1 (row,col order),
 * matching the web board's transport exactly so extracted answers are byte-identical and
 * snapshots sync cross-platform.
 */
object DoubleChocoEngine : PuzzleEngine {
    override val puzzleType: Int = 4

    /** Build the flat userValues key for a horizontal border between (r,c) and (r+1,c). */
    fun hKey(r: Int, c: Int): String = "h:$r,$c"

    /** Build the flat userValues key for a vertical border between (r,c) and (r,c+1). */
    fun vKey(r: Int, c: Int): String = "v:$r,$c"

    /** One canon cell: [gray] when color is 1, [number] 0 when there's no clue. */
    data class Cell(val gray: Boolean, val number: Int)

    /** The parsed canon: a [rows] x [cols] grid of cells. */
    class Board(val cells: List<List<Cell>>) {
        val rows: Int get() = cells.size
        val cols: Int get() = cells.firstOrNull()?.size ?: 0
    }

    /** Parse cells from a puzzle's canonRepr; missing/invalid -> empty board. */
    fun parseBoard(puzzle: Puzzle): Board {
        val rowsArr = puzzle.canonRepr["cells"] as? JsonArray ?: return Board(emptyList())
        val cells = rowsArr.map { row ->
            (row as? JsonArray)?.map { cell ->
                val pair = cell as? JsonArray
                val color = (pair?.getOrNull(0) as? JsonPrimitive)?.intOrNull ?: 0
                val number = (pair?.getOrNull(1) as? JsonPrimitive)?.intOrNull ?: 0
                Cell(gray = color == 1, number = number)
            } ?: emptyList()
        }
        // A ragged canon has no well-defined edge grid; treat it as empty.
        val cols = cells.firstOrNull()?.size ?: 0
        if (cols == 0 || cells.any { it.size != cols }) return Board(emptyList())
        return Board(cells)
    }

    /** h: (rows-1) x cols, v: rows x (cols-1) — 1 = a drawn border. */
    class Edges(val h: Array<IntArray>, val v: Array<IntArray>) {
        val any: Boolean get() = h.any { row -> row.any { it == 1 } } || v.any { row -> row.any { it == 1 } }
    }

    /** Materialize the h/v border grids from the flat userValues map (a border is present when its key maps to 1). */
    fun edges(board: Board, userValues: Map<String, Int>): Edges {
        val rows = board.rows
        val cols = board.cols
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
        val e = edges(parseBoard(puzzle), userValues)
        fun grid(rowsArr: Array<IntArray>) = JsonArray(rowsArr.map { row ->
            JsonArray(row.map { JsonPrimitive(it) })
        })
        return JsonObject(
            mapOf("grids" to JsonObject(mapOf("h" to grid(e.h), "v" to grid(e.v)))),
        )
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        val result = mutableMapOf<String, Int>()
        val grids = answer["grids"] as? JsonObject
        (grids?.get("h") as? JsonArray)?.let { h ->
            for (r in 0 until rows - 1) {
                val rowArr = h.getOrNull(r) as? JsonArray ?: continue
                for (c in 0 until cols) {
                    if ((rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull == 1) result[hKey(r, c)] = 1
                }
            }
        }
        (grids?.get("v") as? JsonArray)?.let { v ->
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
     * Flood-fill the grid into rooms across edges with no border (port of
     * DoubleChocoBoard.tsx computeRooms). Returns a rows x cols grid of room ids.
     */
    fun computeRooms(rows: Int, cols: Int, e: Edges): Array<IntArray> {
        val ids = Array(rows) { IntArray(cols) { -1 } }
        var nextId = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (ids[r][c] >= 0) continue
                val id = nextId++
                val stack = ArrayDeque<Pair<Int, Int>>()
                ids[r][c] = id
                stack.addLast(r to c)
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    if (cr > 0 && ids[cr - 1][cc] < 0 && e.h[cr - 1][cc] == 0) {
                        ids[cr - 1][cc] = id; stack.addLast(cr - 1 to cc)
                    }
                    if (cr < rows - 1 && ids[cr + 1][cc] < 0 && e.h[cr][cc] == 0) {
                        ids[cr + 1][cc] = id; stack.addLast(cr + 1 to cc)
                    }
                    if (cc > 0 && ids[cr][cc - 1] < 0 && e.v[cr][cc - 1] == 0) {
                        ids[cr][cc - 1] = id; stack.addLast(cr to cc - 1)
                    }
                    if (cc < cols - 1 && ids[cr][cc + 1] < 0 && e.v[cr][cc] == 0) {
                        ids[cr][cc + 1] = id; stack.addLast(cr to cc + 1)
                    }
                }
            }
        }
        return ids
    }

    /**
     * Room ids that are "established": equally many (and at least one) white and gray
     * cells. These are what progress counts.
     */
    fun balancedRooms(board: Board, roomIds: Array<IntArray>): Set<Int> {
        val balance = HashMap<Int, Int>()
        val size = HashMap<Int, Int>()
        for (r in 0 until board.rows) {
            for (c in 0 until board.cols) {
                val id = roomIds[r][c]
                balance[id] = (balance[id] ?: 0) + if (board.cells[r][c].gray) 1 else -1
                size[id] = (size[id] ?: 0) + 1
            }
        }
        return balance.filter { (id, b) -> b == 0 && (size[id] ?: 0) > 0 }.keys
    }

    /**
     * Progress = (cells in a room with equal white and gray counts / total cells) * 100.
     * Mirrors frontend/src/progress/doubleChoco.ts; shapes and clues aren't checked.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        if (rows < 1 || cols < 1) return 0.0
        val roomIds = computeRooms(rows, cols, edges(board, userValues))
        val balanced = balancedRooms(board, roomIds)
        var counted = 0
        for (r in 0 until rows) for (c in 0 until cols) if (roomIds[r][c] in balanced) counted++
        return counted.toDouble() / (rows * cols) * 100.0
    }

    /**
     * True when the borders form a valid partition (port of DoubleChocoBoard.tsx
     * validateSolution, gated on at least one border like the web board):
     *  1. every room has equally many, and at least one, white and gray cells,
     *  2. the white cells are connected, and so are the gray cells,
     *  3. the white shape equals the gray shape up to rotation/reflection,
     *  4. every clue in a room equals that room's per-color cell count,
     *  5. every drawn border separates two different rooms.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        val rows = board.rows
        val cols = board.cols
        if (rows == 0 || cols == 0) return false
        val e = edges(board, userValues)
        if (!e.any) return false
        val roomIds = computeRooms(rows, cols, e)

        val whites = HashMap<Int, MutableList<Pair<Int, Int>>>()
        val grays = HashMap<Int, MutableList<Pair<Int, Int>>>()
        val clues = HashMap<Int, MutableList<Int>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val id = roomIds[r][c]
                val cell = board.cells[r][c]
                (if (cell.gray) grays else whites).getOrPut(id) { mutableListOf() }.add(r to c)
                if (cell.number > 0) clues.getOrPut(id) { mutableListOf() }.add(cell.number)
            }
        }

        for (id in whites.keys + grays.keys) {
            val w = whites[id].orEmpty()
            val g = grays[id].orEmpty()
            if (w.size != g.size || w.isEmpty()) return false
            if (!isConnected(w) || !isConnected(g)) return false
            if (normalize(w) !in variants(g)) return false
            if (clues[id].orEmpty().any { it != w.size }) return false
        }

        for (r in 0 until rows - 1) {
            for (c in 0 until cols) {
                if (e.h[r][c] == 1 && roomIds[r][c] == roomIds[r + 1][c]) return false
            }
        }
        for (r in 0 until rows) {
            for (c in 0 until cols - 1) {
                if (e.v[r][c] == 1 && roomIds[r][c] == roomIds[r][c + 1]) return false
            }
        }
        return true
    }

    /** Translate a shape so its min row/col are 0, as a sorted list (port of normalizeShape). */
    private fun normalize(coords: List<Pair<Int, Int>>): List<Pair<Int, Int>> {
        val minR = coords.minOf { it.first }
        val minC = coords.minOf { it.second }
        return coords.map { (r, c) -> (r - minR) to (c - minC) }
            .sortedWith(compareBy({ it.first }, { it.second }))
    }

    /** The 8 rotations/reflections of a shape, each normalized (port of allRotationsAndReflections). */
    private fun variants(coords: List<Pair<Int, Int>>): List<List<Pair<Int, Int>>> {
        val out = mutableListOf<List<Pair<Int, Int>>>()
        var current = coords
        repeat(4) {
            out.add(normalize(current))
            out.add(normalize(current.map { (r, c) -> r to -c }))
            current = current.map { (r, c) -> c to -r }
        }
        return out
    }

    private fun isConnected(coords: List<Pair<Int, Int>>): Boolean {
        if (coords.size <= 1) return true
        val set = coords.toHashSet()
        val seen = hashSetOf(coords[0])
        val stack = ArrayDeque(listOf(coords[0]))
        while (stack.isNotEmpty()) {
            val (r, c) = stack.removeLast()
            for ((dr, dc) in NEIGHBORS) {
                val n = (r + dr) to (c + dc)
                if (n in set && seen.add(n)) stack.addLast(n)
            }
        }
        return seen.size == coords.size
    }

    private val NEIGHBORS = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)
}
