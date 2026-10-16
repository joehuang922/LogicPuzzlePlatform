package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pure mapping logic behind the Admin "create question" flow: parsed canon →
 * editable userValues → rebuilt canon round-trips, and the create request carries
 * the sudoku invariants (9×9, type 1).
 */
class SudokuAuthoringTest {

    /** Build a canon { hints: <grid> } JSON object from a 9×9 int grid. */
    private fun canon(hints: List<List<Int>>): JsonObject {
        val rows = hints.map { row -> JsonArray(row.map { JsonPrimitive(it) }) }
        return JsonObject(mapOf("hints" to JsonArray(rows)))
    }

    private val sampleGrid: List<List<Int>> = listOf(
        listOf(5, 3, 0, 0, 7, 0, 0, 0, 0),
        listOf(6, 0, 0, 1, 9, 5, 0, 0, 0),
        listOf(0, 9, 8, 0, 0, 0, 0, 6, 0),
        listOf(8, 0, 0, 0, 6, 0, 0, 0, 3),
        listOf(4, 0, 0, 8, 0, 3, 0, 0, 1),
        listOf(7, 0, 0, 0, 2, 0, 0, 0, 6),
        listOf(0, 6, 0, 0, 0, 0, 2, 8, 0),
        listOf(0, 0, 0, 4, 1, 9, 0, 0, 5),
        listOf(0, 0, 0, 0, 8, 0, 0, 7, 9),
    )

    @Test
    fun `userValues seeded only from positive givens`() {
        val values = SudokuAuthoring.userValuesFromCanon(canon(sampleGrid))

        // One key per non-zero cell, none for empties.
        val expectedCount = sampleGrid.sumOf { row -> row.count { it > 0 } }
        assertEquals(expectedCount, values.size)
        assertEquals(5, values["0,0"])
        assertEquals(3, values["1,0"])
        assertEquals(7, values["4,0"])
        assertNull(values["2,0"]) // an empty cell contributes no key
    }

    @Test
    fun `canon rebuilt from userValues round-trips the grid`() {
        val values = SudokuAuthoring.userValuesFromCanon(canon(sampleGrid))
        val rebuilt = SudokuAuthoring.canonFromUserValues(values)

        val rebuiltRows = rebuilt["hints"]!!.jsonArray
        assertEquals(9, rebuiltRows.size)
        for (row in 0 until 9) {
            val rebuiltRow = rebuiltRows[row].jsonArray
            assertEquals(9, rebuiltRow.size)
            for (col in 0 until 9) {
                assertEquals(sampleGrid[row][col], rebuiltRow[col].jsonPrimitive.int)
            }
        }
    }

    @Test
    fun `edited cell shows up in rebuilt canon`() {
        val values = SudokuAuthoring.userValuesFromCanon(canon(sampleGrid))
            .toMutableMap()
            .apply { this["2,0"] = 4 } // fix a cell OCR left empty

        val rebuilt = SudokuAuthoring.canonFromUserValues(values)
        val row0 = rebuilt["hints"]!!.jsonArray[0].jsonArray
        assertEquals(4, row0[2].jsonPrimitive.int)
    }

    @Test
    fun `create request carries sudoku invariants`() {
        val req = CreatePuzzleRequest(
            puzzleType = SudokuAuthoring.PUZZLE_TYPE,
            difficulty = 3,
            canonRepr = SudokuAuthoring.canonFromUserValues(emptyMap()),
            width = SudokuAuthoring.SIZE,
            height = SudokuAuthoring.SIZE,
        )
        assertEquals(1, req.puzzleType)
        assertEquals(9, req.width)
        assertEquals(9, req.height)
    }

    @Test
    fun `blank review puzzle locks no cells`() {
        val puzzle = SudokuAuthoring.blankPuzzle()
        val hints = SudokuEngine.parseHints(puzzle)
        for (row in 0 until 9) for (col in 0 until 9) {
            assertEquals(0, hints[row][col])
        }
    }
}
