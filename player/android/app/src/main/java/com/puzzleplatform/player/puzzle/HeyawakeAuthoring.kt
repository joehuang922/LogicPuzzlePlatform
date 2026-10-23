package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HeyawakeEngine.Room
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable layout of a heyawake being authored, stored as its walls rather than its
 * rooms so the editor can hold any interim shape: [hWalls] (`height - 1` rows of `width`)
 * is the wall under each cell, [vWalls] (`height` rows of `width - 1`) the wall to its
 * right. A room is whatever the walls enclose (see [regions]), and [clues] pins each clue
 * to a cell, keyed (row, col).
 *
 * Mid-edit the rooms may be L-shaped, hold two clues, or have a wall that stops halfway
 * through them. That is fine here; [HeyawakeAuthoring.formatProblems] lists it and the
 * question can't be created until it's gone.
 */
data class HeyawakeDraft(
    val width: Int = 0,
    val height: Int = 0,
    val hWalls: List<List<Boolean>> = emptyList(),
    val vWalls: List<List<Boolean>> = emptyList(),
    val clues: Map<Pair<Int, Int>, Int> = emptyMap(),
) {
    /** Region index per cell (rows of columns), numbered in reading order of each region's first cell. */
    fun regionIds(): Array<IntArray> {
        val ids = Array(height) { IntArray(width) { -1 } }
        var next = 0
        for (r in 0 until height) {
            for (c in 0 until width) {
                if (ids[r][c] >= 0) continue
                val id = next++
                ids[r][c] = id
                val stack = ArrayDeque(listOf(r to c))
                while (stack.isNotEmpty()) {
                    val (cr, cc) = stack.removeLast()
                    for (side in WallSide.entries) {
                        val nr = cr + side.dr
                        val nc = cc + side.dc
                        if (nr !in 0 until height || nc !in 0 until width || ids[nr][nc] >= 0) continue
                        if (wallBetween(cr, cc, side)) continue
                        ids[nr][nc] = id
                        stack.addLast(nr to nc)
                    }
                }
            }
        }
        return ids
    }

    /** The rooms the walls currently enclose, in [regionIds] order. */
    fun regions(): List<HeyawakeRegion> {
        val ids = regionIds()
        val cells = mutableMapOf<Int, MutableList<Pair<Int, Int>>>()
        for (r in 0 until height) for (c in 0 until width) cells.getOrPut(ids[r][c]) { mutableListOf() } += r to c
        return cells.keys.sorted().map { id -> HeyawakeRegion(cells.getValue(id), clues) }
    }

    /** The room covering (col, row), or null off-grid. */
    fun regionAt(col: Int, row: Int): HeyawakeRegion? {
        if (row !in 0 until height || col !in 0 until width) return null
        return regions()[regionIds()[row][col]]
    }

    /** True when a wall sits on [side] of (row, col); false on the outer border. */
    fun wallBetween(row: Int, col: Int, side: WallSide): Boolean = when (side) {
        WallSide.TOP -> row > 0 && hWalls[row - 1][col]
        WallSide.BOTTOM -> row < height - 1 && hWalls[row][col]
        WallSide.LEFT -> col > 0 && vWalls[row][col - 1]
        WallSide.RIGHT -> col < width - 1 && vWalls[row][col]
    }
}

/**
 * One room as the walls enclose it: its [cells] (row, col) in reading order and its
 * bounding box. Only a [isRectangle] room can go in the canon.
 */
class HeyawakeRegion(val cells: List<Pair<Int, Int>>, allClues: Map<Pair<Int, Int>, Int>) {
    val r: Int = cells.minOf { it.first }
    val c: Int = cells.minOf { it.second }
    val w: Int = cells.maxOf { it.second } - c + 1
    val h: Int = cells.maxOf { it.first } - r + 1
    val isRectangle: Boolean get() = cells.size == w * h

    /** The clue-bearing cells; more than one is a format problem. */
    val clueCells: List<Pair<Int, Int>> = cells.filter { it in allClues }
    val clue: Int? = clueCells.firstOrNull()?.let { allClues[it] }

    /** "R3C5" of the first cell, for messages. */
    val label: String get() = "R${cells[0].first + 1}C${cells[0].second + 1}"
}

/** A side of a cell, for wall edits. */
enum class WallSide(val dc: Int, val dr: Int) { TOP(0, -1), BOTTOM(0, 1), LEFT(-1, 0), RIGHT(1, 0) }

/**
 * Pure helpers for authoring a heyawake question in the Admin screen, the analog of
 * frontend/src/components/HeyawakeEditor.tsx. The parser returns the canon
 * `{ width, height, rooms }`; the review step fixes mis-read clues, room walls, and
 * phantom/missed lines.
 *
 * Every wall toggles freely, one side of a cell at a time, so the rooms can pass through
 * shapes the canon can't hold (an L, a half-drawn split line, two clues after a merge).
 * Those are [formatProblems]: shown while editing, and a hard block on creating the
 * question, which the server enforces too (rooms must tile the grid). [problems] adds
 * what is merely implausible — a clue too big for its room — which the admin may
 * override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object HeyawakeAuthoring {

    const val PUZZLE_TYPE = 21

    /** Read a parser canon into a draft. */
    fun draftFromCanon(canon: JsonObject): HeyawakeDraft {
        val board = HeyawakeEngine.parseBoard(
            Puzzle(
                id = "admin-heyawake-draft",
                puzzleType = PUZZLE_TYPE,
                puzzleTypeName = "heyawake",
                puzzleTypeJpLabel = "へやわけ",
                difficulty = 1,
                width = 0,
                height = 0,
                canonRepr = canon,
            )
        )
        return draftFromRooms(board.width, board.height, board.rooms)
    }

    /**
     * Walls wherever two cells fall in different rooms (a later room wins an overlap, a
     * cell no room covers counts as its own "room"), and each clue on its room's
     * top-left cell. A parse that left gaps or overlaps shows up as format problems.
     */
    fun draftFromRooms(width: Int, height: Int, rooms: List<Room>): HeyawakeDraft {
        if (width <= 0 || height <= 0) return HeyawakeDraft()
        val ids = HeyawakeEngine.computeRoomIds(HeyawakeEngine.Board(width, height, rooms))
        val clues = mutableMapOf<Pair<Int, Int>, Int>()
        for (room in rooms) {
            val clue = room.clue ?: continue
            if (room.r in 0 until height && room.c in 0 until width) clues[room.r to room.c] = clue
        }
        return HeyawakeDraft(
            width = width,
            height = height,
            hWalls = List(height - 1) { r -> List(width) { c -> ids[r][c] != ids[r + 1][c] } },
            vWalls = List(height) { r -> List(width - 1) { c -> ids[r][c] != ids[r][c + 1] } },
            clues = clues,
        )
    }

    /**
     * The canon `{ width, height, rooms }` to POST; an unclued room sends `clue: null`.
     * Only meaningful once [formatProblems] is empty — each room is its region's bounding
     * box, so an L-shaped region would come out as overlapping rooms.
     */
    fun canonFromDraft(draft: HeyawakeDraft): JsonObject = JsonObject(
        mapOf(
            "width" to JsonPrimitive(draft.width),
            "height" to JsonPrimitive(draft.height),
            "rooms" to JsonArray(draft.regions().map { room ->
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

    /** Most shaded cells a [w] x [h] room can hold with no two touching (a checkerboard). */
    fun maxClue(w: Int, h: Int): Int = (w * h + 1) / 2

    /**
     * Set the clue of the room covering (col, row); null clears it. The room ends up with
     * exactly one clue (or none), on the cell that already held one, else its first cell.
     */
    fun setClue(draft: HeyawakeDraft, col: Int, row: Int, clue: Int?): HeyawakeDraft {
        val room = draft.regionAt(col, row) ?: return draft
        val clues = draft.clues - room.cells.toSet()
        if (clue == null) return draft.copy(clues = clues)
        val at = room.clueCells.firstOrNull() ?: room.cells.first()
        return draft.copy(clues = clues + (at to clue))
    }

    /** Parse a typed clue: digits only; blank -> null (unclued). */
    fun parseClue(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()

    /** True when a wall separates (col, row) from its neighbour on [side]; false on the outer border. */
    fun hasWall(draft: HeyawakeDraft, col: Int, row: Int, side: WallSide): Boolean {
        if (row !in 0 until draft.height || col !in 0 until draft.width) return false
        return draft.wallBetween(row, col, side)
    }

    /** True when [side] of (col, row) is an interior edge, i.e. a wall can go there. */
    fun canToggleWall(draft: HeyawakeDraft, col: Int, row: Int, side: WallSide): Boolean =
        row in 0 until draft.height && col in 0 until draft.width &&
            row + side.dr in 0 until draft.height && col + side.dc in 0 until draft.width

    /** Flip the wall on [side] of (col, row). Clues stay on their cells. */
    fun toggleWall(draft: HeyawakeDraft, col: Int, row: Int, side: WallSide): HeyawakeDraft {
        if (!canToggleWall(draft, col, row, side)) return draft
        return when (side) {
            WallSide.TOP -> draft.copy(hWalls = draft.hWalls.flip(row - 1, col))
            WallSide.BOTTOM -> draft.copy(hWalls = draft.hWalls.flip(row, col))
            WallSide.LEFT -> draft.copy(vWalls = draft.vWalls.flip(row, col - 1))
            WallSide.RIGHT -> draft.copy(vWalls = draft.vWalls.flip(row, col))
        }
    }

    private fun List<List<Boolean>>.flip(r: Int, c: Int) =
        mapIndexed { i, line -> if (i == r) line.mapIndexed { j, v -> if (j == c) !v else v } else line }

    /** Append a row at the bottom as one unclued room — the fix for a row the parser missed. */
    fun addRow(draft: HeyawakeDraft): HeyawakeDraft {
        if (draft.width <= 0 || draft.height <= 0) return draft
        return draft.copy(
            height = draft.height + 1,
            hWalls = draft.hWalls + listOf(List(draft.width) { true }),
            vWalls = draft.vWalls + listOf(List(draft.width - 1) { false }),
        )
    }

    /** Append a column at the right as one unclued room. */
    fun addCol(draft: HeyawakeDraft): HeyawakeDraft = transpose(addRow(transpose(draft)))

    /**
     * Drop row [row] — the fix for a parser's phantom line. The cells above and below it
     * meet with a wall where either of its two lines had one, so a room crossing it just
     * loses a row and a room only in it disappears. A clue in the row moves into the rest
     * of its room when there is any. Keeps at least one row.
     */
    fun removeRow(draft: HeyawakeDraft, row: Int): HeyawakeDraft {
        if (draft.height <= 1 || row !in 0 until draft.height) return draft
        val h = draft.hWalls
        val hWalls = when (row) {
            0 -> h.drop(1)
            draft.height - 1 -> h.dropLast(1)
            else -> h.take(row - 1) + listOf(h[row - 1].zip(h[row]) { a, b -> a || b }) + h.drop(row + 1)
        }
        val clues = mutableMapOf<Pair<Int, Int>, Int>()
        for ((cell, clue) in draft.clues) {
            val (r, c) = cell
            val moved = when {
                r != row -> cell
                r + 1 < draft.height && !draft.wallBetween(r, c, WallSide.BOTTOM) -> r + 1 to c
                r > 0 && !draft.wallBetween(r, c, WallSide.TOP) -> r - 1 to c
                else -> continue
            }
            val shifted = if (moved.first > row) moved.first - 1 to moved.second else moved
            clues.putIfAbsent(shifted, clue)
        }
        return draft.copy(
            height = draft.height - 1,
            hWalls = hWalls,
            vWalls = draft.vWalls.filterIndexed { i, _ -> i != row },
            clues = clues,
        )
    }

    fun removeCol(draft: HeyawakeDraft, col: Int): HeyawakeDraft = transpose(removeRow(transpose(draft), col))

    /** The same draft with rows and columns swapped, so column edits can reuse the row ones. */
    private fun transpose(draft: HeyawakeDraft): HeyawakeDraft = if (draft.width <= 0 || draft.height <= 0) draft else HeyawakeDraft(
        width = draft.height,
        height = draft.width,
        hWalls = List(draft.width - 1) { c -> List(draft.height) { r -> draft.vWalls[r][c] } },
        vWalls = List(draft.width) { c -> List(draft.height - 1) { r -> draft.hWalls[r][c] } },
        clues = draft.clues.mapKeys { (cell, _) -> cell.second to cell.first },
    )

    /**
     * What keeps the draft from being a heyawake canon at all: rooms that aren't
     * rectangles, rooms with more than one clue, and walls that end inside a room
     * (the canon has no way to say them). Empty when the walls tile the grid into
     * rectangles. Creating the question is refused while any remain.
     */
    fun formatProblems(draft: HeyawakeDraft): List<String> = buildList {
        if (draft.width <= 0 || draft.height <= 0) {
            add("No cells")
            return@buildList
        }
        val ids = draft.regionIds()
        val innerWall = mutableSetOf<Int>()
        for (r in 0 until draft.height) {
            for (c in 0 until draft.width) {
                if (r + 1 < draft.height && draft.hWalls[r][c] && ids[r][c] == ids[r + 1][c]) innerWall += ids[r][c]
                if (c + 1 < draft.width && draft.vWalls[r][c] && ids[r][c] == ids[r][c + 1]) innerWall += ids[r][c]
            }
        }
        draft.regions().forEachIndexed { id, room ->
            if (!room.isRectangle) add("Room at ${room.label} isn't a rectangle")
            if (room.clueCells.size > 1) add("Room at ${room.label} has ${room.clueCells.size} clues")
            if (id in innerWall) add("Room at ${room.label} has a wall that doesn't close off a room")
        }
    }

    /** Every issue: the [formatProblems], then clues too big for their room. Empty when clean. */
    fun problems(draft: HeyawakeDraft): List<String> = formatProblems(draft) + buildList {
        for (room in draft.regions()) {
            val clue = room.clue ?: continue
            if (!room.isRectangle) continue
            val max = maxClue(room.w, room.h)
            if (clue > max) add("Room at ${room.label}: clue $clue can't fit in ${room.w}×${room.h} (at most $max)")
        }
    }
}
