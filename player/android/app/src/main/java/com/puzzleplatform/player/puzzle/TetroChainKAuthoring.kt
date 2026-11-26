package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a Tetro Chain K question in the Admin screen, the analog of
 * frontend/src/components/TetroChainKEditor.tsx. The canon is Kuralin's, so the draft is a
 * [KuralinDraft] and reading, writing and resizing (circles shift with the board) are
 * [KuralinAuthoring]'s. A tap snapped to a grid-line point cycles its circle
 * none -> white -> gray -> black -> none (the web editor's order).
 *
 * Kept free of Android/Compose types so it's unit-testable.
 */
object TetroChainKAuthoring {

    const val PUZZLE_TYPE = 50

    fun draftFromCanon(canon: JsonObject): KuralinDraft = KuralinAuthoring.draftFromCanon(canon)

    fun canonFromDraft(draft: KuralinDraft): JsonObject = KuralinAuthoring.canonFromDraft(draft)

    /** A throwaway puzzle carrying [draft] as its canon, for the review board (id keys its zoom). */
    fun previewPuzzle(draft: KuralinDraft): Puzzle = Puzzle(
        id = "admin-tetro-chain-k-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "tetro-chain-k",
        puzzleTypeJpLabel = "テトロチェーンK",
        difficulty = 1,
        width = draft.cols,
        height = draft.rows,
        canonRepr = canonFromDraft(draft),
    )

    /** Cycle the circle at (dr, dc): none -> white -> gray -> black -> none. Invalid points are no-ops. */
    fun cycleCircle(draft: KuralinDraft, dr: Int, dc: Int): KuralinDraft {
        if (!KuralinEngine.isValidPoint(dr, dc, draft.rows, draft.cols)) return draft
        val rest = draft.circles.filterNot { it.dr == dr && it.dc == dc }
        val next = when (draft.circleAt(dr, dc)?.color) {
            null -> KuralinEngine.WHITE_CIRCLE
            KuralinEngine.WHITE_CIRCLE -> KuralinEngine.GRAY_CIRCLE
            KuralinEngine.GRAY_CIRCLE -> KuralinEngine.BLACK_CIRCLE
            else -> null
        }
        val circles = if (next == null) rest else rest + KuralinEngine.Circle(dr, dc, next)
        return draft.copy(circles = circles.sortedWith(compareBy({ it.dr }, { it.dc })))
    }

    fun addRow(draft: KuralinDraft, top: Boolean = false) = KuralinAuthoring.addRow(draft, top)

    fun addCol(draft: KuralinDraft, left: Boolean = false) = KuralinAuthoring.addCol(draft, left)

    fun removeEdgeRow(draft: KuralinDraft, top: Boolean) = KuralinAuthoring.removeEdgeRow(draft, top)

    fun removeEdgeCol(draft: KuralinDraft, left: Boolean) = KuralinAuthoring.removeEdgeCol(draft, left)

    data class Problem(val message: String, val r: Int, val c: Int)

    /** Port of tetroChainKFormatProblems: the API rejects these, so they block saving. */
    fun formatProblemCells(draft: KuralinDraft): List<Problem> = buildList {
        val seen = HashSet<Pair<Int, Int>>()
        for (k in draft.circles) {
            val r = ((k.dr - 1) / 2).coerceIn(0, maxOf(0, draft.rows - 1))
            val c = ((k.dc - 1) / 2).coerceIn(0, maxOf(0, draft.cols - 1))
            if (k.dr < 1 || k.dc < 1 || k.dr > 2 * draft.rows - 1 || k.dc > 2 * draft.cols - 1) {
                add(Problem("Circle at (${k.dr},${k.dc}) is outside the grid", r, c))
            } else if (k.dr % 2 == 1 && k.dc % 2 == 1) {
                add(Problem("Circle at (${k.dr},${k.dc}) is at a cell centre", r, c))
            }
            if (!seen.add(k.dr to k.dc)) add(Problem("Two circles at (${k.dr},${k.dc})", r, c))
        }
    }

    fun formatProblems(draft: KuralinDraft): List<String> = formatProblemCells(draft).map { it.message }

    /** Everything that turns a batch tile red: the format problems, then misread warnings. */
    fun problems(draft: KuralinDraft): List<String> {
        if (draft.rows < 2 || draft.cols < 2) return listOf("No grid")
        val format = formatProblems(draft)
        if (format.isNotEmpty()) return format
        return if (draft.circles.isEmpty()) listOf("No circles") else emptyList()
    }
}
