package com.puzzleplatform.player.puzzle

/**
 * Authoring for balance link (type 32), the analog of
 * frontend/src/components/BalanceLinkEditor.tsx. The canon `{ cells }` is an int grid like
 * the number-clue puzzles', so the draft is a [ClueGridDraft] holding 0 (white), 1 (black)
 * or a symbol code ([BalanceLinkRules]); [setCell] writes any of them.
 *
 * No format rules (any grid of known codes is a valid canon), so [problems] are
 * overridable misread warnings: an unknown code, or a symbol appearing an odd number of
 * times (one copy can't be paired).
 */
object BalanceLinkAuthoring : ClueGridAuthoring(32, "balance-link", "バランスリンク") {
    const val PUZZLE_TYPE = 32

    /** Set (col, row) to white, black or a symbol code. */
    fun setCell(draft: ClueGridDraft, col: Int, row: Int, value: Int): ClueGridDraft =
        setClue(draft, col, row, value)

    /** Change the colour of the symbol at (col, row), keeping its shape; other cells stay. */
    fun setSymbolColour(draft: ClueGridDraft, col: Int, row: Int, black: Boolean): ClueGridDraft {
        val v = draft.cellAt(col, row)
        if (!BalanceLinkRules.isSymbol(v)) return draft
        return setCell(draft, col, row, BalanceLinkRules.code(BalanceLinkRules.shapeOf(v), black))
    }

    /** A symbol's name for messages, e.g. "black star". */
    fun describe(code: Int): String {
        val shape = BalanceLinkRules.SHAPES.firstOrNull { it.first == BalanceLinkRules.shapeOf(code) }?.second
            ?: "symbol $code"
        return "${if (BalanceLinkRules.isBlackSymbol(code)) "black" else "white"} ${shape.lowercase()}"
    }

    override fun clueProblems(draft: ClueGridDraft): List<String> = buildList {
        val counts = sortedMapOf<Int, Int>()
        for (r in 0 until draft.rows) {
            for (c in 0 until draft.cols) {
                val v = draft.cells[r][c]
                if (!BalanceLinkRules.isKnown(v)) add("${at(r, c)} holds an unknown symbol ($v)")
                else if (BalanceLinkRules.isSymbol(v)) counts[v] = (counts[v] ?: 0) + 1
            }
        }
        if (counts.isEmpty()) add("No symbols")
        for ((code, n) in counts) {
            if (n % 2 == 1) {
                val times = if (n == 1) "once" else "$n times"
                add("${describe(code).replaceFirstChar { it.uppercase() }} appears $times, so one can't be paired")
            }
        }
    }
}
