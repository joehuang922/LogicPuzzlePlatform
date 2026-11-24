package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class IrregularNonogramEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "p1",
        puzzleType = 45,
        puzzleTypeName = "irregular-nonogram",
        puzzleTypeJpLabel = "変形ロジック",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // The doc's 3x4 example (docs/irregular-nonogram) and its unique solution.
    private val small = puzzle(
        """{"width":4,"height":3,"cells":[[1,1,0,0],[1,1,1,1],[1,1,1,1]],
           "rowClues":[{"row":0,"start":0,"side":"start","clues":[1]},{"row":1,"start":0,"side":"end","clues":[1]},
                       {"row":2,"start":0,"side":"start","clues":[4]}],
           "colClues":[{"col":0,"start":0,"side":"start","clues":[1]},{"col":1,"start":0,"side":"start","clues":[1,1]},
                       {"col":2,"start":1,"side":"start","clues":[1]},{"col":3,"start":1,"side":"start","clues":[2]}]}"""
    )
    private val solution = listOf(listOf(0, 1, 0, 0), listOf(0, 0, 0, 1), listOf(1, 1, 1, 1))
    private val solved = buildMap {
        solution.forEachIndexed { r, row -> row.forEachIndexed { c, v -> if (v == 1) put("$c,$r", 1) } }
    }

    @Test
    fun segmentsAndLayout() {
        val board = IrregularNonogramEngine.parseBoard(small)
        val segs = IrregularNonogramEngine.segments(board)
        assertEquals(7, segs.size)
        assertEquals(IrregularNonogramEngine.Segment("col", 3, 1, 2), IrregularNonogramEngine.segmentAt(board, "col", 2, 3))
        val col1 = IrregularNonogramEngine.cluesBySegment(board).getValue("col:1:0")
        assertEquals(listOf(Triple(-2, 1, 1), Triple(-1, 1, 1)), IrregularNonogramEngine.clueLayout(col1, 3))
        assertArrayEquals(intArrayOf(-2, -1, 2, 4), IrregularNonogramEngine.layoutBounds(board))
        assertTrue(IrregularNonogramEngine.formatProblems(board).isEmpty())
    }

    @Test
    fun extractAndRestore_roundTrip() {
        val answer = IrregularNonogramEngine.extractAnswer(small, solved + ("0,0" to 2))
        assertEquals(Json.parseToJsonElement("""{"cells":[[0,1,0,0],[0,0,0,1],[1,1,1,1]]}"""), answer)
        assertEquals(solved, IrregularNonogramEngine.restoreUserValues(small, answer))
    }

    @Test
    fun completion_andCrossesCountAsEmpty() {
        assertTrue(IrregularNonogramEngine.isComplete(small, solved))
        assertTrue(IrregularNonogramEngine.isComplete(small, solved + ("0,0" to 2)))
        assertFalse(IrregularNonogramEngine.isComplete(small, solved + ("0,0" to 1)))
    }

    @Test
    fun progress_countsDecidedBoardCells() {
        assertEquals(0.0, IrregularNonogramEngine.computeProgress(small, emptyMap()), 0.0)
        assertEquals(10.0, IrregularNonogramEngine.computeProgress(small, mapOf("0,0" to 2)), 1e-9)
    }

    @Test
    fun lineFits_matchesTheWeb() {
        assertTrue(IrregularNonogramEngine.lineFits(listOf(0, 0, 0, 0), listOf(2, 1)))
        assertFalse(IrregularNonogramEngine.lineFits(listOf(0, 0, 0), listOf(2, 1)))
        assertFalse(IrregularNonogramEngine.lineFits(listOf(1, 0, 0, 1), listOf(3)))
        assertTrue(IrregularNonogramEngine.lineFits(listOf(1, 1, 2, 1), listOf(2, 1)))
        assertFalse(IrregularNonogramEngine.lineFits(listOf(0, 2, 0, 2), listOf(2)))
        val (_, broken) = IrregularNonogramEngine.clueStatus(IrregularNonogramEngine.parseBoard(small), mapOf("0,0" to 1, "1,0" to 1))
        assertTrue("row:0:0" in broken)
    }

    @Test
    fun thumbnail_isTheFilledPicture() {
        val thumb = IrregularNonogramEngine.renderThumbnail(small, IrregularNonogramEngine.extractAnswer(small, solved))!!
        val b = IrregularNonogramEngine.FILL_ARGB
        val w = IrregularNonogramEngine.PAPER_ARGB
        val g = IrregularNonogramEngine.GROUND_ARGB
        assertArrayEquals(intArrayOf(w, b, g, g, w, w, w, b, b, b, b, b), thumb.cells)
    }

    @Test
    fun registeredForType45() {
        assertEquals(IrregularNonogramEngine, PuzzleEngines.forType(45))
    }
}
