package com.puzzleplatform.player.puzzle

/**
 * Authoring for Pencils (type 8), the analog of frontend/src/components/PencilsEditor.tsx.
 * The canon `{ cells }` is an int grid (0 empty, > 0 a number clue, -1..-4 a head up /
 * down / left / right), so the draft is a [ClueGridDraft] that also keeps the negative
 * head codes; [setClue] writes a number or a head.
 *
 * No format rules (any grid of ints >= -4 is a valid canon), so [problems] are overridable
 * misread warnings: an unknown code, or a head whose body would lie off the board.
 */
object PencilsAuthoring : ClueGridAuthoring(8, "pencils", "ペンシルズ") {
    const val PUZZLE_TYPE = 8

    override fun keeps(value: Int): Boolean = value != 0

    override fun clueProblems(draft: ClueGridDraft): List<String> = buildList {
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val v = draft.cells[r][c]
                if (v >= 0) continue
                if (!PencilsRules.isHead(v)) {
                    add("${at(r, c)} holds an unknown value ($v)")
                    continue
                }
                val (br, bc) = PencilsRules.bodyStart(r, c, v) ?: continue
                if (br !in 0 until draft.rows || bc !in 0 until draft.cols) {
                    val name = PencilsRules.HEADS.first { it.first == v }.second.lowercase()
                    add("${at(r, c)}: the $name head has no room for a body behind it")
                }
            }
        }
    }
}
