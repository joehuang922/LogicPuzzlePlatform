package com.puzzleplatform.player.puzzle

/**
 * Authoring for L-Ring (type 33), the analog of frontend/src/components/LRingEditor.tsx.
 * The canon `{ cells }` is an int grid (0 empty, 1-4 an arrow up/right/down/left), so the
 * draft is a [ClueGridDraft]; [setCell] writes any of them.
 *
 * No format rules (any grid of 0-4 is a valid canon), so [problems] are overridable
 * misread warnings: an unknown code, or an arrow pointing straight off the board (its
 * arm can't exist).
 */
object LRingAuthoring : ClueGridAuthoring(33, "l-ring", "えるりんぐ") {
    const val PUZZLE_TYPE = 33

    /** Set (col, row) to empty or an arrow code. */
    fun setCell(draft: ClueGridDraft, col: Int, row: Int, value: Int): ClueGridDraft =
        setClue(draft, col, row, value)

    override fun clueProblems(draft: ClueGridDraft): List<String> = buildList {
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val v = draft.cells[r][c]
                if (v == LRingRules.EMPTY) continue
                val arrow = LRingRules.ARROWS.firstOrNull { it.first == v }
                if (arrow == null) {
                    add("${at(r, c)} holds an unknown value ($v)")
                    continue
                }
                val (dr, dc) = arrow.second
                if (r + dr !in 0 until draft.rows || c + dc !in 0 until draft.cols) {
                    add("${at(r, c)}: the ${arrow.third.lowercase()} arrow points off the board")
                }
            }
        }
    }
}
