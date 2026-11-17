package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.WhimsicalKnightEngine.Dot
import com.puzzleplatform.player.puzzle.WhimsicalKnightEngine.Point
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

class WhimsicalKnightEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "p1",
        puzzleType = 37,
        puzzleTypeName = "whimsical-knight",
        puzzleTypeJpLabel = "気まぐれナイト",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // docs/whimsical-knight/rules-example.canon.json (the rules page's worked example).
    private val example = puzzle(
        """{"rows":5,"cols":5,"gray":[[1,1,1,1],[1,0,0,1],[1,1,1,0],[1,1,1,0]],
           "circles":[{"dr":1,"dc":4},{"dr":3,"dc":6},{"dr":6,"dc":1},{"dr":6,"dc":8},{"dr":7,"dc":2},{"dr":8,"dc":4}],
           "squares":[{"dr":0,"dc":0},{"dr":8,"dc":6}]}"""
    )

    // Its unique solution (docs/whimsical-knight/rules-example.solution.json).
    private val solutionJson = """[[[0,0],[0,1]],[[0,0],[1,0]],[[0,1],[1,1]],[[0,2],[0,3]],[[0,2],[1,2]],
        [[0,3],[0,4]],[[0,4],[1,4]],[[1,0],[2,0]],[[1,1],[1,2]],[[1,3],[2,1]],[[1,3],[2,3]],[[1,4],[2,4]],
        [[2,0],[3,0]],[[2,1],[2,2]],[[2,2],[3,2]],[[2,3],[4,4]],[[2,4],[3,4]],[[3,0],[3,1]],[[3,1],[4,1]],
        [[3,2],[3,3]],[[3,3],[4,3]],[[3,4],[4,4]],[[4,1],[4,2]],[[4,2],[4,3]]]"""

    private val solution: Map<String, Int> =
        (Json.parseToJsonElement(solutionJson) as JsonArray).associate { seg ->
            val (a, b) = seg.jsonArray.map { d -> d.jsonArray.map { it.jsonPrimitive.int } }
            WhimsicalKnightEngine.key(WhimsicalKnightEngine.segment(Dot(a[0], a[1]), Dot(b[0], b[1]))) to 1
        }

    @Test
    fun keys_putTheSmallerDotFirst() {
        val s = WhimsicalKnightEngine.segment(Dot(2, 1), Dot(1, 3))
        assertEquals("s:1,3,2,1", WhimsicalKnightEngine.key(s))
        assertEquals(s, WhimsicalKnightEngine.parseKey("s:2,1,1,3"))
        assertNull(WhimsicalKnightEngine.parseKey("h:1,2"))
    }

    @Test
    fun crosses_matchesTheWebRules() {
        val knight = WhimsicalKnightEngine.segment(Dot(0, 0), Dot(1, 2))
        assertTrue(WhimsicalKnightEngine.crosses(knight, WhimsicalKnightEngine.segment(Dot(0, 1), Dot(1, 1))))
        assertTrue(WhimsicalKnightEngine.crosses(knight, WhimsicalKnightEngine.segment(Dot(0, 2), Dot(1, 0))))
        assertFalse(WhimsicalKnightEngine.crosses(knight, WhimsicalKnightEngine.segment(Dot(1, 2), Dot(1, 3))))
        assertFalse(WhimsicalKnightEngine.crosses(knight, WhimsicalKnightEngine.segment(Dot(1, 0), Dot(2, 2))))
    }

    @Test
    fun clues_straightCircleSquareTurnAndKnightMidpoint() {
        val straight = listOf(
            WhimsicalKnightEngine.segment(Dot(1, 0), Dot(1, 1)),
            WhimsicalKnightEngine.segment(Dot(1, 1), Dot(1, 2)),
        )
        assertTrue(WhimsicalKnightEngine.clueHolds(true, Point(2, 2), straight))
        assertFalse(WhimsicalKnightEngine.clueHolds(false, Point(2, 2), straight))
        val knightTurn = listOf(
            WhimsicalKnightEngine.segment(Dot(1, 1), Dot(2, 3)),
            WhimsicalKnightEngine.segment(Dot(1, 1), Dot(3, 0)),
        )
        assertTrue(WhimsicalKnightEngine.clueHolds(false, Point(2, 2), knightTurn))
        assertTrue(WhimsicalKnightEngine.clueBroken(true, Point(2, 2), knightTurn))
        val knight = listOf(WhimsicalKnightEngine.segment(Dot(0, 0), Dot(1, 2)))
        assertTrue(WhimsicalKnightEngine.clueHolds(true, Point(1, 2), knight))
    }

    @Test
    fun isComplete_acceptsTheExampleSolutionOnly() {
        assertTrue(WhimsicalKnightEngine.isComplete(example, solution))
        for (key in solution.keys) {
            assertFalse("without $key", WhimsicalKnightEngine.isComplete(example, solution - key))
        }
    }

    @Test
    fun badSegments_flagsKnightOverGray() {
        val board = WhimsicalKnightEngine.parseBoard(example)
        val overGray = listOf(WhimsicalKnightEngine.segment(Dot(0, 0), Dot(1, 2)))
        assertEquals(setOf(0), WhimsicalKnightEngine.badSegments(board, overGray))
    }

    @Test
    fun extractAndRestore_roundTrip() {
        val answer = WhimsicalKnightEngine.extractAnswer(example, solution)
        val segs = answer["segments"] as JsonArray
        assertEquals(24, segs.size)
        assertEquals(listOf(listOf(0, 0), listOf(0, 1)), segs[0].jsonArray.map { d -> d.jsonArray.map { it.jsonPrimitive.int } })
        assertEquals(solution, WhimsicalKnightEngine.restoreUserValues(example, answer))
    }

    @Test
    fun computeProgress_countsSatisfiedClues() {
        assertEquals(0.0, WhimsicalKnightEngine.computeProgress(example, emptyMap()), 1e-9)
        assertEquals(100.0, WhimsicalKnightEngine.computeProgress(example, solution), 1e-9)
        // The step (0,2)-(1,2) passes the circle at (1,4): 1 of 8 clues.
        val one = mapOf(WhimsicalKnightEngine.key(WhimsicalKnightEngine.segment(Dot(0, 2), Dot(1, 2))) to 1)
        assertEquals(100.0 / 8, WhimsicalKnightEngine.computeProgress(example, one), 1e-9)
    }

    @Test
    fun registered() {
        assertTrue(PuzzleEngines.forType(37) === WhimsicalKnightEngine)
    }
}
