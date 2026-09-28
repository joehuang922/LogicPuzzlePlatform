package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Kakuro (puzzle type 12). Ports:
 *  - answer extraction from frontend/src/extractors/kakuro.ts
 *  - progress from frontend/src/progress/kakuro.ts
 *  - run/conflict analysis from frontend/src/liveValidators/kakuro.ts
 *  - completion logic from frontend/src/components/KakuroBoard.tsx (validateSolution)
 *
 * canonRepr: { cells: Cell[][] } where each Cell is either
 *   { type: "clue", right?: int|null, down?: int|null }  or  { type: "empty" }.
 * The grid is m x n (variable, unlike Sudoku's fixed 9x9).
 *
 * answer: { values: number[][] } — same m x n; clue cells hold 0, empty cells the
 * player's digit (1-9, 0 when unfilled).
 *
 * User input rides in the flat userValues map keyed "col,row" -> digit, matching
 * the web client's transport exactly. Kakuro has no pencil-mark notes.
 */
object KakuroEngine : PuzzleEngine {
    override val puzzleType: Int = 12

    sealed class Cell {
        data class Clue(val right: Int?, val down: Int?) : Cell()
        object Empty : Cell()
    }

    /**
     * A maximal horizontal or vertical strip of empty cells constrained by a
     * single clue's sum. [clueCol]/[clueRow] locate the owning clue cell so a
     * violated run can flag the hint number itself.
     */
    data class Run(
        val col: Int, // first empty cell of the run
        val row: Int,
        val length: Int,
        val sum: Int,
        val direction: Char, // 'h' or 'v'
        val clueCol: Int,
        val clueRow: Int,
    )

    /** Live-validation annotations (mirrors analyzeKakuro's return). */
    data class Analysis(
        val cellErrors: Set<String>, // empty cells "col,row" in a violation
        val clueErrors: Set<String>, // clue hints "col,row:right" / "col,row:down"
    )

    /** Parse the m x n cell grid from a puzzle's canonRepr; missing/invalid -> empty. */
    fun parseCells(puzzle: Puzzle): List<List<Cell>> = parseCells(puzzle.canonRepr["cells"])

    private fun parseCells(element: Any?): List<List<Cell>> {
        val outer = element as? JsonArray ?: return emptyList()
        return outer.map { rowEl ->
            val rowArr = rowEl as? JsonArray ?: return@map emptyList<Cell>()
            rowArr.map { cellEl ->
                val obj = cellEl as? JsonObject ?: return@map Cell.Empty
                when ((obj["type"] as? JsonPrimitive)?.contentOrNull) {
                    "clue" -> Cell.Clue(
                        right = (obj["right"] as? JsonPrimitive)?.intOrNull,
                        down = (obj["down"] as? JsonPrimitive)?.intOrNull,
                    )
                    else -> Cell.Empty
                }
            }
        }
    }

    override fun extractAnswer(puzzle: Puzzle, userValues: Map<String, Int>): JsonObject {
        val cells = parseCells(puzzle)
        val rows = buildList {
            for (r in cells.indices) {
                val row = cells[r]
                add(JsonArray(buildList {
                    for (c in row.indices) {
                        val v = if (row[c] is Cell.Empty) userValues["$c,$r"] ?: 0 else 0
                        add(JsonPrimitive(v))
                    }
                }))
            }
        }
        return JsonObject(mapOf("values" to JsonArray(rows)))
    }

    override fun computeProgress(puzzle: Puzzle, userValues: Map<String, Int>): Double {
        val cells = parseCells(puzzle)
        var totalEmpty = 0
        var filled = 0
        for (r in cells.indices) {
            val row = cells[r]
            for (c in row.indices) {
                if (row[c] is Cell.Empty) {
                    totalEmpty++
                    if ((userValues["$c,$r"] ?: 0) > 0) filled++
                }
            }
        }
        if (totalEmpty == 0) return 100.0
        return filled.toDouble() / totalEmpty * 100.0
    }

    override fun restoreUserValues(puzzle: Puzzle, answer: JsonObject): Map<String, Int> {
        val cells = parseCells(puzzle)
        val values = answer["values"] as? JsonArray
        val result = mutableMapOf<String, Int>()
        for (r in cells.indices) {
            val row = cells[r]
            val rowArr = values?.getOrNull(r) as? JsonArray
            for (c in row.indices) {
                if (row[c] !is Cell.Empty) continue
                val v = (rowArr?.getOrNull(c) as? JsonPrimitive)?.intOrNull ?: 0
                if (v in 1..9) result["$c,$r"] = v
            }
        }
        return result
    }

    /** Every horizontal/vertical run constrained by a clue's right/down sum. */
    fun getRuns(cells: List<List<Cell>>): List<Run> {
        val runs = mutableListOf<Run>()
        val rows = cells.size
        for (r in 0 until rows) {
            val cols = cells[r].size
            for (c in 0 until cols) {
                val cell = cells[r][c] as? Cell.Clue ?: continue
                cell.right?.let { sum ->
                    var len = 0
                    var cc = c + 1
                    while (cc < cells[r].size && cells[r][cc] is Cell.Empty) { len++; cc++ }
                    if (len > 0) runs.add(Run(c + 1, r, len, sum, 'h', c, r))
                }
                cell.down?.let { sum ->
                    var len = 0
                    var rr = r + 1
                    while (rr < rows && (cells[rr].getOrNull(c) is Cell.Empty)) { len++; rr++ }
                    if (len > 0) runs.add(Run(c, r + 1, len, sum, 'v', c, r))
                }
            }
        }
        return runs
    }

    /**
     * Report only *certain* violations (mirrors analyzeKakuro), so a partial run
     * isn't accused unless it already can't be right:
     *   - a duplicate digit within a run (kakuro forbids repeats)
     *   - a fully-filled run whose sum != the hint
     *   - a partially-filled run whose running total already exceeds the hint
     */
    fun analyze(puzzle: Puzzle, userValues: Map<String, Int>): Analysis {
        val cells = parseCells(puzzle)
        val cellErrors = mutableSetOf<String>()
        val clueErrors = mutableSetOf<String>()

        for (run in getRuns(cells)) {
            val filled = mutableListOf<Pair<Int, String>>() // value to key
            for (i in 0 until run.length) {
                val r = if (run.direction == 'h') run.row else run.row + i
                val c = if (run.direction == 'h') run.col + i else run.col
                val key = "$c,$r"
                userValues[key]?.let { if (it > 0) filled.add(it to key) }
            }
            val clueKey = "${run.clueCol},${run.clueRow}:${if (run.direction == 'h') "right" else "down"}"

            // Duplicate digits within the run.
            val seen = HashMap<Int, MutableList<String>>()
            for ((v, key) in filled) seen.getOrPut(v) { mutableListOf() }.add(key)
            seen.values.filter { it.size > 1 }.forEach { keys -> cellErrors.addAll(keys) }

            val total = filled.sumOf { it.first }
            if (filled.size == run.length) {
                if (total != run.sum) {
                    filled.forEach { cellErrors.add(it.second) }
                    clueErrors.add(clueKey)
                }
            } else if (total > run.sum) {
                filled.forEach { cellErrors.add(it.second) }
                clueErrors.add(clueKey)
            }
        }
        return Analysis(cellErrors, clueErrors)
    }

    /** True when all empty cells are filled and every run sums correctly with unique digits. */
    override fun isComplete(puzzle: Puzzle, userValues: Map<String, Int>): Boolean {
        val cells = parseCells(puzzle)
        // All empty cells filled.
        for (r in cells.indices) {
            val row = cells[r]
            for (c in row.indices) {
                if (row[c] is Cell.Empty && (userValues["$c,$r"] ?: 0) <= 0) return false
            }
        }
        // Every run: exact sum, unique digits.
        for (run in getRuns(cells)) {
            val digits = mutableListOf<Int>()
            for (i in 0 until run.length) {
                val r = if (run.direction == 'h') run.row else run.row + i
                val c = if (run.direction == 'h') run.col + i else run.col
                val v = userValues["$c,$r"] ?: return false
                digits.add(v)
            }
            if (digits.sum() != run.sum) return false
            if (digits.toSet().size != digits.size) return false
        }
        return true
    }
}
