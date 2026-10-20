package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HeyawakeEngine.Room
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable layout of a heyawake being authored: a [width] x [height] grid tiled by
 * rectangular [rooms], each with an optional clue (how many of its cells are shaded).
 */
data class HeyawakeDraft(
    val width: Int = 0,
    val height: Int = 0,
    val rooms: List<Room> = emptyList(),
) {
    /** Index into [rooms] of the room covering (col, row), or null off-grid / uncovered. */
    fun roomAt(col: Int, row: Int): Int? {
        if (row !in 0 until height || col !in 0 until width) return null
        return roomIds()[row][col].takeIf { it >= 0 }
    }

    /** Room index per cell, -1 where no room covers it; a later room wins an overlap. */
    fun roomIds(): Array<IntArray> =
        HeyawakeEngine.computeRoomIds(HeyawakeEngine.Board(width, height, rooms))
}

/** A side of a cell, for wall edits. */
enum class WallSide(val dc: Int, val dr: Int) { TOP(0, -1), BOTTOM(0, 1), LEFT(-1, 0), RIGHT(1, 0) }

/**
 * Pure helpers for authoring a heyawake question in the Admin screen, the analog of
 * frontend/src/components/HeyawakeEditor.tsx. The parser returns the canon
 * `{ width, height, rooms }` directly; the review step fixes mis-read clues, room
 * walls, and phantom/missed lines.
 *
 * Walls are edited a side of a cell at a time. Adding a wall inside a room splits the
 * room along that whole line (so it stays a rectangle); removing the wall between two
 * rooms merges them, allowed only when the union is a rectangle. Every edit rebuilds the
 * rooms from the cell grid, which also heals a parse that left gaps or overlaps.
 *
 * Heyawake has no solver gate, so the server only checks the schema. [problems] catches
 * what can't be right on its face: rooms that don't tile the grid, and a clue too big
 * for its room (shaded cells can't touch, so at most half the cells, rounded up).
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object HeyawakeAuthoring {

    const val PUZZLE_TYPE = 21

    /** Read a parser canon into a draft. */
    fun draftFromCanon(canon: JsonObject): HeyawakeDraft {
        val board = HeyawakeEngine.parseBoard(previewPuzzle(HeyawakeDraft()).copy(canonRepr = canon))
        return HeyawakeDraft(board.width, board.height, board.rooms)
    }

    /** The canon `{ width, height, rooms }` to POST; an unclued room sends `clue: null`. */
    fun canonFromDraft(draft: HeyawakeDraft): JsonObject = JsonObject(
        mapOf(
            "width" to JsonPrimitive(draft.width),
            "height" to JsonPrimitive(draft.height),
            "rooms" to JsonArray(draft.rooms.map { room ->
                JsonObject(
                    mapOf(
                        "r" to JsonPrimitive(room.r),
                        "c" to JsonPrimitive(room.c),
                        "w" to JsonPrimitive(room.w),
                        "h" to JsonPrimitive(room.h),
                        "clue" to (room.clue?.let { JsonPrimitive(it) } ?: JsonNull),
                    )
                )
            }),
        )
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: HeyawakeDraft): Puzzle = Puzzle(
        id = "admin-heyawake-draft-${draft.height}x${draft.width}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "heyawake",
        puzzleTypeJpLabel = "へやわけ",
        difficulty = 1,
        width = draft.width,
        height = draft.height,
        canonRepr = canonFromDraft(draft),
    )

    /** Most shaded cells a [w] x [h] room can hold with no two touching (a checkerboard). */
    fun maxClue(w: Int, h: Int): Int = (w * h + 1) / 2

    /** Set the clue of the room covering (col, row); null clears it. */
    fun setClue(draft: HeyawakeDraft, col: Int, row: Int, clue: Int?): HeyawakeDraft {
        val id = draft.roomAt(col, row) ?: return draft
        return draft.copy(rooms = draft.rooms.mapIndexed { i, room -> if (i == id) room.copy(clue = clue) else room })
    }

    /** Parse a typed clue: digits only; blank -> null (unclued). */
    fun parseClue(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()

    /** True when a wall separates (col, row) from its neighbour on [side]; false on the outer border. */
    fun hasWall(draft: HeyawakeDraft, col: Int, row: Int, side: WallSide): Boolean {
        val ids = draft.roomIds()
        val nc = col + side.dc
        val nr = row + side.dr
        if (nr !in 0 until draft.height || nc !in 0 until draft.width) return false
        if (row !in 0 until draft.height || col !in 0 until draft.width) return false
        return ids[row][col] != ids[nr][nc]
    }

    /**
     * Toggle the wall on [side] of (col, row). Adding one splits the room along that
     * line; removing one merges the two rooms. Returns [draft] unchanged when there's no
     * neighbour on that side or the merge wouldn't be a rectangle.
     */
    fun toggleWall(draft: HeyawakeDraft, col: Int, row: Int, side: WallSide): HeyawakeDraft {
        val nc = col + side.dc
        val nr = row + side.dr
        if (nr !in 0 until draft.height || nc !in 0 until draft.width) return draft
        if (row !in 0 until draft.height || col !in 0 until draft.width) return draft
        val ids = draft.roomIds()
        val a = ids[row][col]
        val b = ids[nr][nc]
        return if (a != b) merge(draft, ids, a, b) else split(draft, ids, col, row, side)
    }

    /** True when [toggleWall] on that side would change something. */
    fun canToggleWall(draft: HeyawakeDraft, col: Int, row: Int, side: WallSide): Boolean =
        toggleWall(draft, col, row, side) != draft

    private fun merge(draft: HeyawakeDraft, ids: Array<IntArray>, a: Int, b: Int): HeyawakeDraft {
        val merged = Array(draft.height) { r -> IntArray(draft.width) { c -> if (ids[r][c] == b) a else ids[r][c] } }
        val clues = cluesByTopLeft(draft).toMutableMap()
        // The merged room keeps whichever clue the two had (the top-left one's first).
        val roomA = draft.rooms.getOrNull(a)
        val roomB = draft.rooms.getOrNull(b)
        val keep = listOf(roomA, roomB).filterNotNull().sortedWith(compareBy({ it.r }, { it.c }))
            .firstNotNullOfOrNull { it.clue }
        val topLeft = listOfNotNull(roomA, roomB).minWithOrNull(compareBy({ it.r }, { it.c }))
        if (topLeft != null) clues[topLeft.r to topLeft.c] = keep
        return rebuild(draft, merged, clues) ?: draft
    }

    private fun split(draft: HeyawakeDraft, ids: Array<IntArray>, col: Int, row: Int, side: WallSide): HeyawakeDraft {
        val id = ids[row][col]
        val fresh = (ids.maxOfOrNull { it.maxOrNull() ?: -1 } ?: -1) + 1
        val next = Array(draft.height) { r -> ids[r].copyOf() }
        for (r in 0 until draft.height) {
            for (c in 0 until draft.width) {
                if (ids[r][c] != id) continue
                // The far side of the new line gets a new id; the side holding the room's
                // top-left keeps the old one (and its clue).
                val beyond = when (side) {
                    WallSide.TOP -> r < row
                    WallSide.BOTTOM -> r > row
                    WallSide.LEFT -> c < col
                    WallSide.RIGHT -> c > col
                }
                val farHalfHoldsTopLeft = side == WallSide.TOP || side == WallSide.LEFT
                if (beyond != farHalfHoldsTopLeft) next[r][c] = fresh
            }
        }
        return rebuild(draft, next, cluesByTopLeft(draft)) ?: draft
    }

    /**
     * Turn a cell -> id grid into rooms (one per connected id, in reading order of its
     * top-left cell), each taking the clue keyed at its top-left. Null if any room isn't a
     * rectangle.
     */
    private fun rebuild(
        draft: HeyawakeDraft,
        ids: Array<IntArray>,
        clues: Map<Pair<Int, Int>, Int?>,
    ): HeyawakeDraft? {
        val seen = Array(draft.height) { BooleanArray(draft.width) }
        val rooms = mutableListOf<Room>()
        for (r in 0 until draft.height) {
            for (c in 0 until draft.width) {
                if (seen[r][c]) continue
                val id = ids[r][c]
                var minR = r; var maxR = r; var minC = c; var maxC = c; var count = 0
                val stack = ArrayDeque(listOf(r to c))
                seen[r][c] = true
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    count++
                    minR = minOf(minR, cr); maxR = maxOf(maxR, cr)
                    minC = minOf(minC, cc); maxC = maxOf(maxC, cc)
                    for (s in WallSide.entries) {
                        val nr = cr + s.dr
                        val nc = cc + s.dc
                        if (nr in 0 until draft.height && nc in 0 until draft.width && !seen[nr][nc] && ids[nr][nc] == id) {
                            seen[nr][nc] = true
                            stack.addLast(nr to nc)
                        }
                    }
                }
                val w = maxC - minC + 1
                val h = maxR - minR + 1
                if (count != w * h) return null
                rooms += Room(minR, minC, w, h, clues[minR to minC])
            }
        }
        return draft.copy(rooms = rooms)
    }

    private fun cluesByTopLeft(draft: HeyawakeDraft): Map<Pair<Int, Int>, Int?> =
        draft.rooms.associate { (it.r to it.c) to it.clue }

    /** Append a row at the bottom as one unclued room — the fix for a row the parser missed. */
    fun addRow(draft: HeyawakeDraft): HeyawakeDraft =
        draft.copy(height = draft.height + 1, rooms = draft.rooms + Room(draft.height, 0, draft.width, 1, null))

    /** Append a column at the right as one unclued room. */
    fun addCol(draft: HeyawakeDraft): HeyawakeDraft =
        draft.copy(width = draft.width + 1, rooms = draft.rooms + Room(0, draft.width, 1, draft.height, null))

    /**
     * Drop row [row] — the fix for a parser's phantom line. Rooms crossing it lose a row,
     * rooms only in it disappear, rooms below move up. Keeps at least one row.
     */
    fun removeRow(draft: HeyawakeDraft, row: Int): HeyawakeDraft {
        if (draft.height <= 1 || row !in 0 until draft.height) return draft
        val rooms = draft.rooms.mapNotNull { room ->
            when {
                row in room.r until room.r + room.h -> room.copy(h = room.h - 1).takeIf { it.h > 0 }
                room.r > row -> room.copy(r = room.r - 1)
                else -> room
            }
        }
        return draft.copy(height = draft.height - 1, rooms = rooms)
    }

    fun removeCol(draft: HeyawakeDraft, col: Int): HeyawakeDraft {
        if (draft.width <= 1 || col !in 0 until draft.width) return draft
        val rooms = draft.rooms.mapNotNull { room ->
            when {
                col in room.c until room.c + room.w -> room.copy(w = room.w - 1).takeIf { it.w > 0 }
                room.c > col -> room.copy(c = room.c - 1)
                else -> room
            }
        }
        return draft.copy(width = draft.width - 1, rooms = rooms)
    }

    /** Blocking issues; empty when clean. Positions are 1-based "R3C5". */
    fun problems(draft: HeyawakeDraft): List<String> = buildList {
        if (draft.width <= 0 || draft.height <= 0) {
            add("No cells")
            return@buildList
        }
        if (draft.rooms.isEmpty()) {
            add("No rooms")
            return@buildList
        }
        val cover = Array(draft.height) { IntArray(draft.width) }
        for (room in draft.rooms) {
            if (room.r < 0 || room.c < 0 || room.r + room.h > draft.height || room.c + room.w > draft.width) {
                add("Room at R${room.r + 1}C${room.c + 1} runs off the grid")
            }
            for (r in room.r until room.r + room.h) {
                for (c in room.c until room.c + room.w) {
                    if (r in 0 until draft.height && c in 0 until draft.width) cover[r][c]++
                }
            }
            val clue = room.clue
            if (clue != null) {
                val max = maxClue(room.w, room.h)
                if (clue > max) add("Room at R${room.r + 1}C${room.c + 1}: clue $clue can't fit in ${room.w}×${room.h} (at most $max)")
            }
        }
        firstCell(cover) { it == 0 }?.let { (r, c) -> add("R${r + 1}C${c + 1} is in no room") }
        firstCell(cover) { it > 1 }?.let { (r, c) -> add("Rooms overlap at R${r + 1}C${c + 1}") }
    }

    private fun firstCell(grid: Array<IntArray>, pred: (Int) -> Boolean): Pair<Int, Int>? {
        for (r in grid.indices) for (c in grid[r].indices) if (pred(grid[r][c])) return r to c
        return null
    }
}
