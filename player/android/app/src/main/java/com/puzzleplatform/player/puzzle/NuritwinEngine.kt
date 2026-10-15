package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Nuritwin (puzzle type 9). Ports:
 *  - answer extraction from frontend/src/extractors/nuritwin.ts
 *  - progress from frontend/src/progress/nuritwin.ts
 *  - room flood-fill + full completion validation from
 *    frontend/src/components/NuritwinBoard.tsx (computeRooms / validateSolution).
 *
 * The grid is pre-divided into rooms by thick borders (same canon shape as Nurimaze).
 * The player paints individual cells black; in each room the black cells must form
 * exactly two equal-size connected components (a "twin"), matching the room's clue when
 * it has one, while all black cells across the board stay one connected sea with no 2x2
 * pool.
 *
 * canonRepr: { cells: number[][], grids: { h: number[][], v: number[][] } }
 *   - cells: rows x cols. 0 = empty, a positive integer is the room's twin-size clue
 *     (each of the room's two black components must hold exactly that many cells).
 *   - grids.h: (rows-1) x cols; h[r][c] = 1 is a thick border below cell (r,c).
 *   - grids.v: rows x (cols-1); v[r][c] = 1 is a thick border right of cell (r,c).
 *
 * answer: { states: number[][] } — rows x cols; 0 = unset, 1 = black, 2 = marked.
 *   The full grid is emitted (including 0s), mirroring the web extractor exactly so
 *   extracted answers are byte-identical and snapshots sync cross-platform.
 *
 * User input rides in the flat userValues map keyed "col,row" -> state (web convention),
 * with unset cells absent. Input is cell-level (unlike Nurimaze's room-level tap): a tap
 * cycles a single cell empty -> black -> marked -> empty. Clue cells are paintable — a
 * clue is a room-size constraint, not a fixed-white cell, so there's no read-only logic.
 * Marked (2) and unset (0) are both treated as white for every rule.
 */
object NuritwinEngine : ShadeMarkEngine {
    override val puzzleType: Int = 9

    const val UNSET = ShadeCycle.EMPTY
    const val BLACK = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    /** Build the flat userValues key for the cell at (col, row) — col,row order, like the web board. */
    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    /** cells: rows x cols clue grid. h: (rows-1) x cols, v: rows x (cols-1) thick-border grids. */
    class Canon(
        val cells: List<List<Int>>,
        val h: List<List<Int>>,
        val v: List<List<Int>>,
    ) {
        val rows: Int get() = cells.size
        val cols: Int get() = cells.firstOrNull()?.size ?: 0
    }

    /** Parse cells + grids from a puzzle's canonRepr; missing/invalid entries read as 0. */
    fun parseCanon(puzzle: Puzzle): Canon {
        val grids = puzzle.canonRepr["grids"] as? JsonObject
        return Canon(
            cells = parseGrid(puzzle.canonRepr["cells"]),
            h = parseGrid(grids?.get("h")),
            v = parseGrid(grids?.get("v")),
        )
    }

    private fun parseGrid(element: Any?): List<List<Int>> {
        val outer = element as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Int>()
            rowArr.map { (it as? JsonPrimitive)?.intOrNull ?: 0 }
        }
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val canon = parseCanon(puzzle)
        val rows = canon.rows
        val cols = canon.cols
        // Full grid, including 0s — matches the web extractor (userValues["c,r"] ?? 0).
        val states = JsonArray((0 until rows).map { r ->
            JsonArray((0 until cols).map { c ->
                JsonPrimitive(userValues[cellKey(c, r)] ?: UNSET)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /**
     * Progress = cells with a non-empty state / total cells * 100.
     * Mirrors frontend/src/progress/nuritwin.ts exactly.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val canon = parseCanon(puzzle)
        val total = canon.rows * canon.cols
        if (total == 0) return 0.0

        var nonEmpty = 0
        for (r in 0 until canon.rows) {
            for (c in 0 until canon.cols) {
                if ((userValues[cellKey(c, r)] ?: UNSET) != UNSET) nonEmpty++
            }
        }
        return nonEmpty.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val canon = parseCanon(puzzle)
        val states = answer["states"] as? JsonArray ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        for (r in 0 until canon.rows) {
            val rowArr = states.getOrNull(r) as? JsonArray ?: continue
            for (c in 0 until canon.cols) {
                val state = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (state != UNSET) result[cellKey(c, r)] = state
            }
        }
        return result
    }

    /**
     * Flood-fill the grid into rooms, treating a thick border between two cells as a
     * barrier (port of NuritwinBoard.tsx computeRooms). Returns a rows x cols grid of ids.
     */
    fun computeRooms(canon: Canon): Array<IntArray> {
        val rows = canon.rows
        val cols = canon.cols
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
                    // up: border h[cr-1][cc]
                    if (cr > 0 && roomIds[cr - 1][cc] < 0 && edge(canon.h, cr - 1, cc) == 0) {
                        roomIds[cr - 1][cc] = id; stack.addLast(cr - 1 to cc)
                    }
                    // down: border h[cr][cc]
                    if (cr < rows - 1 && roomIds[cr + 1][cc] < 0 && edge(canon.h, cr, cc) == 0) {
                        roomIds[cr + 1][cc] = id; stack.addLast(cr + 1 to cc)
                    }
                    // left: border v[cr][cc-1]
                    if (cc > 0 && roomIds[cr][cc - 1] < 0 && edge(canon.v, cr, cc - 1) == 0) {
                        roomIds[cr][cc - 1] = id; stack.addLast(cr to cc - 1)
                    }
                    // right: border v[cr][cc]
                    if (cc < cols - 1 && roomIds[cr][cc + 1] < 0 && edge(canon.v, cr, cc) == 0) {
                        roomIds[cr][cc + 1] = id; stack.addLast(cr to cc + 1)
                    }
                }
            }
        }
        return roomIds
    }

    /** Safe border lookup; a missing/ragged entry reads as 0 (thin), never a barrier. */
    private fun edge(grid: List<List<Int>>, r: Int, c: Int): Int =
        grid.getOrNull(r)?.getOrNull(c) ?: 0

    /** True when the cell at (r,c) is painted black. Marks (2) and unset (0) read as white. */
    private fun isBlack(userValues: Map<String, Int>, r: Int, c: Int): Boolean =
        (userValues[cellKey(c, r)] ?: UNSET) == BLACK

    /**
     * Split [members] into orthogonally-connected components, restricted to cells that are
     * also in [members] (a HashSet of "r,c" keys for O(1) membership). Port of
     * NuritwinBoard.tsx findConnectedComponents.
     */
    private fun connectedComponents(
        members: List<Pair<Int, Int>>,
        memberSet: HashSet<Pair<Int, Int>>,
    ): List<List<Pair<Int, Int>>> {
        val visited = HashSet<Pair<Int, Int>>()
        val components = ArrayList<List<Pair<Int, Int>>>()
        for (cell in members) {
            if (cell in visited) continue
            visited.add(cell)
            val comp = ArrayList<Pair<Int, Int>>()
            comp.add(cell)
            val stack = ArrayDeque<Pair<Int, Int>>()
            stack.addLast(cell)
            while (stack.isNotEmpty()) {
                val (cr, cc) = stack.removeLast()
                for ((dr, dc) in DIRS) {
                    val n = (cr + dr) to (cc + dc)
                    if (n in memberSet && n !in visited) {
                        visited.add(n)
                        comp.add(n)
                        stack.addLast(n)
                    }
                }
            }
            components.add(comp)
        }
        return components
    }

    /**
     * True when the current paint is a full, valid Nuritwin solution (port of
     * NuritwinBoard.tsx validateSolution):
     *  1. no 2x2 block of cells is entirely black,
     *  2. all black cells form a single orthogonally-connected component (and there is at
     *     least one black cell),
     *  3. in every room the black cells form exactly two connected components of equal
     *     size, and when the room carries a clue N each component must hold exactly N cells.
     * Marked (2) and unset (0) cells both count as white. Unlike the web board, completion
     * does not require every cell to be assigned — an unset cell is simply white, matching
     * the documented success criteria and [NurikabeEngine].
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val canon = parseCanon(puzzle)
        val rows = canon.rows
        val cols = canon.cols
        if (rows == 0 || cols == 0) return false

        // 1. No 2x2 all-black pool.
        for (r in 0 until rows - 1) {
            for (c in 0 until cols - 1) {
                if (isBlack(userValues, r, c) && isBlack(userValues, r, c + 1) &&
                    isBlack(userValues, r + 1, c) && isBlack(userValues, r + 1, c + 1)
                ) return false
            }
        }

        // 2. All black cells form a single connected component (and there's at least one).
        val blackCells = ArrayList<Pair<Int, Int>>()
        val blackSet = HashSet<Pair<Int, Int>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (isBlack(userValues, r, c)) {
                    blackCells.add(r to c)
                    blackSet.add(r to c)
                }
            }
        }
        if (blackCells.isEmpty()) return false
        if (connectedComponents(blackCells, blackSet).size != 1) return false

        // 3. Per-room twin constraint.
        val roomIds = computeRooms(canon)
        val roomCells = HashMap<Int, MutableList<Pair<Int, Int>>>()
        val roomClue = HashMap<Int, Int>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                val rid = roomIds[r][c]
                roomCells.getOrPut(rid) { ArrayList() }.add(r to c)
                val clue = canon.cells.getOrNull(r)?.getOrNull(c) ?: 0
                if (clue > 0) roomClue[rid] = clue
            }
        }

        for ((rid, cellsInRoom) in roomCells) {
            val blackInRoom = cellsInRoom.filter { (r, c) -> isBlack(userValues, r, c) }
            val blackInRoomSet = HashSet(blackInRoom)
            val comps = connectedComponents(blackInRoom, blackInRoomSet)
            if (comps.size != 2) return false
            if (comps[0].size != comps[1].size) return false
            val clue = roomClue[rid]
            if (clue != null && comps[0].size != clue) return false
        }

        return true
    }

    private val DIRS = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)
}
