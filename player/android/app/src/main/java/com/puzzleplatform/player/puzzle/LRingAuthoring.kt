package com.puzzleplatform.player.puzzle

/**
 * Authoring for the L-Ring family, the analog of frontend/src/components/LRingEditor.tsx.
 * The canon `{ cells }` is an int grid (0 empty, 1-4 an arrow up/right/down/left), so the
 * draft is a [ClueGridDraft]; [setCell] writes any of them.
 *
 * No format rules (any grid of 0-4 is a valid canon), so [problems] are overridable
 * misread warnings: an unknown code, or an arrow pointing straight off the board (its
 * arm can't exist). L-Ring (type 33) and Perfect L-Ring (type 42) share the question, so
 * they share this; the review screen takes either.
 */
open class LRingFamilyAuthoring(puzzleType: Int, typeName: String, jpLabel: String) :
    ClueGridAuthoring(puzzleType, typeName, jpLabel) {

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

/** L-Ring (type 33). */
object LRingAuthoring : LRingFamilyAuthoring(33, "l-ring", "えるりんぐ") {
    const val PUZZLE_TYPE = 33
}

/** Perfect L-Ring (type 42): L-Ring's question, so L-Ring's authoring. */
object PerfectLRingAuthoring : LRingFamilyAuthoring(42, "perfect-l-ring", "完全えるりんぐ") {
    const val PUZZLE_TYPE = 42
}
