package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/**
 * Sudoku (puzzle type 1). Ports:
 *  - answer extraction from frontend/src/extractors/sudoku.ts
 *  - progress from frontend/src/progress/sudoku.ts
 *  - conflict/completion logic from frontend/src/components/SudokuBoard.tsx
 *
 * canonRepr: { hints: number[][] }  (9x9; 0 = empty cell for the player to fill)
 * answer:    { hints: number[][] }  (9x9; hints merged with the player's entries)
 */
object SudokuEngine : PuzzleEngine {
    override val puzzleType: Int = 1

    private const val SIZE = 9

    /** Parse the 9x9 hint grid from a puzzle's canonRepr. Missing cells read as 0. */
    fun parseHints(puzzle: Puzzle): Array<IntArray> = parseGrid(puzzle.canonRepr["hints"])

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val hints = parseHints(puzzle)
        val rows = buildList {
            for (row in 0 until SIZE) {
                val rowArr = buildList {
                    for (col in 0 until SIZE) {
                        val hint = hints[row][col]
                        val value = if (hint > 0) hint else userValues["$col,$row"] ?: 0
                        add(JsonPrimitive(value))
                    }
                }
                add(JsonArray(rowArr))
            }
        }
        return JsonObject(mapOf("hints" to JsonArray(rows)))
    }

    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val hints = parseHints(puzzle)
        var totalEmpty = 0
        var filled = 0
        for (row in 0 until SIZE) {
            for (col in 0 until SIZE) {
                if (hints[row][col] == 0) {
                    totalEmpty++
                    if ((userValues["$col,$row"] ?: 0) > 0) filled++
                }
            }
        }
        if (totalEmpty == 0) return 100.0
        return filled.toDouble() / totalEmpty * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val hints = parseHints(puzzle)
        val grid = parseGrid(answer["hints"])
        val result = mutableMapOf<String, Int>()
        for (row in 0 until SIZE) {
            for (col in 0 until SIZE) {
                // Only non-hint cells are player input; keep positive entries.
                if (hints[row][col] == 0 && grid[row][col] > 0) {
                    result["$col,$row"] = grid[row][col]
                }
            }
        }
        return result
    }

    /**
     * Cells ("col,row") that violate a row/column/box uniqueness constraint given
     * the merged hint + user grid. Used for the "Errors" live-validation toggle.
     */
    fun findConflicts(puzzle: Puzzle, userValues: Map<String, Int>): Set<String> {
        val hints = parseHints(puzzle)
        val grid = Array(SIZE) { row ->
            IntArray(SIZE) { col ->
                val hint = hints[row][col]
                if (hint > 0) hint else userValues["$col,$row"] ?: 0
            }
        }
        val conflicts = mutableSetOf<String>()

        // Rows
        for (row in 0 until SIZE) {
            val seen = HashMap<Int, MutableList<Int>>()
            for (col in 0 until SIZE) {
                val v = grid[row][col]
                if (v == 0) continue
                seen.getOrPut(v) { mutableListOf() }.add(col)
            }
            seen.values.filter { it.size > 1 }.forEach { cols -> cols.forEach { conflicts.add("$it,$row") } }
        }
        // Columns
        for (col in 0 until SIZE) {
            val seen = HashMap<Int, MutableList<Int>>()
            for (row in 0 until SIZE) {
                val v = grid[row][col]
                if (v == 0) continue
                seen.getOrPut(v) { mutableListOf() }.add(row)
            }
            seen.values.filter { it.size > 1 }.forEach { rows -> rows.forEach { conflicts.add("$col,$it") } }
        }
        // 3x3 boxes
        for (boxRow in 0 until 3) {
            for (boxCol in 0 until 3) {
                val seen = HashMap<Int, MutableList<String>>()
                for (r in boxRow * 3 until boxRow * 3 + 3) {
                    for (c in boxCol * 3 until boxCol * 3 + 3) {
                        val v = grid[r][c]
                        if (v == 0) continue
                        seen.getOrPut(v) { mutableListOf() }.add("$c,$r")
                    }
                }
                seen.values.filter { it.size > 1 }.forEach { keys -> conflicts.addAll(keys) }
            }
        }
        return conflicts
    }

    /** True when all 81 cells are filled and no conflicts remain. */
    fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val hints = parseHints(puzzle)
        val totalHints = hints.sumOf { row -> row.count { it > 0 } }
        val totalFilled = totalHints + userValues.count { (_, v) -> v > 0 }
        return totalFilled == SIZE * SIZE && findConflicts(puzzle, userValues).isEmpty()
    }

    /** Read a 9x9 grid from a JSON element, tolerating ragged/missing rows (treated as 0). */
    private fun parseGrid(element: Any?): Array<IntArray> {
        val outer = (element as? JsonArray)
        return Array(SIZE) { row ->
            IntArray(SIZE) { col ->
                val rowArr = outer?.getOrNull(row) as? JsonArray ?: return@IntArray 0
                val cell = rowArr.getOrNull(col) as? JsonPrimitive ?: return@IntArray 0
                cell.intOrZero()
            }
        }
    }

    private fun JsonPrimitive.intOrZero(): Int = this.content.toIntOrNull() ?: 0
}
