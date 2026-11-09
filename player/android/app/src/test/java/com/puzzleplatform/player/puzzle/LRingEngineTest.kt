package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors frontend/src/components/lRingRules.test.ts. */
class LRingEngineTest {

    private fun puzzle(cells: String): Puzzle = Puzzle(
        id = "lr",
        puzzleType = 33,
        puzzleTypeName = "l-ring",
        puzzleTypeJpLabel = "えるりんぐ",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement("""{"cells":$cells}""") as JsonObject,
    )

    /** userValues from h/v grids, keyed like the web board. */
    private fun values(h: List<List<Int>>, v: List<List<Int>>): Map<String, Int> = buildMap {
        h.forEachIndexed { r, row -> row.forEachIndexed { c, x -> if (x == 1) put("h:$r,$c", 1) } }
        v.forEachIndexed { r, row -> row.forEachIndexed { c, x -> if (x == 1) put("v:$r,$c", 1) } }
    }

    // The rule sheet's 4x4 example and its answer.
    private val example = puzzle("[[3,0,4,0],[0,0,0,0],[0,0,0,0],[0,0,0,1]]")
    private val cells = LRingEngine.parseCells(example)
    private val answer = values(
        h = listOf(listOf(1, 1, 0), listOf(0, 0, 1), listOf(0, 1, 0), listOf(1, 0, 1)),
        v = listOf(listOf(1, 0, 1, 0), listOf(1, 0, 0, 1), listOf(1, 1, 1, 1)),
    )

    private fun state(values: Map<String, Int>, r: Int, c: Int) =
        LRingRules.arrowState(cells, MasyuEngine.edges(cells, values), r, c)

    @Test
    fun acceptsTheRuleSheetAnswer() {
        assertTrue(LRingEngine.isComplete(example, answer))
        assertEquals(100.0, LRingEngine.computeProgress(example, answer), 1e-9)
    }

    @Test
    fun emptyBoardIsOpen() {
        assertFalse(LRingEngine.isComplete(example, emptyMap()))
        assertEquals(0.0, LRingEngine.computeProgress(example, emptyMap()), 1e-9)
        assertEquals(LRingRules.ArrowState.OPEN, state(emptyMap(), 0, 0))
    }

    @Test
    fun equalArmsAreBad() {
        // A 3x3 square loop around the corner R1C1: both arms 2.
        val square = values(
            h = listOf(listOf(1, 1, 0), listOf(0, 0, 0), listOf(1, 1, 0), listOf(0, 0, 0)),
            v = listOf(listOf(1, 0, 1, 0), listOf(1, 0, 1, 0), listOf(0, 0, 0, 0)),
        )
        assertEquals(LRingRules.ArrowState.BAD, state(square, 0, 0))
        assertFalse(LRingEngine.isComplete(example, square))
    }

    @Test
    fun straightThroughAnArrowIsBad() {
        val v = mapOf("h:0,1" to 1, "h:0,2" to 1)
        assertEquals(LRingRules.ArrowState.BAD, state(v, 0, 2))
    }

    @Test
    fun armThatHasNotTurnedIsOpen() {
        val v = mapOf("v:0,0" to 1, "v:1,0" to 1, "h:0,0" to 1, "h:0,1" to 1)
        assertEquals(LRingRules.ArrowState.OPEN, state(v, 0, 0))
    }

    @Test
    fun rejectsTwoSeparateLoops() {
        val p = puzzle("[[3,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]]")
        val v = values(
            h = listOf(listOf(1, 0, 0, 1), listOf(0, 0, 0, 1), listOf(1, 0, 0, 0)),
            v = listOf(listOf(1, 1, 0, 1, 1), listOf(1, 1, 0, 0, 0)),
        )
        assertEquals(100.0, LRingEngine.computeProgress(p, v), 1e-9)
        assertFalse(LRingEngine.isComplete(p, v))
    }

    @Test
    fun answerRoundTrips() {
        val json = LRingEngine.extractAnswer(example, answer)
        assertEquals(answer, LRingEngine.restoreUserValues(example, json))
    }
}
