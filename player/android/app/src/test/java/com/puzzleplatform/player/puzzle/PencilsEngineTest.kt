package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors the web extractor, progress and validateSolution in PencilsBoard.tsx. */
class PencilsEngineTest {

    private fun puzzle(cells: String): Puzzle = Puzzle(
        id = "pe",
        puzzleType = 8,
        puzzleTypeName = "pencils",
        puzzleTypeJpLabel = "ペンシルズ",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement("""{"cells":$cells}""") as JsonObject,
    )

    // 3x3, three upright pencils, one per column: head in the middle row pointing up,
    // its one-cell body below it, its trail one segment up. Column 1's head is the player's.
    private val columns = puzzle("[[0,0,0],[-1,0,-1],[1,0,0]]")
    private val columnsSolved = mapOf(
        "tv:0,0" to 1, "tv:0,1" to 1, "tv:0,2" to 1,
        "hd:1,1" to -1, "eh:1,1" to 1,
        // Walls between the bodies in the bottom row.
        "ev:2,0" to 1, "ev:2,1" to 1,
    )

    @Test
    fun solvedBoardCompletes() {
        assertTrue(PencilsEngine.isComplete(columns, columnsSolved))
        assertEquals(100.0, PencilsEngine.computeProgress(columns, columnsSolved), 1e-9)
    }

    @Test
    fun bodiesMustBeWalledApart() {
        // Without the walls the bottom row is one 1x3 body: three cells, trail of one.
        assertFalse(PencilsEngine.isComplete(columns, columnsSolved - "ev:2,0" - "ev:2,1"))
    }

    @Test
    fun missingHeadOrTrailIsIncomplete() {
        assertFalse(PencilsEngine.isComplete(columns, columnsSolved - "hd:1,1"))
        assertFalse(PencilsEngine.isComplete(columns, columnsSolved - "tv:0,2"))
    }

    @Test
    fun numberMustMatchTrailLength() {
        // 1x5: head pointing left at col 2, body cols 3-4 (clue 2), trail two segments left.
        val p = puzzle("[[0,0,-3,2,0]]")
        val ok = mapOf("th:0,0" to 1, "th:0,1" to 1)
        assertTrue(PencilsEngine.isComplete(p, ok))
        // A clue of 1 can't sit on a two-cell body.
        assertFalse(PencilsEngine.isComplete(puzzle("[[0,0,-3,1,0]]"), ok))
    }

    @Test
    fun trailsMayTurn() {
        // 3x4. Pencil A: given head (0,0) pointing left, body (0,1)-(0,3) with clue 3,
        // trail (0,0) -> (1,0) -> (2,0) -> (2,1). Pencil B: player head (1,3) pointing
        // right, body (1,1)-(1,2) with clue 2, trail (1,3) -> (2,3) -> (2,2).
        val p = puzzle("[[-3,3,0,0],[0,2,0,0],[0,0,0,0]]")
        val solved = mapOf(
            "tv:0,0" to 1, "tv:1,0" to 1, "th:2,0" to 1,
            "tv:1,3" to 1, "th:2,2" to 1,
            "hd:1,3" to -4, "ev:1,2" to 1,
            "eh:0,1" to 1, "eh:0,2" to 1, "eh:0,3" to 1, "eh:1,1" to 1, "eh:1,2" to 1, "ev:1,0" to 1,
        )
        assertTrue(PencilsEngine.isComplete(p, solved))
        // A branch off a trail breaks it.
        assertFalse(PencilsEngine.isComplete(p, solved + ("th:1,0" to 1)))
        // Swapping the clues breaks both pencils.
        assertFalse(PencilsEngine.isComplete(puzzle("[[-3,2,0,0],[0,3,0,0],[0,0,0,0]]"), solved))
    }

    @Test
    fun progressCountsTouchedCells() {
        val p = puzzle("[[0,-3,1]]")
        assertEquals(100.0 / 3, PencilsEngine.computeProgress(p, emptyMap()), 1e-9)
        assertEquals(200.0 / 3, PencilsEngine.computeProgress(p, mapOf("th:0,0" to 1)), 1e-9)
    }

    @Test
    fun answerRoundTrips() {
        val answer = PencilsEngine.extractAnswer(columns, columnsSolved)
        assertEquals(
            Json.parseToJsonElement(
                """{"trails":{"h":[[0,0],[0,0],[0,0]],"v":[[1,1,1],[0,0,0]]},
                   "heads":[[0,0,0],[0,-1,0],[0,0,0]],
                   "edges":{"h":[[0,0,0],[0,1,0]],"v":[[0,0],[0,0],[1,1]]}}""",
            ),
            answer,
        )
        assertEquals(columnsSolved, PencilsEngine.restoreUserValues(columns, answer))
    }

    @Test
    fun headEdgeIsItsBase() {
        assertEquals("eh:1,1", PencilsRules.headEdgeKey(1, 1, PencilsRules.UP, 3, 3))
        assertEquals("eh:0,1", PencilsRules.headEdgeKey(1, 1, PencilsRules.DOWN, 3, 3))
        assertEquals("ev:1,1", PencilsRules.headEdgeKey(1, 1, PencilsRules.LEFT, 3, 3))
        assertEquals("ev:1,0", PencilsRules.headEdgeKey(1, 1, PencilsRules.RIGHT, 3, 3))
        assertEquals(null, PencilsRules.headEdgeKey(2, 0, PencilsRules.UP, 3, 3))
    }

    @Test
    fun registered() {
        assertEquals(PencilsEngine, PuzzleEngines.forType(8))
    }
}
