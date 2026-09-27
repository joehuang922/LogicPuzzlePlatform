package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SudokuEngineTest {

    // -- helpers ------------------------------------------------------------

    /** Build a Puzzle whose canonRepr is { hints: <grid> } from a 9x9 int grid. */
    private fun puzzleWithHints(hints: List<List<Int>>): Puzzle {
        val rows = hints.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }
        val canon = JsonObject(mapOf("hints" to JsonArray(rows)))
        return Puzzle(
            id = "p1",
            puzzleType = 1,
            puzzleTypeName = "sudoku",
            puzzleTypeJpLabel = "数独",
            difficulty = 3,
            canonRepr = canon,
        )
    }

    private val emptyGrid: List<List<Int>> = List(9) { List(9) { 0 } }

    /**
     * A fully-solved 9x9 sudoku solution (valid, no conflicts). Used as the
     * "target" grid; individual tests carve hints/user values out of it.
     */
    private val solution: List<List<Int>> = listOf(
        listOf(5, 3, 4, 6, 7, 8, 9, 1, 2),
        listOf(6, 7, 2, 1, 9, 5, 3, 4, 8),
        listOf(1, 9, 8, 3, 4, 2, 5, 6, 7),
        listOf(8, 5, 9, 7, 6, 1, 4, 2, 3),
        listOf(4, 2, 6, 8, 5, 3, 7, 9, 1),
        listOf(7, 1, 3, 9, 2, 4, 8, 5, 6),
        listOf(9, 6, 1, 5, 3, 7, 2, 8, 4),
        listOf(2, 8, 7, 4, 1, 9, 6, 3, 5),
        listOf(3, 4, 5, 2, 8, 6, 1, 7, 9),
    )

    /** Grid -> userValues map, keyed "col,row", for every positive cell. */
    private fun gridToUserValues(grid: List<List<Int>>): Map<String, Int> = buildMap {
        for (row in 0 until 9) for (col in 0 until 9) {
            if (grid[row][col] > 0) put("$col,$row", grid[row][col])
        }
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_mergesHintsAndUserValuesIntoFull9x9Grid() {
        // Hints on the top-left, player fills the top-right of the first row.
        val hints = emptyGrid.toMutableList().map { it.toMutableList() }
        hints[0][0] = 5
        val puzzle = puzzleWithHints(hints)
        val userValues = mapOf("1,0" to 3, "8,0" to 2)

        val answer = SudokuEngine.extractAnswer(puzzle, userValues)
        val outRows = (answer["hints"] as JsonArray).map { it.jsonArray }

        assertEquals(9, outRows.size)
        outRows.forEach { assertEquals(9, it.size) }
        // Hint preserved, user values placed, everything else 0.
        assertEquals(5, outRows[0][0].jsonPrimitive.int)
        assertEquals(3, outRows[0][1].jsonPrimitive.int)
        assertEquals(2, outRows[0][8].jsonPrimitive.int)
        assertEquals(0, outRows[0][2].jsonPrimitive.int)
        assertEquals(0, outRows[1][0].jsonPrimitive.int)
    }

    @Test
    fun extractAnswer_hintTakesPrecedenceOverUserValue() {
        val hints = emptyGrid.toMutableList().map { it.toMutableList() }
        hints[4][4] = 7
        val puzzle = puzzleWithHints(hints)
        // A stray user value on a hint cell must be ignored in favor of the hint.
        val userValues = mapOf("4,4" to 9)

        val answer = SudokuEngine.extractAnswer(puzzle, userValues)
        val outRows = (answer["hints"] as JsonArray).map { it.jsonArray }
        assertEquals(7, outRows[4][4].jsonPrimitive.int)
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_isZeroWhenNothingFilled() {
        val puzzle = puzzleWithHints(emptyGrid)
        assertEquals(0.0, SudokuEngine.computeProgress(puzzle, emptyMap()), 0.0001)
    }

    @Test
    fun computeProgress_countsOnlyEmptyCellsThatGotFilled() {
        // 2 hints -> 79 empty cells. Fill 79 of them via a partial map... use a small case.
        val hints = emptyGrid.toMutableList().map { it.toMutableList() }
        hints[0][0] = 1
        hints[0][1] = 2
        val puzzle = puzzleWithHints(hints)
        // 81 - 2 = 79 empty cells; fill exactly 79 by supplying the full solution
        // for every non-hint cell.
        val userValues = buildMap {
            for (row in 0 until 9) for (col in 0 until 9) {
                if (!(row == 0 && (col == 0 || col == 1))) put("$col,$row", solution[row][col])
            }
        }
        assertEquals(100.0, SudokuEngine.computeProgress(puzzle, userValues), 0.0001)

        // Remove one -> 78/79.
        val minusOne = userValues - "8,8"
        assertEquals(78.0 / 79.0 * 100.0, SudokuEngine.computeProgress(puzzle, minusOne), 0.0001)
    }

    @Test
    fun computeProgress_hintOnlyCellsDoNotCount() {
        // Fully-hinted puzzle: 0 empty cells -> defined as 100%.
        val puzzle = puzzleWithHints(solution)
        assertEquals(100.0, SudokuEngine.computeProgress(puzzle, emptyMap()), 0.0001)
    }

    // -- findConflicts ------------------------------------------------------

    @Test
    fun findConflicts_emptyWhenNoDuplicates() {
        val puzzle = puzzleWithHints(emptyGrid)
        val userValues = gridToUserValues(solution)
        assertTrue(SudokuEngine.findConflicts(puzzle, userValues).isEmpty())
    }

    @Test
    fun findConflicts_detectsRowDuplicate() {
        val puzzle = puzzleWithHints(emptyGrid)
        // Same value twice in row 0.
        val userValues = mapOf("0,0" to 5, "3,0" to 5)
        val conflicts = SudokuEngine.findConflicts(puzzle, userValues)
        assertTrue(conflicts.contains("0,0"))
        assertTrue(conflicts.contains("3,0"))
    }

    @Test
    fun findConflicts_detectsColumnDuplicate() {
        val puzzle = puzzleWithHints(emptyGrid)
        // Same value twice in column 2.
        val userValues = mapOf("2,0" to 8, "2,5" to 8)
        val conflicts = SudokuEngine.findConflicts(puzzle, userValues)
        assertTrue(conflicts.contains("2,0"))
        assertTrue(conflicts.contains("2,5"))
    }

    @Test
    fun findConflicts_detectsBoxDuplicate() {
        val puzzle = puzzleWithHints(emptyGrid)
        // Two cells in the top-left 3x3 box, different row and column, same value.
        val userValues = mapOf("0,0" to 4, "2,2" to 4)
        val conflicts = SudokuEngine.findConflicts(puzzle, userValues)
        assertTrue(conflicts.contains("0,0"))
        assertTrue(conflicts.contains("2,2"))
    }

    @Test
    fun findConflicts_includesHintCellsInTheCheck() {
        val hints = emptyGrid.toMutableList().map { it.toMutableList() }
        hints[0][0] = 6
        val puzzle = puzzleWithHints(hints)
        // User places a 6 elsewhere in row 0; conflict is against the hint.
        val userValues = mapOf("5,0" to 6)
        val conflicts = SudokuEngine.findConflicts(puzzle, userValues)
        assertTrue(conflicts.contains("0,0"))
        assertTrue(conflicts.contains("5,0"))
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForFullConflictFreeGrid() {
        val puzzle = puzzleWithHints(emptyGrid)
        val userValues = gridToUserValues(solution)
        assertTrue(SudokuEngine.isComplete(puzzle, userValues))
    }

    @Test
    fun isComplete_falseWhenNotFullyFilled() {
        val puzzle = puzzleWithHints(emptyGrid)
        val userValues = gridToUserValues(solution) - "8,8"
        assertFalse(SudokuEngine.isComplete(puzzle, userValues))
    }

    @Test
    fun isComplete_falseWhenFullButConflicting() {
        val puzzle = puzzleWithHints(emptyGrid)
        // Full grid but swap two cells in row 0 to create a duplicate.
        val broken = solution.map { it.toMutableList() }.toMutableList()
        broken[0][0] = broken[0][1] // introduce a duplicate in row 0
        val userValues = gridToUserValues(broken)
        assertFalse(SudokuEngine.isComplete(puzzle, userValues))
    }

    @Test
    fun isComplete_countsHintsTowardTheFilledTotal() {
        // Split the solution: first row as hints, the rest as user input.
        val hints = emptyGrid.toMutableList().map { it.toMutableList() }
        for (col in 0 until 9) hints[0][col] = solution[0][col]
        val puzzle = puzzleWithHints(hints)
        val userValues = buildMap {
            for (row in 1 until 9) for (col in 0 until 9) put("$col,$row", solution[row][col])
        }
        assertTrue(SudokuEngine.isComplete(puzzle, userValues))
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val hints = emptyGrid.toMutableList().map { it.toMutableList() }
        // Sprinkle a few hints across the board.
        hints[0][0] = solution[0][0]
        hints[4][4] = solution[4][4]
        hints[8][8] = solution[8][8]
        val puzzle = puzzleWithHints(hints)

        // Original user values = whole solution minus the hint cells.
        val original = buildMap {
            for (row in 0 until 9) for (col in 0 until 9) {
                if (hints[row][col] == 0) put("$col,$row", solution[row][col])
            }
        }

        val answer = SudokuEngine.extractAnswer(puzzle, original)
        val restored = SudokuEngine.restoreUserValues(puzzle, answer)

        assertEquals(original, restored)
    }

    @Test
    fun restore_dropsCellsEqualToHintsAndEmpties() {
        val hints = emptyGrid.toMutableList().map { it.toMutableList() }
        hints[0][0] = 5
        val puzzle = puzzleWithHints(hints)
        // Answer where the only non-hint filled cell is 3 at (1,0).
        val answerGrid = emptyGrid.toMutableList().map { it.toMutableList() }
        answerGrid[0][0] = 5 // hint, must NOT come back as a user value
        answerGrid[0][1] = 3
        val answer = SudokuEngine.extractAnswer(puzzleWithHints(answerGrid), emptyMap())

        val restored = SudokuEngine.restoreUserValues(puzzle, answer)
        assertEquals(mapOf("1,0" to 3), restored)
    }

    // -- notes (pencil marks) ----------------------------------------------

    @Test
    fun extractAnswer_emitsNotesFor9x9OfCandidateLists() {
        val puzzle = puzzleWithHints(emptyGrid)
        // Two pencil marks in cell (1,0): digits 3 and 7 (added out of order).
        val userValues = mapOf(
            SudokuEngine.noteKey(1, 0, 7) to 1,
            SudokuEngine.noteKey(1, 0, 3) to 1,
        )
        val answer = SudokuEngine.extractAnswer(puzzle, userValues)
        val notes = (answer["notes"] as JsonArray).map { row -> row.jsonArray.map { it.jsonArray } }

        assertEquals(9, notes.size)
        notes.forEach { assertEquals(9, it.size) }
        // (col=1,row=0) holds an ascending [3,7]; every other cell is empty.
        assertEquals(listOf(3, 7), notes[0][1].map { it.jsonPrimitive.int })
        assertTrue(notes[0][0].isEmpty())
        assertTrue(notes[5][5].isEmpty())
    }

    @Test
    fun extractAnswer_dropsNotesOnAnsweredOrHintCells() {
        val hints = emptyGrid.toMutableList().map { it.toMutableList() }
        hints[0][0] = 5
        val puzzle = puzzleWithHints(hints)
        val userValues = mapOf(
            // committed answer at (1,0) plus a stray note there
            "1,0" to 4,
            SudokuEngine.noteKey(1, 0, 8) to 1,
            // note on a hint cell (0,0)
            SudokuEngine.noteKey(0, 0, 2) to 1,
            // a legitimate note on an empty cell (2,0)
            SudokuEngine.noteKey(2, 0, 6) to 1,
        )
        val answer = SudokuEngine.extractAnswer(puzzle, userValues)
        val notes = (answer["notes"] as JsonArray).map { row -> row.jsonArray.map { it.jsonArray } }

        assertTrue(notes[0][0].isEmpty()) // hint cell
        assertTrue(notes[0][1].isEmpty()) // answered cell
        assertEquals(listOf(6), notes[0][2].map { it.jsonPrimitive.int })
    }

    @Test
    fun notes_roundTripThroughExtractAndRestore() {
        val puzzle = puzzleWithHints(emptyGrid)
        val original = mapOf(
            "0,0" to 5, // committed answer
            SudokuEngine.noteKey(1, 0, 2) to 1,
            SudokuEngine.noteKey(1, 0, 9) to 1,
            SudokuEngine.noteKey(3, 4, 4) to 1,
        )
        val answer = SudokuEngine.extractAnswer(puzzle, original)
        val restored = SudokuEngine.restoreUserValues(puzzle, answer)
        assertEquals(original, restored)
    }

    @Test
    fun restore_toleratesMissingNotesKey() {
        // A legacy answer JSON with only "hints" must still restore (no crash, no notes).
        val puzzle = puzzleWithHints(emptyGrid)
        val rows = solution.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }
        val legacyAnswer = JsonObject(mapOf("hints" to JsonArray(rows)))
        val restored = SudokuEngine.restoreUserValues(puzzle, legacyAnswer)
        assertEquals(gridToUserValues(solution), restored)
    }

    @Test
    fun notes_doNotCountTowardProgressOrCompletion() {
        val puzzle = puzzleWithHints(emptyGrid)
        // A full solution (complete) plus scattered notes must still be complete,
        // and notes alone must not move progress off zero.
        val notesOnly = mapOf(
            SudokuEngine.noteKey(0, 0, 1) to 1,
            SudokuEngine.noteKey(0, 0, 2) to 1,
        )
        assertEquals(0.0, SudokuEngine.computeProgress(puzzle, notesOnly), 0.0001)
        assertFalse(SudokuEngine.isComplete(puzzle, notesOnly))
    }

    // -- parseHints tolerance ----------------------------------------------

    @Test
    fun parseHints_missingHintsKeyYieldsAllZeros() {
        val puzzle = Puzzle(
            id = "p",
            puzzleType = 1,
            puzzleTypeName = "sudoku",
            puzzleTypeJpLabel = "数独",
            difficulty = 1,
            canonRepr = JsonObject(emptyMap()),
        )
        val grid = SudokuEngine.parseHints(puzzle)
        assertEquals(9, grid.size)
        assertTrue(grid.all { row -> row.size == 9 && row.all { it == 0 } })
    }

    @Test
    fun parseHints_raggedRowsPadWithZeros() {
        // A canonRepr with a short row and a missing row; both must pad to 0.
        val raw = """{"hints":[[1,2,3],[4]]}"""
        val canon = Json.parseToJsonElement(raw) as JsonObject
        val puzzle = Puzzle(
            id = "p",
            puzzleType = 1,
            puzzleTypeName = "sudoku",
            puzzleTypeJpLabel = "数独",
            difficulty = 1,
            canonRepr = canon,
        )
        val grid = SudokuEngine.parseHints(puzzle)
        assertEquals(1, grid[0][0])
        assertEquals(3, grid[0][2])
        assertEquals(0, grid[0][3]) // short row padded
        assertEquals(4, grid[1][0])
        assertEquals(0, grid[1][1])
        assertEquals(0, grid[8][8]) // missing row padded
    }
}
