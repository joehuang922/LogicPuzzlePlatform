package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.abs
import kotlin.math.max

/**
 * Pure helpers for authoring a zebra rope question in the Admin screen, the analog of
 * frontend/src/components/ZebraRopeEditor.tsx. The draft is the [ZebraRopeEngine.Board].
 *
 * Ropes are drawn by drag (8-neighbour steps through cell centres); circles cycle on a
 * tap at an edge midpoint or corner. [formatProblems] mirrors the web editor's (and the
 * API's) checks and blocks creating or saving.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object ZebraRopeAuthoring {

    const val PUZZLE_TYPE = 36

    fun draftFromCanon(canon: JsonObject): ZebraRopeEngine.Board = ZebraRopeEngine.parseBoard(canon)

    /** The canon `{ width, height, ropes, circles }` to POST. */
    fun canonFromDraft(draft: ZebraRopeEngine.Board): JsonObject = JsonObject(
        mapOf(
            "width" to JsonPrimitive(draft.cols),
            "height" to JsonPrimitive(draft.rows),
            "ropes" to JsonArray(draft.ropes.map { rope ->
                JsonArray(rope.map { (r, c) -> JsonArray(listOf(JsonPrimitive(r), JsonPrimitive(c))) })
            }),
            "circles" to JsonArray(draft.circles.map { c ->
                JsonObject(mapOf("dr" to JsonPrimitive(c.dr), "dc" to JsonPrimitive(c.dc), "color" to JsonPrimitive(c.color)))
            }),
        ),
    )

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: ZebraRopeEngine.Board): Puzzle = Puzzle(
        id = "admin-zebra-rope-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "zebra-rope",
        puzzleTypeJpLabel = "シマシマロープ",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Cycle the circle at (dr, dc): none -> white -> gray -> black -> none, as on the web. */
    fun cycleCircle(draft: ZebraRopeEngine.Board, dr: Int, dc: Int): ZebraRopeEngine.Board {
        if (!KuralinEngine.isValidPoint(dr, dc, draft.rows, draft.cols)) return draft
        val current = draft.circles.firstOrNull { it.dr == dr && it.dc == dc }?.color
        val rest = draft.circles.filterNot { it.dr == dr && it.dc == dc }
        val next = when (current) {
            null -> ZebraRopeEngine.WHITE_CIRCLE
            ZebraRopeEngine.WHITE_CIRCLE -> ZebraRopeEngine.GRAY_CIRCLE
            ZebraRopeEngine.GRAY_CIRCLE -> ZebraRopeEngine.BLACK_CIRCLE
            else -> null
        }
        val circles = if (next == null) rest else rest + ZebraRopeEngine.Circle(dr, dc, next)
        return draft.copy(circles = circles.sortedWith(compareBy({ it.dr }, { it.dc })))
    }

    /**
     * One step of drawing a rope by drag, as on the web editor: the previous cell undoes the
     * last step; an unvisited 8-neighbour of the last cell extends the rope; anything else
     * leaves it. Cells are (row, col).
     */
    fun extendRope(rope: List<Pair<Int, Int>>, cell: Pair<Int, Int>): List<Pair<Int, Int>> {
        val last = rope.lastOrNull() ?: return listOf(cell)
        if (cell == last) return rope
        if (rope.size >= 2 && cell == rope[rope.size - 2]) return rope.dropLast(1)
        if (max(abs(cell.first - last.first), abs(cell.second - last.second)) != 1) return rope
        if (cell in rope) return rope
        return rope + cell
    }

    /** Add a drawn rope; shorter than 2 cells is ignored. */
    fun addRope(draft: ZebraRopeEngine.Board, rope: List<Pair<Int, Int>>): ZebraRopeEngine.Board =
        if (rope.size < 2) draft else draft.copy(ropes = draft.ropes + listOf(rope))

    /** Delete the last-drawn rope through (row, col), if any. */
    fun removeRopeAt(draft: ZebraRopeEngine.Board, row: Int, col: Int): ZebraRopeEngine.Board {
        val i = draft.ropes.indexOfLast { (row to col) in it }
        return if (i < 0) draft else draft.copy(ropes = draft.ropes.filterIndexed { j, _ -> j != i })
    }

    fun addRow(draft: ZebraRopeEngine.Board): ZebraRopeEngine.Board = draft.copy(rows = draft.rows + 1)

    fun addCol(draft: ZebraRopeEngine.Board): ZebraRopeEngine.Board = draft.copy(cols = draft.cols + 1)

    /** Drop the bottom row; ropes reaching it and circles leaving the interior go with it. */
    fun removeLastRow(draft: ZebraRopeEngine.Board): ZebraRopeEngine.Board =
        if (draft.rows <= 2) draft else resized(draft, draft.rows - 1, draft.cols)

    fun removeLastCol(draft: ZebraRopeEngine.Board): ZebraRopeEngine.Board =
        if (draft.cols <= 2) draft else resized(draft, draft.rows, draft.cols - 1)

    private fun resized(draft: ZebraRopeEngine.Board, rows: Int, cols: Int) = ZebraRopeEngine.Board(
        rows,
        cols,
        draft.ropes.filter { rope -> rope.all { (r, c) -> r < rows && c < cols } },
        draft.circles.filter { KuralinEngine.isValidPoint(it.dr, it.dc, rows, cols) },
    )

    /** Problems the API rejects too (port of zebraRopeFormatProblems); they block saving. */
    fun formatProblems(draft: ZebraRopeEngine.Board): List<String> = buildList {
        draft.ropes.forEachIndexed { i, rope ->
            if (rope.size < 2) add("Rope ${i + 1} has fewer than 2 cells")
            val seen = mutableSetOf<Pair<Int, Int>>()
            rope.forEachIndexed { j, (r, c) ->
                if (r !in 0 until draft.rows || c !in 0 until draft.cols) add("Rope ${i + 1} leaves the grid at R${r + 1}C${c + 1}")
                if (!seen.add(r to c)) add("Rope ${i + 1} passes R${r + 1}C${c + 1} twice")
                if (j > 0) {
                    val (pr, pc) = rope[j - 1]
                    if (max(abs(pr - r), abs(pc - c)) != 1) {
                        add("Rope ${i + 1} jumps from R${pr + 1}C${pc + 1} to R${r + 1}C${c + 1}")
                    }
                }
            }
        }
        val seen = mutableSetOf<Pair<Int, Int>>()
        for (c in draft.circles) {
            if (!KuralinEngine.isValidPoint(c.dr, c.dc, draft.rows, draft.cols)) {
                add("Circle at (${c.dr},${c.dc}) is not on an interior grid line")
            }
            if (!seen.add(c.dr to c.dc)) add("Two circles at (${c.dr},${c.dc})")
        }
    }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: ZebraRopeEngine.Board): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        addAll(formatProblems(draft))
        if (draft.ropes.isEmpty() && draft.circles.isEmpty()) add("No ropes or circles")
    }
}
