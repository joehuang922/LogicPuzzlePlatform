package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable layout of a ripple effect being authored: the same walls the canon's
 * `edges` hold — [hWalls] (`height - 1` rows of `width`) is the wall under each cell,
 * [vWalls] (`height` rows of `width - 1`) the wall to its right — plus the given numbers,
 * keyed (row, col). A room is whatever the walls enclose (see [regionIds]); unlike
 * heyawake it may be any shape and hold any number of clues.
 *
 * Mid-edit a wall may stop halfway through a room. That is fine here;
 * [RippleEffectAuthoring.formatProblems] lists it and the question can't be created until
 * it's gone.
 */
data class RippleEffectDraft(
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

    /** Each room's cells (row, col) in reading order, in [regionIds] order. */
    fun regions(): List<List<Pair<Int, Int>>> {
        val ids = regionIds()
        val cells = sortedMapOf<Int, MutableList<Pair<Int, Int>>>()
        for (r in 0 until height) for (c in 0 until width) cells.getOrPut(ids[r][c]) { mutableListOf() } += r to c
        return cells.values.toList()
    }

    /** The cells of the room covering (col, row), or null off-grid. */
    fun regionAt(col: Int, row: Int): List<Pair<Int, Int>>? {
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

    /**
     * Ids of the rooms a wall runs into without closing them off (the same room on both
     * of its sides) — the only format problem a ripple effect layout can have.
     */
    fun roomsWithDanglingWalls(ids: Array<IntArray> = regionIds()): Set<Int> = buildSet {
        for (r in 0 until height) for (c in 0 until width) {
            if (r + 1 < height && hWalls[r][c] && ids[r][c] == ids[r + 1][c]) add(ids[r][c])
            if (c + 1 < width && vWalls[r][c] && ids[r][c] == ids[r][c + 1]) add(ids[r][c])
        }
    }
}

/**
 * Pure helpers for authoring a ripple effect question in the Admin screen, the analog of
 * frontend/src/components/RippleEffectEditor.tsx. The parser returns the canon
 * `{ cells, edges: { h, v } }`; the review step fixes mis-read numbers, room walls, and
 * phantom/missed lines.
 *
 * Every wall toggles freely, one side of a cell at a time. A wall that ends inside a
 * room is a [formatProblems] entry: shown while editing, and a hard block on creating
 * the question, which the server enforces too. [problems] adds what is merely
 * implausible for a mis-read — a number bigger than its room, a number twice in one
 * room, two equal numbers too close in a line — which the admin may override.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object RippleEffectAuthoring {

    const val PUZZLE_TYPE = 25

    /** Read a parser canon into a draft (ragged or missing grids read as 0 / no wall). */
    fun draftFromCanon(canon: JsonObject): RippleEffectDraft {
        val puzzle = Puzzle(
            id = "admin-ripple-effect-draft",
            puzzleType = PUZZLE_TYPE,
            puzzleTypeName = "ripple-effect",
            puzzleTypeJpLabel = "波及効果",
            difficulty = 1,
            canonRepr = canon,
        )
        val cells = RippleEffectEngine.parseCells(puzzle)
        val height = cells.size
        val width = cells.maxOfOrNull { it.size } ?: 0
        if (width <= 0 || height <= 0) return RippleEffectDraft()
        val edges = RippleEffectEngine.parseEdges(puzzle)
        val clues = mutableMapOf<Pair<Int, Int>, Int>()
        for (r in 0 until height) for (c in 0 until width) {
            val v = cells[r].getOrNull(c) ?: 0
            if (v > 0) clues[r to c] = v
        }
        return RippleEffectDraft(
            width = width,
            height = height,
            hWalls = List(height - 1) { r -> List(width) { c -> edges.h[r][c] == 1 } },
            vWalls = List(height) { r -> List(width - 1) { c -> edges.v[r][c] == 1 } },
            clues = clues,
        )
    }

    /** The canon `{ cells, edges: { h, v } }` to POST. */
    fun canonFromDraft(draft: RippleEffectDraft): JsonObject {
        fun grid(lines: List<List<Boolean>>) =
            JsonArray(lines.map { line -> JsonArray(line.map { JsonPrimitive(if (it) 1 else 0) }) })
        return JsonObject(
            mapOf(
                "cells" to JsonArray(List(draft.height) { r ->
                    JsonArray(List(draft.width) { c -> JsonPrimitive(draft.clues[r to c] ?: 0) })
                }),
                "edges" to JsonObject(mapOf("h" to grid(draft.hWalls), "v" to grid(draft.vWalls))),
            )
        )
    }

    /** Set the given number of cell (col, row); null clears it. */
    fun setClue(draft: RippleEffectDraft, col: Int, row: Int, clue: Int?): RippleEffectDraft {
        if (row !in 0 until draft.height || col !in 0 until draft.width) return draft
        val at = row to col
        return draft.copy(clues = if (clue == null) draft.clues - at else draft.clues + (at to clue))
    }

    /** Parse a typed number: digits only; blank or 0 -> null (empty cell, as in the canon). */
    fun parseClue(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()?.takeIf { it > 0 }

    /** True when a wall separates (col, row) from its neighbour on [side]; false on the outer border. */
    fun hasWall(draft: RippleEffectDraft, col: Int, row: Int, side: WallSide): Boolean {
        if (row !in 0 until draft.height || col !in 0 until draft.width) return false
        return draft.wallBetween(row, col, side)
    }

    /** True when [side] of (col, row) is an interior edge, i.e. a wall can go there. */
    fun canToggleWall(draft: RippleEffectDraft, col: Int, row: Int, side: WallSide): Boolean =
        row in 0 until draft.height && col in 0 until draft.width &&
            row + side.dr in 0 until draft.height && col + side.dc in 0 until draft.width

    /** Flip the wall on [side] of (col, row). Numbers stay on their cells. */
    fun toggleWall(draft: RippleEffectDraft, col: Int, row: Int, side: WallSide): RippleEffectDraft {
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

    /** Append a row at the bottom as one empty room — the fix for a row the parser missed. */
    fun addRow(draft: RippleEffectDraft): RippleEffectDraft {
        if (draft.width <= 0 || draft.height <= 0) return draft
        return draft.copy(
            height = draft.height + 1,
            hWalls = draft.hWalls + listOf(List(draft.width) { true }),
            vWalls = draft.vWalls + listOf(List(draft.width - 1) { false }),
        )
    }

    /** Append a column at the right as one empty room. */
    fun addCol(draft: RippleEffectDraft): RippleEffectDraft = transpose(addRow(transpose(draft)))

    /**
     * Drop row [row] — the fix for a parser's phantom line — and the numbers in it. The
     * cells above and below it meet with a wall where either of its two lines had one, so
     * a room crossing it just loses a row and a room only in it disappears. Keeps at least
     * one row.
     */
    fun removeRow(draft: RippleEffectDraft, row: Int): RippleEffectDraft {
        if (draft.height <= 1 || row !in 0 until draft.height) return draft
        val h = draft.hWalls
        val hWalls = when (row) {
            0 -> h.drop(1)
            draft.height - 1 -> h.dropLast(1)
            else -> h.take(row - 1) + listOf(h[row - 1].zip(h[row]) { a, b -> a || b }) + h.drop(row + 1)
        }
        val clues = draft.clues
            .filterKeys { it.first != row }
            .mapKeys { (cell, _) -> if (cell.first > row) cell.first - 1 to cell.second else cell }
        return draft.copy(
            height = draft.height - 1,
            hWalls = hWalls,
            vWalls = draft.vWalls.filterIndexed { i, _ -> i != row },
            clues = clues,
        )
    }

    fun removeCol(draft: RippleEffectDraft, col: Int): RippleEffectDraft =
        transpose(removeRow(transpose(draft), col))

    /** The same draft with rows and columns swapped, so column edits can reuse the row ones. */
    private fun transpose(draft: RippleEffectDraft): RippleEffectDraft =
        if (draft.width <= 0 || draft.height <= 0) draft else RippleEffectDraft(
            width = draft.height,
            height = draft.width,
            hWalls = List(draft.width - 1) { c -> List(draft.height) { r -> draft.vWalls[r][c] } },
            vWalls = List(draft.width) { c -> List(draft.height - 1) { r -> draft.hWalls[r][c] } },
            clues = draft.clues.mapKeys { (cell, _) -> cell.second to cell.first },
        )

    private fun label(cell: Pair<Int, Int>) = "R${cell.first + 1}C${cell.second + 1}"

    /**
     * What keeps the draft from being a ripple effect layout: an empty grid, or a wall
     * that ends inside a room (it would mark a border between two cells of one room).
     * Creating the question is refused while any remain.
     */
    fun formatProblems(draft: RippleEffectDraft): List<String> {
        if (draft.width <= 0 || draft.height <= 0) return listOf("No cells")
        val dangling = draft.roomsWithDanglingWalls()
        return draft.regions().withIndex()
            .filter { it.index in dangling }
            .map { "Room at ${label(it.value[0])} has a wall that doesn't close off a room" }
    }

    /**
     * Every issue: the [formatProblems], then numbers that can't be right — bigger than
     * their room, repeated within a room, or two equal numbers K fewer than K + 1 cells
     * apart in a row or column. Empty when clean.
     */
    fun problems(draft: RippleEffectDraft): List<String> = formatProblems(draft) + buildList {
        if (draft.width <= 0 || draft.height <= 0) return@buildList
        for (room in draft.regions()) {
            val given = room.mapNotNull { cell -> draft.clues[cell]?.let { cell to it } }
            for ((cell, clue) in given) {
                if (clue > room.size) add("${label(cell)}: $clue is more than its room's ${room.size} cells")
            }
            for ((clue, cells) in given.groupBy({ it.second }, { it.first })) {
                if (cells.size > 1) add("Room at ${label(room[0])} has $clue ${cells.size} times")
            }
        }
        // Scan each row, then each column, for an equal number within reach.
        for (cell in draft.clues.keys.sortedWith(compareBy({ it.first }, { it.second }))) {
            val k = draft.clues.getValue(cell)
            for (d in 1..k) {
                val right = cell.first to cell.second + d
                if (draft.clues[right] == k) add("Two ${k}s at ${label(cell)} and ${label(right)} are too close")
                val below = cell.first + d to cell.second
                if (draft.clues[below] == k) add("Two ${k}s at ${label(cell)} and ${label(below)} are too close")
            }
        }
    }
}
