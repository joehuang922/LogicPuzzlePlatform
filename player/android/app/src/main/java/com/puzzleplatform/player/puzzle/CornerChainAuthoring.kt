package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonObject

/**
 * Pure helpers for authoring a corner chain question in the Admin screen, the analog of
 * frontend/src/components/CornerChainEditor.tsx. The canon `{ cells }` is Nurikabe's, so
 * the draft is a [NurikabeDraft] and every edit delegates to [NurikabeAuthoring]; only
 * the preview's type and the misread check differ.
 *
 * Corner chain has no solver gate and no format rules (any clue grid is a valid canon),
 * so [problems] are overridable misread warnings: clues that can't be right on their face.
 */
object CornerChainAuthoring {

    const val PUZZLE_TYPE = 30

    fun draftFromCanon(canon: JsonObject): NurikabeDraft = NurikabeAuthoring.draftFromCanon(canon)

    fun canonFromDraft(draft: NurikabeDraft): JsonObject = NurikabeAuthoring.canonFromDraft(draft)

    /** A throwaway puzzle carrying [draft] as its canon, for the review board. */
    fun previewPuzzle(draft: NurikabeDraft): Puzzle = NurikabeAuthoring.previewPuzzle(draft).copy(
        id = "admin-corner-chain-draft-${draft.rows}x${draft.cols}",
        puzzleType = PUZZLE_TYPE,
        puzzleTypeName = "corner-chain",
        puzzleTypeJpLabel = "隅角チェーン",
    )

    /**
     * Misread warnings, in reading order; empty when clean. Positions are 1-based "R3C5".
     *  - no clues at all;
     *  - a 1: a one-cell island is a square, and odd islands may not be rectangles;
     *  - a clue larger than the grid;
     *  - two different clues side by side: neighbouring white cells share one island.
     */
    fun problems(draft: NurikabeDraft): List<String> = buildList {
        if (draft.rows == 0 || draft.cols == 0) {
            add("No cells")
            return@buildList
        }
        if (draft.cells.all { row -> row.all { it == NurikabeAuthoring.BLANK } }) {
            add("No clues")
            return@buildList
        }
        val area = draft.rows * draft.cols
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val v = draft.cells[r][c]
                if (v == NurikabeAuthoring.BLANK) continue
                if (v == 1) add("R${r + 1}C${c + 1} is 1, but a one-cell island is never allowed")
                if (v > area) add("R${r + 1}C${c + 1} is $v but the grid has only $area cells")
                val right = draft.cellAt(c + 1, r) ?: NurikabeAuthoring.BLANK
                if (right != NurikabeAuthoring.BLANK && right != v) {
                    add("R${r + 1}C${c + 1} and R${r + 1}C${c + 2} share an island but differ")
                }
                val down = draft.cellAt(c, r + 1) ?: NurikabeAuthoring.BLANK
                if (down != NurikabeAuthoring.BLANK && down != v) {
                    add("R${r + 1}C${c + 1} and R${r + 2}C${c + 1} share an island but differ")
                }
            }
        }
    }
}
