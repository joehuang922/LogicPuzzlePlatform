package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors the web extractor, progress and validateSolution in ChocoBananaBoard.tsx. */
class ChocoBananaEngineTest {

    private fun puzzle(cells: String): Puzzle = Puzzle(
        id = "cb",
        puzzleType = 16,
        puzzleTypeName = "choco-banana",
        puzzleTypeJpLabel = "チョコバナナ",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement("""{"cells":$cells}""") as JsonObject,
    )

    // 3x3: shade the 2x2 top-left block (a rectangle of 4); the other five cells form an
    // L-shaped banana group of 5 (not a rectangle).
    private val p = puzzle("[[4,0,0],[0,0,0],[0,0,5]]")
    private val k = ChocoBananaEngine::cellKey
    private val solved = mapOf(k(0, 0) to 1, k(1, 0) to 1, k(0, 1) to 1, k(1, 1) to 1)

    @Test
    fun solvedBoardCompletes() {
        assertTrue(ChocoBananaEngine.isComplete(p, solved))
        // Banana marks are solving aids: marking the L still completes.
        assertTrue(ChocoBananaEngine.isComplete(p, solved + (k(2, 2) to 2) + (k(2, 0) to 2)))
    }

    @Test
    fun shadedGroupsMustBeRectangles() {
        // An L of chocolate (3 cells) is not a rectangle.
        assertFalse(ChocoBananaEngine.isComplete(p, solved - k(1, 1)))
    }

    @Test
    fun bananaGroupsMustNotBeRectangles() {
        // Shade the left two columns: the banana group is the 3x1 right column, a rectangle.
        val cols = (0..2).flatMap { r -> listOf(k(0, r) to 1, k(1, r) to 1) }.toMap()
        assertFalse(ChocoBananaEngine.isComplete(puzzle("[[0,0,0],[0,0,0],[0,0,0]]"), cols))
    }

    @Test
    fun cluesMustMatchGroupSize() {
        assertFalse(ChocoBananaEngine.isComplete(puzzle("[[4,0,0],[0,0,0],[0,0,4]]"), solved))
    }

    @Test
    fun emptyBoardIsNotComplete() {
        assertFalse(ChocoBananaEngine.isComplete(p, emptyMap()))
    }

    @Test
    fun progressCountsDecidedCells() {
        assertEquals(0.0, ChocoBananaEngine.computeProgress(p, emptyMap()), 1e-9)
        assertEquals(500.0 / 9, ChocoBananaEngine.computeProgress(p, solved + (k(2, 2) to 2)), 1e-9)
    }

    @Test
    fun answerRoundTripsWithWebKeys() {
        val values = solved + (k(2, 1) to 2)
        val answer = ChocoBananaEngine.extractAnswer(p, values)
        assertEquals(Json.parseToJsonElement("""{"states":[[1,1,0],[1,1,2],[0,0,0]]}"""), answer)
        assertEquals(values, ChocoBananaEngine.restoreUserValues(p, answer))
        assertEquals("c:2,1", k(2, 1))
    }

    @Test
    fun tapCyclesEveryCellIncludingClues() {
        assertEquals(mapOf("c:0,0" to 1), ShadeCycle.tap(ChocoBananaEngine, p, emptyMap(), 0, 0))
        assertEquals(mapOf("c:0,0" to 2), ShadeCycle.tap(ChocoBananaEngine, p, mapOf("c:0,0" to 1), 0, 0))
        assertEquals(ChocoBananaEngine, PuzzleEngines.forType(16))
    }
}
