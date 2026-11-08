package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Unequal sudoku (不等号ナンプレ, puzzle type 29). Ports:
 *  - answer extraction from frontend/src/extractors/unequalSudoku.ts
 *  - progress from frontend/src/progress/unequalSudoku.ts
 *  - conflict/completion logic from frontend/src/components/UnequalSudokuBoard.tsx
 *
 * canonRepr: { hints: number[][], right: number[][], down: number[][] }
 *   - hints 9x9 (0 = empty), right 9x8 (sign between (r,c) and (r,c+1)),
 *     down 8x9 (sign between (r,c) and (r+1,c)). Sign: 0 none, 1 = this cell smaller
 *     (< / ∧), 2 = this cell larger (> / ∨).
 * answer: { hints, notes } exactly as sudoku's.
 *
 * The answer, progress and saved-answer restore only read `hints`, so they are
 * [SudokuEngine]'s (same "col,row" digits and "n:col,row:digit" notes). On top of
 * sudoku's row/column/box conflicts, a sign whose two filled cells break it is a
 * conflict, for both cells and the sign itself.
 */
object UnequalSudokuEngine : PuzzleEngine {
    override val puzzleType: Int = 29

    const val SIZE = 9

    /** A sign between two neighbouring cells: [horizontal] = the right gap of (row, col), else the down gap. */
    data class Gap(val horizontal: Boolean, val row: Int, val col: Int)

    /** The puzzle's signs: right 9x8, down 8x9. */
    data class Signs(val right: Array<IntArray>, val down: Array<IntArray>) {
        fun at(gap: Gap): Int = if (gap.horizontal) right[gap.row][gap.col] else down[gap.row][gap.col]
    }

    fun parseHints(puzzle: Puzzle): Array<IntArray> = SudokuEngine.parseHints(puzzle)

    fun parseSigns(puzzle: Puzzle): Signs = parseSigns(puzzle.canonRepr)

    fun parseSigns(canon: JsonObject): Signs = Signs(
        right = parseGrid(canon["right"], SIZE, SIZE - 1),
        down = parseGrid(canon["down"], SIZE - 1, SIZE),
    )

    /** Does `a <sign> b` hold? 1: a < b, 2: a > b. An empty cell (0) never breaks it. */
    fun signHolds(sign: Int, a: Int, b: Int): Boolean = when {
        a == 0 || b == 0 -> true
        sign == 1 -> a < b
        sign == 2 -> a > b
        else -> true
    }

    /** The merged hint + entered grid (pencil marks ignored). */
    fun grid(hints: Array<IntArray>, userValues: Map<String, Int>): Array<IntArray> =
        Array(SIZE) { row ->
            IntArray(SIZE) { col ->
                val hint = hints[row][col]
                if (hint > 0) hint else (userValues["$col,$row"] ?: 0).coerceIn(0, 9)
            }
        }

    /** Signs broken by two filled cells. */
    fun brokenSigns(grid: Array<IntArray>, signs: Signs): Set<Gap> {
        val broken = mutableSetOf<Gap>()
        for (r in 0 until SIZE) {
            for (c in 0 until SIZE) {
                if (c < SIZE - 1 && !signHolds(signs.right[r][c], grid[r][c], grid[r][c + 1])) {
                    broken.add(Gap(true, r, c))
                }
                if (r < SIZE - 1 && !signHolds(signs.down[r][c], grid[r][c], grid[r + 1][c])) {
                    broken.add(Gap(false, r, c))
                }
            }
        }
        return broken
    }

    /** Cells ("col,row") on either side of a broken sign. */
    fun cellsOf(gaps: Set<Gap>): Set<String> = gaps.flatMapTo(mutableSetOf()) { g ->
        if (g.horizontal) listOf("${g.col},${g.row}", "${g.col + 1},${g.row}")
        else listOf("${g.col},${g.row}", "${g.col},${g.row + 1}")
    }

    /** Conflicting cells: sudoku's repeats plus both cells of every broken sign. */
    fun findConflicts(puzzle: Puzzle, userValues: Map<String, Int>): Set<String> {
        val broken = brokenSigns(grid(parseHints(puzzle), userValues), parseSigns(puzzle))
        return SudokuEngine.findConflicts(puzzle, userValues) + cellsOf(broken)
    }

    fun findBrokenSigns(puzzle: Puzzle, userValues: Map<String, Int>): Set<Gap> =
        brokenSigns(grid(parseHints(puzzle), userValues), parseSigns(puzzle))

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject =
        SudokuEngine.extractAnswer(puzzle, userValues)

    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double =
        SudokuEngine.computeProgress(puzzle, userValues)

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> =
        SudokuEngine.restoreUserValues(puzzle, answer)

    /** All 81 cells filled, no repeats, every sign holds. */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val g = grid(parseHints(puzzle), userValues)
        if (g.any { row -> row.any { it == 0 } }) return false
        return findConflicts(puzzle, userValues).isEmpty()
    }

    override fun matchesSolution(puzzle: Puzzle, userValues: Map<String, Int>): Boolean? =
        SudokuEngine.matchesSolution(puzzle, userValues)

    /** Read a rows x cols grid, tolerating ragged/missing rows (0). */
    internal fun parseGrid(element: Any?, rows: Int, cols: Int): Array<IntArray> {
        val outer = element as? JsonArray
        return Array(rows) { r ->
            IntArray(cols) { c ->
                val rowArr = outer?.getOrNull(r) as? JsonArray ?: return@IntArray 0
                (rowArr.getOrNull(c) as? JsonPrimitive)?.content?.toIntOrNull() ?: 0
            }
        }
    }
}
