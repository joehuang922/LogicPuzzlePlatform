package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PicturesqueMazeEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "p1",
        puzzleType = 44,
        puzzleTypeName = "picturesque-maze",
        puzzleTypeJpLabel = "浮き出しメイロ",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // The doc's (and the web rules test's) 3x4 perfect maze.
    private val small = puzzle(
        """{"width":4,"height":3,
           "walls":{"h":[[0,1,0,0],[0,1,1,0]],"v":[[0,1,0],[0,0,1],[0,0,1]]},
           "entrance":{"side":"top","index":0},"exit":{"side":"bottom","index":3}}"""
    )
    private val route = listOf(0 to 0, 1 to 0, 1 to 1, 1 to 2, 0 to 2, 0 to 3, 1 to 3, 2 to 3)
    private val solved = PicturesqueMazeEngine.valuesForPath(route)

    @Test
    fun solve_findsTheUniqueRoute() {
        val board = PicturesqueMazeEngine.parseBoard(small)
        assertEquals(PicturesqueMazeEngine.Solution(route, true), PicturesqueMazeEngine.solve(board))
        assertEquals(emptyList<String>(), PicturesqueMazeEngine.formatProblems(board))
        assertEquals(PicturesqueMazeEngine.Warnings(emptyList(), emptyList()), PicturesqueMazeEngine.warnings(board))
    }

    @Test
    fun valuesUseTheWebKeys() {
        assertEquals(
            mapOf("v:0,0" to 1, "h:1,0" to 1, "h:1,1" to 1, "v:0,2" to 1, "h:0,2" to 1, "v:0,3" to 1, "v:1,3" to 1),
            solved,
        )
    }

    @Test
    fun extractAndRestore_roundTrip() {
        val answer = PicturesqueMazeEngine.extractAnswer(small, solved)
        // The doc's answer example.
        assertEquals(
            Json.parseToJsonElement("""{"edges":{"h":[[0,0,1],[1,1,0],[0,0,0]],"v":[[1,0,1,1],[0,0,0,1]]}}"""),
            answer,
        )
        assertEquals(solved, PicturesqueMazeEngine.restoreUserValues(small, answer))
    }

    @Test
    fun completion_needsExactlyTheRoute() {
        assertTrue(PicturesqueMazeEngine.isComplete(small, solved))
        assertFalse(PicturesqueMazeEngine.isComplete(small, PicturesqueMazeEngine.valuesForPath(route.dropLast(1))))
        assertFalse(PicturesqueMazeEngine.isComplete(small, solved + ("h:2,0" to 1)))
    }

    @Test
    fun progress_isPathLengthCappedAt99() {
        assertEquals(0.0, PicturesqueMazeEngine.computeProgress(small, emptyMap()), 0.0)
        assertEquals(50.0, PicturesqueMazeEngine.computeProgress(small, PicturesqueMazeEngine.valuesForPath(route.take(4))), 0.0)
        val wrong = listOf(0 to 0, 1 to 0, 2 to 0, 2 to 1, 2 to 2)
        assertEquals(63.0, PicturesqueMazeEngine.computeProgress(small, PicturesqueMazeEngine.valuesForPath(wrong)), 0.0)
        assertEquals(100.0, PicturesqueMazeEngine.computeProgress(small, solved), 0.0)
    }

    @Test
    fun drag_stepsOnlyThroughOpenSides() {
        val board = PicturesqueMazeEngine.parseBoard(small)
        // From (1,1): right is open, up is a wall; mostly-up with a little right is refused.
        assertEquals(1 to 2, PicturesqueMazeEngine.stepToward(board, 1 to 1, 1.6f, 2.4f))
        assertNull(PicturesqueMazeEngine.stepToward(board, 1 to 1, 0.4f, 1.5f))
        assertNull(PicturesqueMazeEngine.stepToward(board, 1 to 1, 0.3f, 1.9f))
        // Walking the end to (1,2) from the entrance follows the corridor.
        val walked = PicturesqueMazeEngine.walkToward(board, listOf(0 to 0, 1 to 0), 1.5f, 2.5f)
        assertEquals(listOf(0 to 0, 1 to 0, 1 to 1, 1 to 2), walked)
        // Pointing back retracts.
        assertEquals(listOf(0 to 0, 1 to 0), PicturesqueMazeEngine.walkToward(board, walked, 1.5f, 0.5f))
    }

    @Test
    fun changesTo_dropsAndAddsSegments() {
        val changes = PicturesqueMazeEngine.changesTo(solved, route.take(2))
        assertEquals(1, PicturesqueMazeEngine.path(PicturesqueMazeEngine.parseBoard(small), emptyMap()).size)
        assertEquals(6, changes.count { it.value == 0 })
        assertEquals(0, changes.count { it.value == 1 })
    }

    @Test
    fun deadEnd_atThePathsEnd() {
        val board = PicturesqueMazeEngine.parseBoard(small)
        assertTrue(PicturesqueMazeEngine.endsInDeadEnd(board, listOf(0 to 0, 0 to 1)))
        assertFalse(PicturesqueMazeEngine.endsInDeadEnd(board, listOf(0 to 0, 1 to 0)))
        assertFalse(PicturesqueMazeEngine.endsInDeadEnd(board, route))
    }

    @Test
    fun tiedRoutes_areAFormatProblem() {
        val open = PicturesqueMazeEngine.parseBoard(
            puzzle(
                """{"width":2,"height":2,"walls":{"h":[[0,0]],"v":[[0],[0]]},
                   "entrance":{"side":"top","index":0},"exit":{"side":"bottom","index":1}}"""
            )
        )
        assertEquals(listOf("The shortest route is not unique"), PicturesqueMazeEngine.formatProblems(open))
        assertEquals(setOf(0 to 1, 1 to 0), PicturesqueMazeEngine.tiedRouteCells(open).toSet())
    }

    @Test
    fun thumbnail_drawsTheRouteBlackOnWhite() {
        val thumb = PicturesqueMazeEngine.renderThumbnail(small, PicturesqueMazeEngine.extractAnswer(small, solved))!!
        assertEquals(4, thumb.width)
        assertEquals(3, thumb.height)
        val b = PicturesqueMazeEngine.FILL_ARGB
        val w = PicturesqueMazeEngine.PAPER_ARGB
        assertArrayEquals(intArrayOf(b, w, b, b, b, b, b, b, w, w, w, b), thumb.cells)
    }

    @Test
    fun registeredForType44() {
        assertEquals(PicturesqueMazeEngine, PuzzleEngines.forType(44))
    }
}
