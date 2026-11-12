package com.puzzleplatform.player.puzzle

/**
 * Authoring for Hashi (type 34), the analog of frontend/src/components/HashiEditor.tsx.
 * The canon `{ cells }` is an int grid of lattice points (0 none, 1-8 an island's
 * number), so the draft is a [ClueGridDraft].
 *
 * Any grid of 0-8 is a valid canon, so [problems] are overridable misread warnings,
 * matching the web editor's: a value over 8, an odd sum of numbers (every bridge counts
 * at both ends), or an island whose number is more than its neighbours can take.
 */
object HashiAuthoring : ClueGridAuthoring(34, "hashi", "橋をかけろ") {
    const val PUZZLE_TYPE = 34

    /** Set (col, row) to empty (0) or an island number 1-8. */
    fun setCell(draft: ClueGridDraft, col: Int, row: Int, value: Int): ClueGridDraft =
        setClue(draft, col, row, value)

    override fun clueProblems(draft: ClueGridDraft): List<String> = buildList {
        val sum = draft.cells.sumOf { it.sum() }
        if (sum % 2 == 1) add("The numbers sum to $sum, an odd total: every bridge counts at both ends")
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val v = draft.cells[r][c]
                if (v == HashiRules.EMPTY) continue
                if (!HashiRules.isIsland(v)) {
                    add("${at(r, c)} holds $v, but islands run 1-${HashiRules.MAX_CLUE}")
                    continue
                }
                val n = HashiRules.neighbourCount(draft.cells, r, c)
                if (v > 2 * n) {
                    add("${at(r, c)} is $v, but its $n neighbouring island${if (n == 1) "" else "s"} take at most ${2 * n} bridges")
                }
            }
        }
    }
}
