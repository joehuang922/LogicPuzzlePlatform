package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Combo sudoku (puzzle type 2): any number of 9x9 sudoku boards overlapping in whole
 * 3x3 rooms. Ports:
 *  - answer extraction from frontend/src/extractors/comboSudoku.ts
 *  - progress from frontend/src/progress/comboSudoku.ts
 *  - completion and peers from frontend/src/components/ComboSudokuBoard.tsx
 *
 * canonRepr: { room_width?, room_height?, subboards: [{ x, y, hints: number[9][9] }] }
 *   x, y are the board's top-left in rooms (3 cells), so its cells span columns
 *   3x..3x+8 and rows 3y..3y+8 of one shared global grid.
 * answer:    { subboards: [{ x, y, answers: number[9][9], notes: number[9][9][] }] }
 *   - answers: the board's 81 cells (givens merged with the player's entries)
 *   - notes: pencil marks, ascending candidate lists; Android-only and additive (the
 *     web client ignores them), as for sudoku.
 *
 * Input rides in userValues keyed by *global* cell, "col,row" -> digit, so a cell two
 * boards share is one entry; a pencil mark is "n:col,row:digit" -> 1 (the sudoku keys).
 */
object ComboSudokuEngine : PuzzleEngine {
    override val puzzleType: Int = 2

    /** One 9x9 board: its room origin and its 9x9 givens (0 = empty). */
    data class Subboard(val x: Int, val y: Int, val hints: List<List<Int>>) {
        val col0: Int get() = 3 * x
        val row0: Int get() = 3 * y

        fun covers(col: Int, row: Int): Boolean = col - col0 in 0 until 9 && row - row0 in 0 until 9

        /** Global "col,row" keys of the board's cells, row by row. */
        fun keys(): List<String> = (0 until 9).flatMap { r -> (0 until 9).map { c -> "${col0 + c},${row0 + r}" } }

        /** The board's 27 units (9 rows, 9 columns, 9 boxes) as global keys. */
        fun units(): List<List<String>> {
            val rows = (0 until 9).map { r -> (0 until 9).map { c -> "${col0 + c},${row0 + r}" } }
            val cols = (0 until 9).map { c -> (0 until 9).map { r -> "${col0 + c},${row0 + r}" } }
            val boxes = (0 until 9).map { b ->
                val br = b / 3 * 3
                val bc = b % 3 * 3
                (0 until 9).map { i -> "${col0 + bc + i % 3},${row0 + br + i / 3}" }
            }
            return rows + cols + boxes
        }
    }

    /** Everything the board, editor and engine derive from a list of subboards. */
    class Layout(val subboards: List<Subboard>) {
        /** Grid size in cells: the extent of every board. */
        val cols: Int = subboards.maxOfOrNull { it.col0 + 9 } ?: 0
        val rows: Int = subboards.maxOfOrNull { it.row0 + 9 } ?: 0

        /** Every cell some board covers. */
        val cells: Set<String> = subboards.flatMapTo(LinkedHashSet()) { it.keys() }

        /** A cell's given: any board's nonzero hint there (overlapping boards agree on a valid canon). */
        val givens: Map<String, Int> = buildMap {
            for (sb in subboards) for (r in 0 until 9) for (c in 0 until 9) {
                val v = sb.hints[r][c]
                if (v in 1..9) putIfAbsent("${sb.col0 + c},${sb.row0 + r}", v)
            }
        }

        private val units: List<List<String>> = subboards.flatMap { it.units() }

        /** For each cell, every cell sharing a row, column or box with it in any board. */
        val peers: Map<String, Set<String>> by lazy {
            val map = HashMap<String, MutableSet<String>>()
            for (unit in units) for (key in unit) map.getOrPut(key) { HashSet() }.addAll(unit)
            map.forEach { (k, v) -> v.remove(k) }
            map
        }

        fun value(key: String, userValues: Map<String, Int>): Int = givens[key] ?: (userValues[key] ?: 0)

        /** Cells whose digit repeats in some row, column or box of a board. */
        fun conflicts(userValues: Map<String, Int>): Set<String> {
            val out = HashSet<String>()
            for (unit in units) {
                val byDigit = unit.filter { value(it, userValues) > 0 }.groupBy { value(it, userValues) }
                byDigit.values.filter { it.size > 1 }.forEach { out.addAll(it) }
            }
            return out
        }
    }

    fun parseSubboards(canon: JsonObject): List<Subboard> {
        val arr = canon["subboards"] as? JsonArray ?: return emptyList()
        return arr.mapNotNull { el ->
            val obj = el as? JsonObject ?: return@mapNotNull null
            val x = (obj["x"] as? JsonPrimitive)?.content?.toIntOrNull() ?: return@mapNotNull null
            val y = (obj["y"] as? JsonPrimitive)?.content?.toIntOrNull() ?: return@mapNotNull null
            Subboard(x, y, parseGrid(obj["hints"]))
        }
    }

    fun layout(puzzle: Puzzle): Layout = Layout(parseSubboards(puzzle.canonRepr))

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val layout = layout(puzzle)
        val notes = noteSets(userValues)
        val boards = layout.subboards.map { sb ->
            val answers = (0 until 9).map { r ->
                JsonArray((0 until 9).map { c ->
                    val hint = sb.hints[r][c]
                    JsonPrimitive(if (hint > 0) hint else userValues["${sb.col0 + c},${sb.row0 + r}"] ?: 0)
                })
            }
            val noteRows = (0 until 9).map { r ->
                JsonArray((0 until 9).map { c ->
                    val key = "${sb.col0 + c},${sb.row0 + r}"
                    val open = layout.value(key, userValues) == 0
                    JsonArray(if (open) notes[key].orEmpty().map { JsonPrimitive(it) } else emptyList())
                })
            }
            JsonObject(
                mapOf(
                    "x" to JsonPrimitive(sb.x),
                    "y" to JsonPrimitive(sb.y),
                    "answers" to JsonArray(answers),
                    "notes" to JsonArray(noteRows),
                ),
            )
        }
        return JsonObject(mapOf("subboards" to JsonArray(boards)))
    }

    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val layout = layout(puzzle)
        val open = layout.cells.filter { it !in layout.givens }
        if (open.isEmpty()) return 100.0
        return open.count { (userValues[it] ?: 0) > 0 }.toDouble() / open.size * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val layout = layout(puzzle)
        val result = mutableMapOf<String, Int>()
        val saved = answer["subboards"] as? JsonArray ?: return result
        for (el in saved) {
            val obj = el as? JsonObject ?: continue
            val x = (obj["x"] as? JsonPrimitive)?.content?.toIntOrNull() ?: continue
            val y = (obj["y"] as? JsonPrimitive)?.content?.toIntOrNull() ?: continue
            if (layout.subboards.none { it.x == x && it.y == y }) continue
            val answers = parseGrid(obj["answers"])
            val notes = obj["notes"] as? JsonArray
            for (r in 0 until 9) for (c in 0 until 9) {
                val key = "${3 * x + c},${3 * y + r}"
                if (key in layout.givens) continue
                val v = answers[r][c]
                if (v in 1..9) {
                    result[key] = v
                    continue
                }
                val cell = (notes?.getOrNull(r) as? JsonArray)?.getOrNull(c) as? JsonArray ?: continue
                for (d in cell) {
                    val digit = (d as? JsonPrimitive)?.content?.toIntOrNull() ?: continue
                    if (digit in 1..9) result[SudokuEngine.noteKey(3 * x + c, 3 * y + r, digit)] = 1
                }
            }
        }
        // A board's answer overrules another's notes for a shared cell.
        return result.filterKeys { key ->
            !key.startsWith("n:") || (result[key.removePrefix("n:").substringBefore(":")] ?: 0) == 0
        }
    }

    fun findConflicts(puzzle: Puzzle, userValues: Map<String, Int>): Set<String> =
        layout(puzzle).conflicts(userValues)

    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val layout = layout(puzzle)
        if (layout.cells.isEmpty()) return false
        return layout.cells.all { layout.value(it, userValues) in 1..9 } && layout.conflicts(userValues).isEmpty()
    }

    /** Pencil marks by cell: "col,row" -> ascending digits. */
    private fun noteSets(userValues: Map<String, Int>): Map<String, List<Int>> {
        val out = HashMap<String, java.util.TreeSet<Int>>()
        for ((key, v) in userValues) {
            if (v != 1 || !key.startsWith("n:")) continue
            val parts = key.removePrefix("n:").split(":")
            val digit = parts.getOrNull(1)?.toIntOrNull() ?: continue
            if (parts.size == 2 && digit in 1..9) out.getOrPut(parts[0]) { java.util.TreeSet() }.add(digit)
        }
        return out.mapValues { it.value.toList() }
    }

    /** A 9x9 grid from JSON, tolerating ragged/missing rows (0). */
    private fun parseGrid(element: Any?): List<List<Int>> {
        val outer = element as? JsonArray
        return List(9) { r ->
            val row = outer?.getOrNull(r) as? JsonArray
            List(9) { c -> (row?.getOrNull(c) as? JsonPrimitive)?.content?.toIntOrNull() ?: 0 }
        }
    }

    /**
     * Every digit entered is the solution's there. The solution (`solutionRepr`) is the
     * answer's shape, `{subboards:[{x,y,answers}]}`, one board per canon board.
     */
    override fun matchesSolution(puzzle: Puzzle, userValues: Map<String, Int>): Boolean? {
        val boards = parseSubboards(puzzle.canonRepr)
        val solved = puzzle.solutionRepr?.get("subboards") as? JsonArray ?: return null
        if (solved.size != boards.size) return null
        val byCell = HashMap<String, Int>()
        for ((i, el) in solved.withIndex()) {
            val sb = el as? JsonObject ?: return null
            val x = (sb["x"] as? JsonPrimitive)?.content?.toIntOrNull() ?: return null
            val y = (sb["y"] as? JsonPrimitive)?.content?.toIntOrNull() ?: return null
            if (x != boards[i].x || y != boards[i].y) return null
            val answers = SolutionCheck.grid(sb["answers"], 9, 9) ?: return null
            for (r in 0 until 9) for (c in 0 until 9) byCell["${3 * x + c},${3 * y + r}"] = answers[r][c]
        }
        return SolutionCheck.matches(userValues) { key, value ->
            val want = byCell[key]
            if (want == null || value !in 1..9) null else want == value
        }
    }
}
