package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.MinusRoomEngine.Circle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pure helpers for authoring a minus room question in the Admin screen, the analog of
 * frontend/src/components/MinusRoomEditor.tsx. The draft is the [MinusRoomEngine.Board].
 *
 * Givens are set per cell, a wall key ("h:r,c" / "v:r,c") toggles a room wall, and the
 * same edge (as doubled coordinates) holds a circled difference. Max is set directly; rows
 * and columns are added or removed at the bottom/right edge. [formatProblems] mirrors the
 * web editor's (and the API's) checks and blocks creating or saving.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object MinusRoomAuthoring {

    const val PUZZLE_TYPE = 39

    /** The canon's board with cells and walls made exactly the grid's size. */
    fun draftFromCanon(canon: JsonObject): MinusRoomEngine.Board {
        val b = MinusRoomEngine.parseBoard(canon)
        return resized(b, b.rows, b.cols)
    }

    fun canonFromDraft(draft: MinusRoomEngine.Board): JsonObject {
        fun grid(g: List<List<Int>>) = JsonArray(g.map { row -> JsonArray(row.map { JsonPrimitive(it) }) })
        return JsonObject(
            mapOf(
                "rows" to JsonPrimitive(draft.rows),
                "cols" to JsonPrimitive(draft.cols),
                "max" to JsonPrimitive(draft.max),
                "cells" to grid(draft.cells),
                "edges" to JsonObject(mapOf("h" to grid(draft.h), "v" to grid(draft.v))),
                "circles" to JsonArray(sorted(draft.circles).map {
                    JsonObject(
                        mapOf("dr" to JsonPrimitive(it.dr), "dc" to JsonPrimitive(it.dc), "value" to JsonPrimitive(it.value)),
                    )
                }),
            ),
        )
    }

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: MinusRoomEngine.Board): Puzzle = Puzzle(
        id = "admin-minus-room-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "minus-room",
        puzzleTypeJpLabel = "マイナルーム",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** A given or max: a positive number, or null for blank. */
    fun parseNumber(text: String): Int? = text.filter { it.isDigit() }.take(1).toIntOrNull()?.takeIf { it > 0 }

    /** A circled difference: 0 counts, blank is null. */
    fun parseDifference(text: String): Int? = text.filter { it.isDigit() }.take(1).toIntOrNull()

    fun setGiven(draft: MinusRoomEngine.Board, r: Int, c: Int, n: Int?): MinusRoomEngine.Board {
        if (!draft.inside(r, c)) return draft
        return draft.copy(cells = draft.cells.mapIndexed { i, row ->
            if (i != r) row else row.mapIndexed { j, v -> if (j == c) (n ?: 0).coerceAtLeast(0) else v }
        })
    }

    /** Toggle the room wall with key "h:r,c" / "v:r,c". */
    fun toggleWall(draft: MinusRoomEngine.Board, key: String): MinusRoomEngine.Board {
        val (kind, r, c) = parseKey(key) ?: return draft
        fun flip(g: List<List<Int>>) = g.mapIndexed { i, row -> if (i != r) row else row.mapIndexed { j, v -> if (j == c) 1 - v else v } }
        return when (kind) {
            "h" -> if (r in 0 until draft.rows - 1 && c in 0 until draft.cols) draft.copy(h = flip(draft.h)) else draft
            else -> if (r in 0 until draft.rows && c in 0 until draft.cols - 1) draft.copy(v = flip(draft.v)) else draft
        }
    }

    /** The doubled coordinates of the edge with wall key [key], or null. */
    fun edgeOf(key: String): Pair<Int, Int>? {
        val (kind, r, c) = parseKey(key) ?: return null
        return if (kind == "h") (2 * r + 1) to (2 * c) else (2 * r) to (2 * c + 1)
    }

    /** Set (or with null clear) the circled difference on the edge at doubled (dr, dc). */
    fun setCircle(draft: MinusRoomEngine.Board, dr: Int, dc: Int, value: Int?): MinusRoomEngine.Board {
        val others = draft.circles.filterNot { it.dr == dr && it.dc == dc }
        return draft.copy(circles = sorted(if (value != null) others + Circle(dr, dc, value) else others))
    }

    fun setMax(draft: MinusRoomEngine.Board, max: Int?): MinusRoomEngine.Board =
        if (max == null || max !in 1..9) draft else draft.copy(max = max)

    fun addRow(draft: MinusRoomEngine.Board) = resized(draft, draft.rows + 1, draft.cols)

    fun addCol(draft: MinusRoomEngine.Board) = resized(draft, draft.rows, draft.cols + 1)

    fun removeLastRow(draft: MinusRoomEngine.Board) =
        if (draft.rows <= 2) draft else resized(draft, draft.rows - 1, draft.cols)

    fun removeLastCol(draft: MinusRoomEngine.Board) =
        if (draft.cols <= 2) draft else resized(draft, draft.rows, draft.cols - 1)

    private fun parseKey(key: String): Triple<String, Int, Int>? {
        val m = Regex("""([hv]):(\d+),(\d+)""").matchEntire(key) ?: return null
        return Triple(m.groupValues[1], m.groupValues[2].toInt(), m.groupValues[3].toInt())
    }

    private fun sorted(circles: List<Circle>) = circles.sortedWith(compareBy({ it.dr }, { it.dc }))

    private fun resized(d: MinusRoomEngine.Board, rows: Int, cols: Int): MinusRoomEngine.Board {
        fun grid(g: List<List<Int>>, h: Int, w: Int) =
            List(maxOf(h, 0)) { r -> List(maxOf(w, 0)) { c -> g.getOrNull(r)?.getOrNull(c) ?: 0 } }
        return MinusRoomEngine.Board(
            rows = rows,
            cols = cols,
            max = d.max,
            cells = grid(d.cells, rows, cols),
            h = grid(d.h, rows - 1, cols),
            v = grid(d.v, rows, cols - 1),
            circles = d.circles.filter { it.dr <= 2 * (rows - 1) && it.dc <= 2 * (cols - 1) },
        )
    }

    /** Walls that end inside a room (both sides in one room), as "h:r,c" / "v:r,c". */
    fun danglingWalls(draft: MinusRoomEngine.Board): List<String> {
        val rooms = MinusRoomEngine.roomIds(draft)
        return buildList {
            for (r in 0 until draft.rows - 1) for (c in 0 until draft.cols) {
                if (draft.wallBelow(r, c) && rooms[r][c] == rooms[r + 1][c]) add("h:$r,$c")
            }
            for (r in 0 until draft.rows) for (c in 0 until draft.cols - 1) {
                if (draft.wallRight(r, c) && rooms[r][c] == rooms[r][c + 1]) add("v:$r,$c")
            }
        }
    }

    /** Problems the API rejects too (port of minusRoomFormatProblems); they block saving. */
    fun formatProblems(draft: MinusRoomEngine.Board): List<String> = buildList {
        val (rows, cols, max) = Triple(draft.rows, draft.cols, draft.max)
        if (draft.cells.size != rows || draft.cells.any { it.size != cols }) add("Cells must be ${rows}x$cols")
        val fits = { g: List<List<Int>>, h: Int, w: Int -> g.size == h && g.all { it.size == w } }
        if (!fits(draft.h, rows - 1, cols) || !fits(draft.v, rows, cols - 1)) {
            add("Walls must fit the ${rows}x$cols grid")
            return@buildList
        }
        draft.cells.forEachIndexed { r, row ->
            row.forEachIndexed { c, v -> if (v > max) add("Given $v at ($r,$c) is above $max") }
        }
        val dangling = danglingWalls(draft).size
        if (dangling > 0) add("$dangling wall${if (dangling > 1) "s end" else " ends"} inside a room")
        val seen = mutableSetOf<Pair<Int, Int>>()
        for (k in draft.circles) {
            val at = "(${k.dr},${k.dc})"
            if (k.cells(rows, cols) == null) add("Circle at $at is not on an edge between two cells")
            if (k.value > max - 1) add("Circle ${k.value} at $at is $max or more")
            if (!seen.add(k.dr to k.dc)) add("Two circles at $at")
        }
    }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: MinusRoomEngine.Board): List<String> = buildList {
        if (draft.rows < 2 || draft.cols < 2) {
            add("No grid")
            return@buildList
        }
        val format = formatProblems(draft)
        addAll(format)
        if (format.isNotEmpty()) return@buildList
        val rooms = MinusRoomEngine.roomIds(draft)
        val sizes = rooms.flatMap { it.asList() }.groupingBy { it }.eachCount()
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            val g = draft.given(r, c)
            if (g > 0 && g > (sizes[rooms[r][c]] ?: 0)) add("Given $g at ($r,$c) is bigger than its room")
        }
        if (draft.cells.all { row -> row.all { it == 0 } } && draft.circles.isEmpty()) add("No givens or circles")
    }
}
