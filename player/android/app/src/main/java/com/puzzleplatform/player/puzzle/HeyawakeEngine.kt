package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

/**
 * Heyawake (puzzle type 21). Ports:
 *  - answer extraction from frontend/src/extractors/heyawake.ts
 *  - progress from frontend/src/progress/heyawake.ts
 *  - room ids + full completion validation from frontend/src/components/HeyawakeBoard.tsx
 *    (computeRoomIds / validateSolution / whiteLinesOk).
 *
 * canonRepr: { width, height, rooms: [{ r, c, w, h, clue }] } — rectangular rooms tiling the
 *   grid; clue is the room's exact shaded count, or null/absent for an unclued room. The clue
 *   is drawn in the room's top-left cell.
 *
 * answer: { states: number[][] } — height x width; 0 = unset, 1 = shaded (black),
 *   2 = marked (player-asserted white). The full grid is emitted, matching the web extractor
 *   so answers are byte-identical and snapshots sync cross-platform.
 *
 * User input rides in the flat userValues map keyed "col,row" -> state (col first), matching
 * the web board's transport, with unset cells absent. Heyawake is a shade/mark puzzle, so a
 * tap cycles empty -> shaded -> marked -> empty via the shared [ShadeCycle]. Every cell is
 * playable (clue cells included), so the default single-cell shadeGroup applies.
 */
object HeyawakeEngine : ShadeMarkEngine {
    override val puzzleType: Int = 21

    const val UNSET = ShadeCycle.EMPTY
    const val SHADED = ShadeCycle.SHADED
    const val MARKED = ShadeCycle.MARKED

    /** Build the flat userValues key for the cell at (col, row) — col,row order, like the web board. */
    override fun cellKey(col: Int, row: Int): String = "$col,$row"

    /** One rectangular room: top-left (r, c), size w x h, and its clue (null = unclued). */
    data class Room(val r: Int, val c: Int, val w: Int, val h: Int, val clue: Int?)

    class Board(val width: Int, val height: Int, val rooms: List<Room>)

    /** Parse width/height/rooms from a puzzle's canonRepr; missing/invalid -> empty. */
    fun parseBoard(puzzle: Puzzle): Board {
        val canon = puzzle.canonRepr
        val width = (canon["width"] as? JsonPrimitive)?.intOrNull ?: 0
        val height = (canon["height"] as? JsonPrimitive)?.intOrNull ?: 0
        val rooms = (canon["rooms"] as? JsonArray)?.mapNotNull { el ->
            val o = el as? JsonObject ?: return@mapNotNull null
            fun int(key: String) = (o[key] as? JsonPrimitive)?.intOrNull
            Room(
                r = int("r") ?: return@mapNotNull null,
                c = int("c") ?: return@mapNotNull null,
                w = int("w") ?: return@mapNotNull null,
                h = int("h") ?: return@mapNotNull null,
                clue = int("clue"),
            )
        } ?: emptyList()
        return Board(width, height, rooms)
    }

    /**
     * A height x width grid of room ids (index into [Board.rooms]); cells no room covers
     * get -1. Port of HeyawakeBoard.tsx computeRoomIds.
     */
    fun computeRoomIds(board: Board): Array<IntArray> {
        val ids = Array(board.height) { IntArray(board.width) { -1 } }
        board.rooms.forEachIndexed { id, room ->
            for (r in room.r until room.r + room.h) {
                for (c in room.c until room.c + room.w) {
                    if (r in 0 until board.height && c in 0 until board.width) ids[r][c] = id
                }
            }
        }
        return ids
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val board = parseBoard(puzzle)
        val states = JsonArray((0 until board.height).map { r ->
            JsonArray((0 until board.width).map { c ->
                JsonPrimitive(userValues[cellKey(c, r)] ?: UNSET)
            })
        })
        return JsonObject(mapOf("states" to states))
    }

    /**
     * Progress = cells set to shaded or marked / total cells * 100. Mirrors
     * frontend/src/progress/heyawake.ts.
     */
    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val board = parseBoard(puzzle)
        val total = board.width * board.height
        if (total < 1) return 0.0
        var assigned = 0
        for (r in 0 until board.height) {
            for (c in 0 until board.width) {
                if ((userValues[cellKey(c, r)] ?: UNSET) != UNSET) assigned++
            }
        }
        return assigned.toDouble() / total * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val board = parseBoard(puzzle)
        val states = answer["states"] as? JsonArray ?: return emptyMap()
        val result = mutableMapOf<String, Int>()
        for (r in 0 until board.height) {
            val rowArr = states.getOrNull(r) as? JsonArray ?: continue
            for (c in 0 until board.width) {
                val state = (rowArr.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: UNSET
                if (state == SHADED || state == MARKED) result[cellKey(c, r)] = state
            }
        }
        return result
    }

    /**
     * True when the shaded cells form a valid Heyawake solution (port of HeyawakeBoard.tsx
     * validateSolution):
     *  1. every clued room holds exactly its clue count of shaded cells,
     *  2. no two shaded cells are orthogonally adjacent,
     *  3. all unshaded cells form one orthogonally-connected region,
     *  4. no straight horizontal/vertical run of unshaded cells spans three or more rooms.
     * Marked (2) and unset (0) cells both count as unshaded.
     */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val board = parseBoard(puzzle)
        val rows = board.height
        val cols = board.width
        if (rows <= 0 || cols <= 0) return false
        val roomIds = computeRoomIds(board)
        val shaded = Array(rows) { r -> BooleanArray(cols) { c -> userValues[cellKey(c, r)] == SHADED } }

        // 1. Clued rooms hold exactly their clue count.
        val perRoom = IntArray(board.rooms.size)
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (shaded[r][c] && roomIds[r][c] >= 0) perRoom[roomIds[r][c]]++
            }
        }
        board.rooms.forEachIndexed { i, room ->
            if (room.clue != null && perRoom[i] != room.clue) return false
        }

        // 2. No two shaded cells orthogonally adjacent.
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!shaded[r][c]) continue
                if (c + 1 < cols && shaded[r][c + 1]) return false
                if (r + 1 < rows && shaded[r + 1][c]) return false
            }
        }

        // 3. Unshaded cells are connected.
        var whiteCount = 0
        var start: Pair<Int, Int>? = null
        for (r in 0 until rows) {
            for (c in 0 until cols) {
                if (!shaded[r][c]) {
                    whiteCount++
                    if (start == null) start = r to c
                }
            }
        }
        if (start == null) return false
        val visited = Array(rows) { BooleanArray(cols) }
        val stack = ArrayDeque<Pair<Int, Int>>()
        visited[start.first][start.second] = true
        stack.addLast(start)
        var seen = 0
        while (stack.isNotEmpty()) {
            val (cr, cc) = stack.removeLast()
            seen++
            for ((dr, dc) in DIRS) {
                val nr = cr + dr
                val nc = cc + dc
                if (nr in 0 until rows && nc in 0 until cols && !visited[nr][nc] && !shaded[nr][nc]) {
                    visited[nr][nc] = true
                    stack.addLast(nr to nc)
                }
            }
        }
        if (seen != whiteCount) return false

        // 4. No unshaded straight run crosses 3+ rooms.
        return whiteLinesOk(shaded, roomIds, rows, cols)
    }

    // -- shared helpers (ports of the web board) --------------------------------

    /** False when a maximal unshaded run along a row or column touches 3+ rooms. */
    private fun whiteLinesOk(shaded: Array<BooleanArray>, roomIds: Array<IntArray>, rows: Int, cols: Int): Boolean {
        for (r in 0 until rows) {
            val runRooms = HashSet<Int>()
            for (c in 0..cols) {
                if (c < cols && !shaded[r][c]) {
                    runRooms.add(roomIds[r][c])
                } else {
                    if (runRooms.size > 2) return false
                    runRooms.clear()
                }
            }
        }
        for (c in 0 until cols) {
            val runRooms = HashSet<Int>()
            for (r in 0..rows) {
                if (r < rows && !shaded[r][c]) {
                    runRooms.add(roomIds[r][c])
                } else {
                    if (runRooms.size > 2) return false
                    runRooms.clear()
                }
            }
        }
        return true
    }

    private val DIRS = listOf(-1 to 0, 1 to 0, 0 to -1, 0 to 1)
}
