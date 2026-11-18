package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class OminoTreeEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/omino-tree/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject): Puzzle = Puzzle(
        id = "p1",
        puzzleType = 38,
        puzzleTypeName = "omino-tree",
        puzzleTypeJpLabel = "オミノツリー",
        difficulty = 1,
        canonRepr = canon,
    )

    private val samples = listOf(
        "rules-example", "board-omino-tree-1", "board-omino-tree-2", "board-omino-tree-3", "board-omino-tree-4",
    )

    private val example = puzzle(json("rules-example.canon.json"))
    private val exampleSolution = json("rules-example.solution.json")

    @Test
    fun registered() {
        assertEquals(OminoTreeEngine, PuzzleEngines.forType(38))
    }

    @Test
    fun everySampleSolutionCompletesAt100() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = OminoTreeEngine.restoreUserValues(p, json("$name.solution.json"))
            assertTrue(name, OminoTreeEngine.isComplete(p, values))
            assertEquals(name, 100.0, OminoTreeEngine.computeProgress(p, values), 1e-9)
            val errs = OminoTreeEngine.liveErrors(OminoTreeEngine.parseBoard(p), values)
            assertTrue(name, errs.numbers.isEmpty() && errs.arrows.isEmpty())
        }
    }

    @Test
    fun extractAndRestoreRoundTrip() {
        val values = OminoTreeEngine.restoreUserValues(example, exampleSolution)
        assertEquals(exampleSolution, OminoTreeEngine.extractAnswer(example, values))
        assertEquals(values, OminoTreeEngine.restoreUserValues(example, OminoTreeEngine.extractAnswer(example, values)))
        assertEquals(1, values["h:0,0"])
        assertNull(values["h:0,1"])
    }

    @Test
    fun undividedBoardScoresZeroAndIsIncomplete() {
        assertEquals(0.0, OminoTreeEngine.computeProgress(example, emptyMap()), 1e-9)
        assertFalse(OminoTreeEngine.isComplete(example, emptyMap()))
        val errs = OminoTreeEngine.liveErrors(OminoTreeEngine.parseBoard(example), emptyMap())
        assertTrue(errs.numbers.isEmpty() && errs.arrows.isEmpty())
    }

    @Test
    fun progressCountsValidBlocksOnly() {
        // Drop the wall between (1,3) and (2,3): the 2x2 and the L merge into a block of 7,
        // which takes the domino feeding the L with it; 7 of 16 cells stay valid.
        val values = OminoTreeEngine.restoreUserValues(example, exampleSolution) - "h:1,3"
        assertEquals(7.0 / 16 * 100, OminoTreeEngine.computeProgress(example, values), 1e-9)
        assertFalse(OminoTreeEngine.isComplete(example, values))
    }

    @Test
    fun danglingWallIsIncomplete() {
        val values = OminoTreeEngine.restoreUserValues(example, exampleSolution) + ("h:0,2" to 1)
        assertFalse(OminoTreeEngine.isComplete(example, values))
    }

    @Test
    fun grows_keepsOrientation() {
        assertTrue(OminoTreeEngine.grows(listOf(0 to 0, 0 to 1), listOf(5 to 5, 5 to 6, 6 to 6)))
        assertFalse(OminoTreeEngine.grows(listOf(0 to 0, 1 to 0), listOf(0 to 0, 0 to 1, 0 to 2)))
        assertFalse(OminoTreeEngine.grows(listOf(0 to 0), listOf(0 to 0, 0 to 1, 0 to 2)))
    }

    @Test
    fun liveErrors_numberTooBigAndArrowBetweenCompleteBlocks() {
        // Close (3,3) alone: its 3 is bigger than its block.
        val small = mapOf("h:2,3" to 1, "v:3,2" to 1)
        assertEquals(setOf("3,3"), OminoTreeEngine.liveErrors(OminoTreeEngine.parseBoard(example), small).numbers)

        // {(0,0)} (1) -> {(0,1),(0,2),(1,2)} (3): both complete, but 3 != 1 + 1.
        val p = puzzle(
            Json.parseToJsonElement(
                """{"rows":2,"cols":3,"numbers":[[1,3,0],[0,0,0]],"arrows":[{"r":0,"c":0,"dir":"right"}]}"""
            ) as JsonObject
        )
        val walls = mapOf("h:0,0" to 1, "h:0,1" to 1, "v:0,0" to 1, "v:1,1" to 1)
        val errs = OminoTreeEngine.liveErrors(OminoTreeEngine.parseBoard(p), walls)
        assertEquals(setOf(0), errs.arrows)
        assertTrue(errs.numbers.isEmpty())
    }

    @Test
    fun noThumbnail() {
        assertNull(OminoTreeEngine.renderThumbnail(example, exampleSolution))
    }
}
