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
 * canonRepr: { room_width?, room_height?, hints: number[][] }
 *   Rooms are room_width x room_height (both default 3); the board is N x N with
 *   N = room_width * room_height (9x9, 16x16, 25x25, 30x30 with 6-wide, 5-tall
 *   rooms) and digits 1..N. hints: N x N, 0 = empty cell for the player to fill.
 * answer:    { hints: number[][], notes: number[][][] }
 *   - hints: N x N committed answers (canon hints merged with the player's entries)
 *   - notes: N x N pencil marks; each cell an ascending list of candidate digits
 *            (1..N), empty where none. Optional/additive: absent on legacy snapshots.
 *
 * Both committed answers and notes ride in the flat userValues map (matching the
 * web client's transport): an answer is "col,row" -> digit; a pencil mark is
 * "n:col,row:digit" -> 1. Progress/conflicts/completion look at answers only.
 */
object SudokuEngine : PuzzleEngine {
    override val puzzleType: Int = 1

    /** Room size (default 3x3) and N, the board's side and largest digit. */
    data class Dims(val roomWidth: Int = 3, val roomHeight: Int = 3) {
        val size: Int get() = roomWidth * roomHeight
    }

    /** The puzzle's room size from its canon (port of frontend sudokuRules.sudokuSize). */
    fun dims(puzzle: Puzzle): Dims {
        fun int(key: String) = (puzzle.canonRepr[key] as? JsonPrimitive)?.content?.toIntOrNull()
        return Dims(int("room_width") ?: 3, int("room_height") ?: 3)
    }

    /** True for a userValues key that encodes a pencil mark ("n:col,row:digit"). */
    private fun isNoteKey(key: String): Boolean = key.startsWith("n:")

    /** Build the "n:col,row:digit" flag key for a pencil mark. */
    fun noteKey(col: Int, row: Int, digit: Int): String = "n:$col,$row:$digit"

    /** Parse the N x N hint grid from a puzzle's canonRepr. Missing cells read as 0. */
    fun parseHints(puzzle: Puzzle): Array<IntArray> = parseGrid(puzzle.canonRepr["hints"], dims(puzzle).size)

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val hints = parseHints(puzzle)
        val n = hints.size
        val answers = Array(n) { row ->
            IntArray(n) { col ->
                val hint = hints[row][col]
                if (hint > 0) hint else userValues["$col,$row"] ?: 0
            }
        }
        val rows = buildList {
            for (row in 0 until n) {
                add(JsonArray(buildList { for (col in 0 until n) add(JsonPrimitive(answers[row][col])) }))
            }
        }

        // Pencil marks: N x N of ascending candidate lists, dropped for cells that
        // hold a hint or committed answer (answer overwrites notes).
        val noteSets = Array(n) { Array(n) { sortedSetOf<Int>() } }
        for ((key, value) in userValues) {
            if (value != 1 || !isNoteKey(key)) continue
            val parts = key.removePrefix("n:").split(":")
            if (parts.size != 2) continue
            val cell = parts[0].split(",")
            val col = cell.getOrNull(0)?.toIntOrNull() ?: continue
            val row = cell.getOrNull(1)?.toIntOrNull() ?: continue
            val digit = parts[1].toIntOrNull() ?: continue
            if (col in 0 until n && row in 0 until n && digit in 1..n && answers[row][col] == 0) {
                noteSets[row][col].add(digit)
            }
        }
        val notesJson = buildList {
            for (row in 0 until n) {
                add(JsonArray(buildList {
                    for (col in 0 until n) {
                        add(JsonArray(noteSets[row][col].map { JsonPrimitive(it) }))
                    }
                }))
            }
        }

        return JsonObject(mapOf("hints" to JsonArray(rows), "notes" to JsonArray(notesJson)))
    }

    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val hints = parseHints(puzzle)
        val n = hints.size
        var totalEmpty = 0
        var filled = 0
        for (row in 0 until n) {
            for (col in 0 until n) {
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
        val n = hints.size
        val grid = parseGrid(answer["hints"], n)
        val result = mutableMapOf<String, Int>()
        for (row in 0 until n) {
            for (col in 0 until n) {
                // Only non-hint cells are player input; keep positive entries.
                if (hints[row][col] == 0 && grid[row][col] in 1..n) {
                    result["$col,$row"] = grid[row][col]
                }
            }
        }
        // Restore pencil marks (tolerating legacy snapshots with no "notes"), but
        // only for empty, non-answered cells.
        val notes = answer["notes"] as? JsonArray
        if (notes != null) {
            for (row in 0 until n) {
                val rowArr = notes.getOrNull(row) as? JsonArray ?: continue
                for (col in 0 until n) {
                    if (hints[row][col] != 0 || (result["$col,$row"] ?: 0) > 0) continue
                    val cellArr = rowArr.getOrNull(col) as? JsonArray ?: continue
                    for (el in cellArr) {
                        val digit = (el as? JsonPrimitive)?.intOrZero() ?: 0
                        if (digit in 1..n) result[noteKey(col, row, digit)] = 1
                    }
                }
            }
        }
        return result
    }

    /**
     * Cells ("col,row") that violate a row/column/room uniqueness constraint given
     * the merged hint + user grid. Used for the "Errors" live-validation toggle.
     */
    fun findConflicts(puzzle: Puzzle, userValues: Map<String, Int>): Set<String> {
        val hints = parseHints(puzzle)
        val d = dims(puzzle)
        val n = d.size
        val grid = Array(n) { row ->
            IntArray(n) { col ->
                val hint = hints[row][col]
                if (hint > 0) hint else userValues["$col,$row"] ?: 0
            }
        }
        val conflicts = mutableSetOf<String>()

        // Rows
        for (row in 0 until n) {
            val seen = HashMap<Int, MutableList<Int>>()
            for (col in 0 until n) {
                val v = grid[row][col]
                if (v == 0) continue
                seen.getOrPut(v) { mutableListOf() }.add(col)
            }
            seen.values.filter { it.size > 1 }.forEach { cols -> cols.forEach { conflicts.add("$it,$row") } }
        }
        // Columns
        for (col in 0 until n) {
            val seen = HashMap<Int, MutableList<Int>>()
            for (row in 0 until n) {
                val v = grid[row][col]
                if (v == 0) continue
                seen.getOrPut(v) { mutableListOf() }.add(row)
            }
            seen.values.filter { it.size > 1 }.forEach { rows -> rows.forEach { conflicts.add("$col,$it") } }
        }
        // Rooms: roomWidth columns by roomHeight rows
        for (r0 in 0 until n step d.roomHeight) {
            for (c0 in 0 until n step d.roomWidth) {
                val seen = HashMap<Int, MutableList<String>>()
                for (r in r0 until r0 + d.roomHeight) {
                    for (c in c0 until c0 + d.roomWidth) {
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

    /** True when all N x N cells are filled and no conflicts remain. */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val hints = parseHints(puzzle)
        val n = hints.size
        val totalHints = hints.sumOf { row -> row.count { it > 0 } }
        // Count committed answers only; pencil-mark ("n:") keys don't fill a cell.
        val totalFilled = totalHints + userValues.count { (k, v) -> !isNoteKey(k) && v > 0 }
        return totalFilled == n * n && findConflicts(puzzle, userValues).isEmpty()
    }

    /** Read a size x size grid from a JSON element, tolerating ragged/missing rows (treated as 0). */
    private fun parseGrid(element: Any?, size: Int): Array<IntArray> {
        val outer = (element as? JsonArray)
        return Array(size) { row ->
            IntArray(size) { col ->
                val rowArr = outer?.getOrNull(row) as? JsonArray ?: return@IntArray 0
                val cell = rowArr.getOrNull(col) as? JsonPrimitive ?: return@IntArray 0
                cell.intOrZero()
            }
        }
    }

    private fun JsonPrimitive.intOrZero(): Int = this.content.toIntOrNull() ?: 0

    /** Every digit entered is the solution's digit there; pencil marks don't count. */
    override fun matchesSolution(puzzle: Puzzle, userValues: Map<String, Int>): Boolean? {
        val size = dims(puzzle).size
        val solution = SolutionCheck.grid(puzzle.solutionRepr?.get("hints"), size, size) ?: return null
        return SolutionCheck.matches(userValues, SolutionCheck.digits(solution, max = size))
    }
}
