package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.OminoTreeEngine.Arrow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Pure helpers for authoring an omino tree question in the Admin screen, the analog of
 * frontend/src/components/OminoTreeEditor.tsx. The draft is the [OminoTreeEngine.Board].
 *
 * Numbers are set per cell; a wall key ("h:r,c" / "v:r,c", the edge an arrow sits on)
 * cycles that edge's arrow none -> right/down -> left/up -> none. Rows and columns are
 * added or removed at the bottom/right edge. [formatProblems] mirrors the web editor's
 * (and the API's) checks and blocks creating or saving.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object OminoTreeAuthoring {

    const val PUZZLE_TYPE = 38

    /** The canon's board with [OminoTreeEngine.Board.numbers] made exactly rows x cols. */
    fun draftFromCanon(canon: JsonObject): OminoTreeEngine.Board {
        val b = OminoTreeEngine.parseBoard(canon)
        return b.copy(numbers = numberGrid(b, b.rows, b.cols))
    }

    /** The canon `{ rows, cols, numbers, arrows }` to POST, arrows sorted like the web editor. */
    fun canonFromDraft(draft: OminoTreeEngine.Board): JsonObject = JsonObject(
        mapOf(
            "rows" to JsonPrimitive(draft.rows),
            "cols" to JsonPrimitive(draft.cols),
            "numbers" to JsonArray(draft.numbers.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }),
            "arrows" to JsonArray(sorted(draft.arrows).map {
                JsonObject(mapOf("r" to JsonPrimitive(it.r), "c" to JsonPrimitive(it.c), "dir" to JsonPrimitive(it.dir)))
            }),
        ),
    )

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: OminoTreeEngine.Board): Puzzle = Puzzle(
        id = "admin-omino-tree-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "omino-tree",
        puzzleTypeJpLabel = "オミノツリー",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    fun parseNumber(text: String): Int? = text.filter { it.isDigit() }.take(3).toIntOrNull()?.takeIf { it > 0 }

    /** Set (or with null / 0 clear) the number in cell (r, c). */
    fun setNumber(draft: OminoTreeEngine.Board, r: Int, c: Int, n: Int?): OminoTreeEngine.Board {
        if (!draft.inside(r, c)) return draft
        return draft.copy(numbers = draft.numbers.mapIndexed { i, row ->
            if (i != r) row else row.mapIndexed { j, v -> if (j == c) (n ?: 0).coerceAtLeast(0) else v }
        })
    }

    /** Cycle the arrow on the edge with wall key [key]: none -> right/down -> left/up -> none. */
    fun cycleArrow(draft: OminoTreeEngine.Board, key: String): OminoTreeEngine.Board {
        val m = Regex("""([hv]):(\d+),(\d+)""").matchEntire(key) ?: return draft
        val r = m.groupValues[2].toInt()
        val c = m.groupValues[3].toInt()
        val (forward, backward) = if (m.groupValues[1] == "h") {
            if (r !in 0 until draft.rows - 1 || c !in 0 until draft.cols) return draft
            Arrow(r, c, "down") to Arrow(r + 1, c, "up")
        } else {
            if (r !in 0 until draft.rows || c !in 0 until draft.cols - 1) return draft
            Arrow(r, c, "right") to Arrow(r, c + 1, "left")
        }
        val current = draft.arrows.firstOrNull { it.edgeKey == key }
        val others = draft.arrows.filterNot { it.edgeKey == key }
        val next = when (current) {
            null -> forward
            forward -> backward
            else -> null
        }
        return draft.copy(arrows = sorted(if (next != null) others + next else others))
    }

    fun addRow(draft: OminoTreeEngine.Board, top: Boolean = false) =
        resized(shifted(draft, edgeShift(top, add = true), 0), draft.rows + 1, draft.cols)

    fun addCol(draft: OminoTreeEngine.Board, left: Boolean = false) =
        resized(shifted(draft, 0, edgeShift(left, add = true)), draft.rows, draft.cols + 1)

    fun removeEdgeRow(draft: OminoTreeEngine.Board, top: Boolean) =
        if (draft.rows <= 2) draft else resized(shifted(draft, edgeShift(top, add = false), 0), draft.rows - 1, draft.cols)

    fun removeEdgeCol(draft: OminoTreeEngine.Board, left: Boolean) =
        if (draft.cols <= 2) draft else resized(shifted(draft, 0, edgeShift(left, add = false)), draft.rows, draft.cols - 1)

    /** Move the numbers and arrows by ([dr], [dc]) cells; [resized] drops what falls off. */
    private fun shifted(d: OminoTreeEngine.Board, dr: Int, dc: Int): OminoTreeEngine.Board =
        if (dr == 0 && dc == 0) d else d.copy(
            numbers = numberGrid(d, d.rows, d.cols).shifted(dr, dc, d.cols, 0),
            arrows = d.arrows.map { it.copy(r = it.r + dr, c = it.c + dc) },
        )

    private fun sorted(arrows: List<Arrow>) = arrows.sortedWith(compareBy({ it.r }, { it.c }, { it.dir }))

    private fun numberGrid(draft: OminoTreeEngine.Board, rows: Int, cols: Int) =
        List(rows) { r -> List(cols) { c -> draft.number(r, c) } }

    private fun resized(draft: OminoTreeEngine.Board, rows: Int, cols: Int): OminoTreeEngine.Board {
        val inside = { r: Int, c: Int -> r in 0 until rows && c in 0 until cols }
        return OminoTreeEngine.Board(
            rows,
            cols,
            numberGrid(draft, rows, cols),
            draft.arrows.filter { a -> inside(a.r, a.c) && a.end.let { (r, c) -> inside(r, c) } },
        )
    }

    /** Problems the API rejects too (port of ominoTreeFormatProblems); they block saving. */
    fun formatProblems(draft: OminoTreeEngine.Board): List<String> = buildList {
        if (draft.numbers.size != draft.rows || draft.numbers.any { it.size != draft.cols }) {
            add("Numbers must be ${draft.rows}x${draft.cols}")
        }
        val seen = mutableSetOf<String>()
        for (a in draft.arrows) {
            val (r2, c2) = a.end
            if (!draft.inside(a.r, a.c) || !draft.inside(r2, c2)) {
                add("Arrow ${a.dir} from (${a.r},${a.c}) leaves the grid")
                continue
            }
            if (!seen.add(a.edgeKey)) add("Two arrows on the edge at (${a.r},${a.c}) ${a.dir}")
        }
    }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: OminoTreeEngine.Board): List<String> = buildList {
        if (draft.rows < 2 || draft.cols < 2) {
            add("No grid")
            return@buildList
        }
        addAll(formatProblems(draft))
        if (draft.arrows.isEmpty()) add("No arrows")
    }
}
