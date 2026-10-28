package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The editable board of a kuralin being authored: its size and the circles on its grid
 * lines, in doubled coordinates (see [KuralinEngine]).
 */
data class KuralinDraft(
    val rows: Int = 0,
    val cols: Int = 0,
    val circles: List<KuralinEngine.Circle> = emptyList(),
) {
    fun circleAt(dr: Int, dc: Int): KuralinEngine.Circle? = circles.firstOrNull { it.dr == dr && it.dc == dc }
}

/**
 * Pure helpers for authoring a kuralin question in the Admin screen, the analog of
 * frontend/src/components/KuralinEditor.tsx. The parser returns the canon
 * `{ width, height, circles }` directly; the review step fixes mis-read circles and a
 * mis-counted grid.
 *
 * A tap on a grid line cycles the circle there none -> white -> black -> gray -> none, as on
 * the web. Rows and columns are added or removed at the bottom/right edge: the parser
 * counts lines from a uniform pitch, so a miscount shifts every circle and is fixed by
 * re-shooting rather than by deleting a line in the middle.
 *
 * Kuralin has no solver gate, so the server only checks the schema and that circles sit
 * on interior grid lines. Snapped taps and the edge-only resize keep every circle on a
 * valid point, so there are no format problems; [problems] flags a board with no circles.
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object KuralinAuthoring {

    const val PUZZLE_TYPE = 28

    /** Read a parser canon into a draft, dropping circles off the interior grid lines or of unknown color. */
    fun draftFromCanon(canon: JsonObject): KuralinDraft {
        val board = KuralinEngine.parseBoard(canon)
        val circles = board.circles
            .filter { KuralinEngine.isValidPoint(it.dr, it.dc, board.rows, board.cols) }
            .filter { it.color in KuralinEngine.WHITE_CIRCLE..KuralinEngine.GRAY_CIRCLE }
            .distinctBy { it.dr to it.dc }
        return KuralinDraft(board.rows, board.cols, sorted(circles))
    }

    /** The canon `{ width, height, circles }` to POST. */
    fun canonFromDraft(draft: KuralinDraft): JsonObject = JsonObject(
        mapOf(
            "width" to JsonPrimitive(draft.cols),
            "height" to JsonPrimitive(draft.rows),
            "circles" to JsonArray(draft.circles.map { c ->
                JsonObject(
                    mapOf(
                        "dr" to JsonPrimitive(c.dr),
                        "dc" to JsonPrimitive(c.dc),
                        "color" to JsonPrimitive(c.color),
                    ),
                )
            }),
        ),
    )

    /**
     * A throwaway puzzle carrying [draft] as its canon, for the review board. Its id
     * keys the board's zoom, so it changes only with the grid size.
     */
    fun previewPuzzle(draft: KuralinDraft): Puzzle = Puzzle(
        id = "admin-kuralin-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "kuralin",
        puzzleTypeJpLabel = "クラリン",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Cycle the circle at (dr, dc): none -> white -> black -> gray -> none. Invalid points are no-ops. */
    fun cycleCircle(draft: KuralinDraft, dr: Int, dc: Int): KuralinDraft {
        if (!KuralinEngine.isValidPoint(dr, dc, draft.rows, draft.cols)) return draft
        val rest = draft.circles.filterNot { it.dr == dr && it.dc == dc }
        val next = when (draft.circleAt(dr, dc)?.color) {
            null -> KuralinEngine.WHITE_CIRCLE
            KuralinEngine.WHITE_CIRCLE -> KuralinEngine.BLACK_CIRCLE
            KuralinEngine.BLACK_CIRCLE -> KuralinEngine.GRAY_CIRCLE
            else -> null
        }
        val circles = if (next == null) rest else rest + KuralinEngine.Circle(dr, dc, next)
        return draft.copy(circles = sorted(circles))
    }

    /** Append an empty row at the bottom. */
    fun addRow(draft: KuralinDraft): KuralinDraft = draft.copy(rows = draft.rows + 1)

    /** Append an empty column at the right. */
    fun addCol(draft: KuralinDraft): KuralinDraft = draft.copy(cols = draft.cols + 1)

    /** Drop the bottom row and the circles that leave the interior with it. Keeps at least two rows. */
    fun removeLastRow(draft: KuralinDraft): KuralinDraft =
        if (draft.rows <= 2) draft else resized(draft, draft.rows - 1, draft.cols)

    /** Drop the rightmost column and the circles that leave the interior with it. Keeps at least two columns. */
    fun removeLastCol(draft: KuralinDraft): KuralinDraft =
        if (draft.cols <= 2) draft else resized(draft, draft.rows, draft.cols - 1)

    private fun resized(draft: KuralinDraft, rows: Int, cols: Int) = KuralinDraft(
        rows,
        cols,
        draft.circles.filter { KuralinEngine.isValidPoint(it.dr, it.dc, rows, cols) },
    )

    private fun sorted(circles: List<KuralinEngine.Circle>) = circles.sortedWith(compareBy({ it.dr }, { it.dc }))

    /** Blocking issues; empty when clean. */
    fun problems(draft: KuralinDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.circles.isEmpty()) add("No circles")
    }
}
