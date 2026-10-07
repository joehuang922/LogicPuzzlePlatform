package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Nurimaze (puzzle type 3). Ports:
 *  - answer extraction from frontend/src/extractors/nurimaze.ts
 *  - progress from frontend/src/progress/nurimaze.ts
 *  - room flood-fill + full completion validation from
 *    frontend/src/components/NurimazeBoard.tsx (computeRooms / validateSolution).
 *
 * The grid is pre-divided into rooms by thick borders. The player paints each room
 * entirely black or marks it white to carve a maze; the shortest path from S to G must
 * pass every circle and no triangle (plus a no-2x2 and single-white-region rule).
 *
 * canonRepr: { cells: number[][], grids: { h: number[][], v: number[][] } }
 *   - cells: rows x cols. 0 = empty, 1 = circle, 2 = triangle, 3 = S, 4 = G.
 *   - grids.h: (rows-1) x cols; h[r][c] = 1 is a thick border below cell (r,c).
 *   - grids.v: rows x (cols-1); v[r][c] = 1 is a thick border right of cell (r,c).
 *
 * answer: { states: number[][] } — rows x cols; 0 = unset, 1 = black, 2 = marked.
 *   The full grid is emitted (including 0s), mirroring the web extractor exactly so
 *   extracted answers are byte-identical and snapshots sync cross-platform.
 *
 * User input rides in the flat userValues map keyed "col,row" -> state (web convention),
 * with unset cells absent. Input is room-level: a tap cycles the tapped cell's entire
 * room (see [cycleRoom]), so every cell of a room always carries the same state.
 */
object NurimazeEngine : PuzzleEngine {
    override val puzzleType: Int = 3

    const val UNSET = 0
    const val BLACK = 1
    const val MARKED = 2

    // Cell symbol values in canon.cells.
    private const val SYM_CIRCLE = 1
    private const val SYM_TRIANGLE = 2
    private const val SYM_START = 3
    private const val SYM_GOAL = 4

    /** Build the flat userValues key for the cell at (col, row) — col,row order, like the web board. */
    fun cellKey(col: Int, row: Int): String = "$col,$row"

    /** cells: rows x cols symbol grid. h: (rows-1) x cols, v: rows x (cols-1) thick-border grids. */
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
     * Mirrors frontend/src/progress/nurimaze.ts exactly.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val canon = parseCanon(puzzle)
        val rows = canon.rows
        val cols = canon.cols
        val total = rows * cols
        if (total == 0) return 0.0

        var nonEmpty = 0
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if ((userValues[cellKey(c, r)] ?: UNSET) != UNSET) nonEmpty++
            }
        }
        return nonEmpty.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val canon = parseCanon(puzzle)
        val rows = canon.rows
        val cols = canon.cols
        val states = answer["states"] as? JsonArray ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        for (r in 0 until rows) {
            val rowArr = states.getOrNull(r) as? JsonArray ?: continue
            for (c in 0 until cols) {
                val state = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (state != UNSET) result[cellKey(c, r)] = state
            }
        }
        return result
    }

    /**
     * Flood-fill the grid into rooms, treating a thick border between two cells as a
     * barrier (port of NurimazeBoard.tsx computeRooms). Returns a rows x cols grid of ids.
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

    /**
     * Compute the userValues changes for tapping cell (col, row): cycle the state of its
     * entire room. Mirrors NurimazeBoard.tsx handleCellClick:
     *  - a room holding any special symbol (S/G/circle/triangle) toggles unset <-> marked
     *    (it can never be painted black),
     *  - a normal room cycles unset -> black -> marked -> unset.
     * Returns "col,row" -> next-state for every cell in the room (0 means remove the key).
     */
    fun cycleRoom(puzzle: Puzzle, userValues: Map<String, Int>, col: Int, row: Int): Map<String, Int> {
        val canon = parseCanon(puzzle)
        val rows = canon.rows
        val cols = canon.cols
        if (row !in 0 until rows || col !in 0 until cols) return emptyMap()

        val roomIds = computeRooms(canon)
        val rid = roomIds[row][col]

        val roomCells = ArrayList<Pair<Int, Int>>()
        var isSpecial = false
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (roomIds[r][c] != rid) continue
                roomCells.add(r to c)
                if (canon.cells[r][c] > 0) isSpecial = true
            }
        }

        val current = userValues[cellKey(col, row)] ?: UNSET
        val next = if (isSpecial) {
            if (current == UNSET) MARKED else UNSET // special rooms can't be black
        } else {
            (current + 1) % 3 // unset -> black -> marked -> unset
        }

        return roomCells.associate { (r, c) -> cellKey(c, r) to next }
    }

    /**
     * True when the current input is a full, valid Nurimaze solution (port of
     * NurimazeBoard.tsx validateSolution):
     *  1. every room is assigned a non-unset state,
     *  2. no 2x2 block of cells is all-black or all-non-black,
     *  3. all non-black (white/marked) cells form one connected region,
     *  4. the shortest path from S to G through non-black cells passes every circle and
     *     no triangle.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val canon = parseCanon(puzzle)
        val rows = canon.rows
        val cols = canon.cols
        if (rows == 0 || cols == 0) return false

        val cells = canon.cells
        val roomIds = computeRooms(canon)

        // Per-cell state grid, derived room-level: a room's state is any set cell in it
        // (every cell of a room shares its state), default unset.
        val stateGrid = Array(rows) { IntArray(cols) { UNSET } }
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                stateGrid[r][c] = userValues[cellKey(c, r)] ?: UNSET
            }
        }

        // 1. No unset rooms remain.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (stateGrid[r][c] == UNSET) return false
            }
        }

        // 2. No 2x2 block all-black or all-non-black.
        for (r in 0 until rows - 1) {
            for (c in 0 until cols - 1) {
                val s00 = stateGrid[r][c]
                val s01 = stateGrid[r][c + 1]
                val s10 = stateGrid[r + 1][c]
                val s11 = stateGrid[r + 1][c + 1]
                val allBlack = s00 == BLACK && s01 == BLACK && s10 == BLACK && s11 == BLACK
                val allNonBlack = s00 != BLACK && s01 != BLACK && s10 != BLACK && s11 != BLACK
                if (allBlack || allNonBlack) return false
            }
        }

        // 3. Non-black cells form a single connected region.
        val nonBlack = ArrayList<Pair<Int, Int>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (stateGrid[r][c] != BLACK) nonBlack.add(r to c)
            }
        }
        if (nonBlack.isEmpty()) return false
        val visited = Array(rows) { BooleanArray(cols) }
        val queue = ArrayDeque<Pair<Int, Int>>()
        queue.addLast(nonBlack[0]); visited[nonBlack[0].first][nonBlack[0].second] = true
        var visitedCount = 0
        while (queue.isNotEmpty()) {
            val (cr, cc) = queue.removeFirst()
            visitedCount++
            for ((dr, dc) in DIRS) {
                val nr = cr + dr
                val nc = cc + dc
                if (nr in 0 until rows && nc in 0 until cols && !visited[nr][nc] && stateGrid[nr][nc] != BLACK) {
                    visited[nr][nc] = true
                    queue.addLast(nr to nc)
                }
            }
        }
        if (visitedCount != nonBlack.size) return false

        // 4. Shortest path S -> G (through non-black) covers all circles, no triangles.
        var sPos: Pair<Int, Int>? = null
        var gPos: Pair<Int, Int>? = null
        val circles = HashSet<Pair<Int, Int>>()
        val triangles = HashSet<Pair<Int, Int>>()
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                when (cells[r][c]) {
                    SYM_START -> sPos = r to c
                    SYM_GOAL -> gPos = r to c
                    SYM_CIRCLE -> circles.add(r to c)
                    SYM_TRIANGLE -> triangles.add(r to c)
                }
            }
        }
        val start = sPos ?: return false
        val goal = gPos ?: return false

        val dist = Array(rows) { IntArray(cols) { -1 } }
        val prev = Array(rows) { arrayOfNulls<Pair<Int, Int>>(cols) }
        dist[start.first][start.second] = 0
        val bfs = ArrayDeque<Pair<Int, Int>>()
        bfs.addLast(start)
        while (bfs.isNotEmpty()) {
            val (cr, cc) = bfs.removeFirst()
            if (cr == goal.first && cc == goal.second) break
            for ((dr, dc) in DIRS) {
                val nr = cr + dr
                val nc = cc + dc
                if (nr in 0 until rows && nc in 0 until cols && dist[nr][nc] == -1 && stateGrid[nr][nc] != BLACK) {
                    dist[nr][nc] = dist[cr][cc] + 1
                    prev[nr][nc] = cr to cc
                    bfs.addLast(nr to nc)
                }
            }
        }
        if (dist[goal.first][goal.second] == -1) return false

        // Reconstruct one shortest path.
        val pathCells = HashSet<Pair<Int, Int>>()
        var cur: Pair<Int, Int>? = goal
        while (cur != null) {
            pathCells.add(cur)
            cur = prev[cur.first][cur.second]
        }

        if (circles.any { it !in pathCells }) return false
        if (triangles.any { it in pathCells }) return false
        return true
    }

    private val DIRS = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)
}
