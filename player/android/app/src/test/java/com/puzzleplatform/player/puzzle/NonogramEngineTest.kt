package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.NonogramEngine.ClueStatus
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NonogramEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "n1",
        puzzleType = 6,
        puzzleTypeName = "nonogram",
        puzzleTypeJpLabel = "お絵かきロジック",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 3x3 "plus" / cross shape:
    //   . # .
    //   # # #
    //   . # .
    // rowClues: [[1],[3],[1]]   colClues: [[1],[3],[1]]
    private val plusCanon = """{
        "rowClues": [[1],[3],[1]],
        "colClues": [[1],[3],[1]]
    }"""

    // The solved "plus": filled cells only (keys "col,row").
    private val plusSolved = mapOf(
        "1,0" to 1,
        "0,1" to 1, "1,1" to 1, "2,1" to 1,
        "1,2" to 1,
    )

    // -- parseClues ---------------------------------------------------------

    @Test
    fun parseClues_readsRowAndColClues() {
        val clues = NonogramEngine.parseClues(puzzle(plusCanon))
        assertEquals(3, clues.rows)
        assertEquals(3, clues.cols)
        assertEquals(listOf(3), clues.rowClues[1])
        assertEquals(listOf(1), clues.colClues[0])
    }

    // -- extractAnswer / crosses persist ------------------------------------

    @Test
    fun extractAnswer_buildsRowsByColsGridOfStates() {
        val answer = NonogramEngine.extractAnswer(puzzle(plusCanon), plusSolved)
        val cells = (answer["cells"] as JsonArray).map { it.jsonArray }
        assertEquals(3, cells.size)
        assertEquals(3, cells[0].size)
        assertEquals(1, cells[0][1].jsonPrimitive.int) // (col1,row0) filled
        assertEquals(0, cells[0][0].jsonPrimitive.int) // (col0,row0) unset
    }

    @Test
    fun extractAnswer_persistsCrosses() {
        // Divergence from the web extractor (which drops crosses): a crossed cell
        // must survive as state 2 in the saved answer.
        val values = mapOf("1,0" to 1, "0,0" to 2)
        val answer = NonogramEngine.extractAnswer(puzzle(plusCanon), values)
        val cells = (answer["cells"] as JsonArray).map { it.jsonArray }
        assertEquals(2, cells[0][0].jsonPrimitive.int) // crossed cell preserved
        assertEquals(1, cells[0][1].jsonPrimitive.int)
    }

    @Test
    fun restore_roundTripsFilledAndCrossed() {
        val p = puzzle(plusCanon)
        val values = plusSolved + mapOf("0,0" to 2, "2,2" to 2)
        val answer = NonogramEngine.extractAnswer(p, values)
        assertEquals(values, NonogramEngine.restoreUserValues(p, answer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_countsAnyMarkedCell() {
        val p = puzzle(plusCanon) // 9 cells total
        assertEquals(0.0, NonogramEngine.computeProgress(p, emptyMap()), 1e-9)
        // 5 filled + 1 crossed = 6 of 9 marked.
        val v = plusSolved + mapOf("0,0" to 2)
        assertEquals(6.0 / 9.0 * 100.0, NonogramEngine.computeProgress(p, v), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForSolvedPlus() {
        assertTrue(NonogramEngine.isComplete(puzzle(plusCanon), plusSolved))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(NonogramEngine.isComplete(puzzle(plusCanon), emptyMap()))
    }

    @Test
    fun isComplete_crossesDoNotCountAsFilled() {
        // Same shape but the center filled cells replaced by crosses -> incomplete.
        val v = mapOf("1,0" to 1, "0,1" to 2, "1,1" to 2, "2,1" to 2, "1,2" to 1)
        assertFalse(NonogramEngine.isComplete(puzzle(plusCanon), v))
    }

    @Test
    fun isComplete_falseForWrongShape() {
        // Fill the whole top row instead of just the middle: row0 groups=[3] != [1].
        val v = mapOf("0,0" to 1, "1,0" to 1, "2,0" to 1)
        assertFalse(NonogramEngine.isComplete(puzzle(plusCanon), v))
    }

    @Test
    fun isComplete_handlesBlankLineClue() {
        // 1x3 row that must be entirely empty except... clue [0] means blank.
        val canon = """{"rowClues":[[0]],"colClues":[[0],[0],[0]]}"""
        // No filled cells anywhere; but isComplete requires >=1 filled, so an
        // all-blank puzzle is never "complete" (matches web: needs some fill).
        assertFalse(NonogramEngine.isComplete(puzzle(canon), emptyMap()))
    }

    // -- analyzeLineStatus --------------------------------------------------

    @Test
    fun analyzeLine_fullySatisfied() {
        val a = NonogramEngine.analyzeLineStatus(listOf(3), listOf(1, 1, 1))
        assertEquals(listOf(ClueStatus.SATISFIED), a.perClue)
        assertFalse(a.hasError)
    }

    @Test
    fun analyzeLine_sealedGroupTooLargeIsError() {
        // Clue's max run is 1, but a run of 2 sealed by the edges is a certain error.
        val a = NonogramEngine.analyzeLineStatus(listOf(1), listOf(1, 1))
        assertTrue(a.hasError)
    }

    @Test
    fun analyzeLine_unsealedOversizedRunIsNotYetError() {
        // A run of 2 whose right side is still unset could yet be split by a cross,
        // so the heuristic must not accuse it (matches the web validator).
        val a = NonogramEngine.analyzeLineStatus(listOf(1, 1), listOf(1, 1, 0))
        assertFalse(a.hasError)
    }

    @Test
    fun analyzeLine_blankClueWithFillIsError() {
        val a = NonogramEngine.analyzeLineStatus(listOf(0), listOf(0, 1, 0))
        assertTrue(a.hasError)
    }

    @Test
    fun analyzeLine_partialFromStartMarksSatisfied() {
        // First run sealed and matches clue[0]; rest still open.
        // line: # x . .  clue [1,1]  -> first clue satisfied, no error.
        val a = NonogramEngine.analyzeLineStatus(listOf(1, 1), listOf(1, 2, 0, 0))
        assertEquals(ClueStatus.SATISFIED, a.perClue[0])
        assertFalse(a.hasError)
    }

    // -- analyze (grid-level) -----------------------------------------------

    @Test
    fun analyze_cleanForSolvedBoard() {
        val a = NonogramEngine.analyze(puzzle(plusCanon), plusSolved)
        assertTrue(a.cellErrors.isEmpty())
        assertTrue(a.rowClueErrors.isEmpty())
        assertTrue(a.colClueErrors.isEmpty())
    }

    @Test
    fun analyze_flagsOverfilledRow() {
        // Fill all of row 0 (sealed run of 3) while clue is [1] -> row 0 errors,
        // and every cell in row 0 is flagged.
        val v = mapOf("0,0" to 1, "1,0" to 1, "2,0" to 1)
        val a = NonogramEngine.analyze(puzzle(plusCanon), v)
        assertTrue(a.rowClueErrors.contains("0:0"))
        assertTrue(a.cellErrors.contains("0,0"))
        assertTrue(a.cellErrors.contains("2,0"))
    }

    // -- ragged / missing tolerance ----------------------------------------

    @Test
    fun missingCluesKey_yieldsEmptyAndNotComplete() {
        val p = puzzle("""{}""")
        val clues = NonogramEngine.parseClues(p)
        assertEquals(0, clues.rows)
        assertEquals(0, clues.cols)
        assertFalse(NonogramEngine.isComplete(p, emptyMap()))
    }

    // -- renderThumbnail ----------------------------------------------------

    @Test
    fun renderThumbnail_mapsFilledCellsToBlackAndRestBlank() {
        val p = puzzle(plusCanon)
        val answer = NonogramEngine.extractAnswer(p, plusSolved)
        val thumb = NonogramEngine.renderThumbnail(p, answer)!!
        assertEquals(3, thumb.width)
        assertEquals(3, thumb.height)
        // Filled center-plus cells are opaque; corners are blank (0).
        assertEquals(0, thumb.cells[0])                 // (col0,row0) blank
        assertEquals(0xFF222222.toInt(), thumb.cells[1]) // (col1,row0) filled
        assertEquals(0xFF222222.toInt(), thumb.cells[4]) // (col1,row1) filled
        assertEquals(0, thumb.cells[8])                 // (col2,row2) blank
    }

    @Test
    fun renderThumbnail_crossesReadAsBlank() {
        // A cross is a solving aid, not part of the picture.
        val p = puzzle(plusCanon)
        val answer = NonogramEngine.extractAnswer(p, mapOf("0,0" to 2))
        val thumb = NonogramEngine.renderThumbnail(p, answer)!!
        assertEquals(0, thumb.cells[0])
    }

    @Test
    fun renderThumbnail_nullForEmptyClues() {
        assertNull(NonogramEngine.renderThumbnail(puzzle("""{}"""), JsonObject(emptyMap())))
    }
}
