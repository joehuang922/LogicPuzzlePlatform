package com.puzzleplatform.player.puzzle

/**
 * Authoring for Choco Banana (type 16), the analog of frontend/src/components/ChocoBananaEditor.tsx:
 * the canon `{ cells }` holds 0 or a positive group-size clue, so it's a plain
 * [ClueGridDraft]. A clue can't be bigger than the grid — an overridable misread warning
 * ("1" read as "11"), since the canon itself can hold any positive number.
 */
object ChocoBananaAuthoring : ClueGridAuthoring(16, "choco-banana", "チョコバナナ") {
    const val PUZZLE_TYPE = 16

    override fun clueProblems(draft: ClueGridDraft): List<String> = buildList {
        val area = draft.rows * draft.cols
        for (r in 0 until draft.rows) for (c in 0 until draft.cols) {
            val n = draft.cells[r][c]
            if (n > area) add("${at(r, c)}: $n is bigger than the grid's $area cells")
        }
    }
}
