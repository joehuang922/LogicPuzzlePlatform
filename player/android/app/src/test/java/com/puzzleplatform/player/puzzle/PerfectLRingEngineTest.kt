package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors frontend/src/components/perfectLRingRules.test.ts. */
class PerfectLRingEngineTest {

    private fun puzzle(cells: String): Puzzle = Puzzle(
        id = "plr",
        puzzleType = 42,
        puzzleTypeName = "perfect-l-ring",
        puzzleTypeJpLabel = "完全えるりんぐ",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement("""{"cells":$cells}""") as JsonObject,
    )

    /** userValues from h/v grids, keyed like the web board. */
    private fun values(h: List<List<Int>>, v: List<List<Int>>): Map<String, Int> = buildMap {
        h.forEachIndexed { r, row -> row.forEachIndexed { c, x -> if (x == 1) put("h:$r,$c", 1) } }
        v.forEachIndexed { r, row -> row.forEachIndexed { c, x -> if (x == 1) put("v:$r,$c", 1) } }
    }

    /** A board, its unique solution (CP-SAT), and a plain L-Ring loop that breaks the corner rule. */
    private class Board(val name: String, val puzzle: Puzzle, val answer: Map<String, Int>, val plainOnly: Map<String, Int>)

    private val boards = listOf(
        Board(
            "the rule sheet example",
            puzzle("[[2,0,0,0,0],[0,0,3,0,0],[0,0,0,0,0],[1,0,0,0,0],[0,0,0,0,0]]"),
            values(
                h = listOf(listOf(1, 1, 1, 1), listOf(0, 0, 1, 0), listOf(0, 0, 0, 0), listOf(1, 1, 0, 0), listOf(0, 0, 0, 1)),
                v = listOf(listOf(1, 0, 0, 0, 1), listOf(1, 0, 1, 1, 1), listOf(1, 0, 1, 1, 1), listOf(0, 0, 0, 1, 1)),
            ),
            values(
                h = listOf(listOf(1, 1, 1, 1), listOf(0, 0, 1, 0), listOf(0, 0, 0, 1), listOf(1, 1, 0, 0), listOf(0, 0, 0, 0)),
                v = listOf(listOf(1, 0, 0, 0, 1), listOf(1, 0, 1, 1, 1), listOf(1, 0, 1, 0, 0), listOf(0, 0, 0, 0, 0)),
            ),
        ),
        Board(
            "puzzle 1",
            puzzle("[[2,0,0,0,4,0],[0,2,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,0],[2,0,1,0,0,0]]"),
            values(
                h = listOf(listOf(1, 1, 1, 1, 0), listOf(0, 1, 1, 0, 0), listOf(0, 1, 0, 0, 0), listOf(1, 0, 0, 0, 1), listOf(1, 0, 0, 0, 1), listOf(1, 1, 0, 1, 0)),
                v = listOf(listOf(1, 0, 0, 0, 1, 0), listOf(1, 1, 0, 1, 1, 0), listOf(1, 0, 1, 1, 1, 0), listOf(0, 1, 1, 1, 0, 1), listOf(1, 0, 1, 1, 1, 0)),
            ),
            values(
                h = listOf(listOf(1, 1, 1, 1, 0), listOf(0, 1, 1, 0, 0), listOf(0, 1, 0, 0, 0), listOf(1, 0, 0, 1, 0), listOf(1, 0, 0, 0, 0), listOf(1, 1, 0, 0, 0)),
                v = listOf(listOf(1, 0, 0, 0, 1, 0), listOf(1, 1, 0, 1, 1, 0), listOf(1, 0, 1, 1, 1, 0), listOf(0, 1, 1, 0, 0, 0), listOf(1, 0, 1, 0, 0, 0)),
            ),
        ),
        Board(
            "puzzle 2",
            puzzle("[[0,0,0,3,0,0],[2,0,0,0,0,0],[0,0,0,1,0,0],[0,0,0,0,4,0],[0,0,0,0,0,0],[0,2,0,4,0,0]]"),
            values(
                h = listOf(listOf(0, 0, 0, 1, 0), listOf(1, 1, 0, 0, 1), listOf(1, 0, 0, 1, 0), listOf(1, 0, 1, 1, 0), listOf(1, 0, 0, 1, 0), listOf(0, 1, 1, 0, 1)),
                v = listOf(listOf(0, 0, 0, 1, 1, 0), listOf(1, 0, 1, 1, 0, 1), listOf(0, 1, 1, 0, 1, 1), listOf(1, 0, 0, 0, 0, 1), listOf(0, 1, 0, 1, 1, 1)),
            ),
            values(
                h = listOf(listOf(0, 0, 1, 0, 0), listOf(1, 1, 0, 0, 0), listOf(1, 0, 1, 0, 0), listOf(1, 0, 1, 1, 0), listOf(1, 0, 0, 1, 0), listOf(0, 1, 1, 0, 0)),
                v = listOf(listOf(0, 0, 1, 1, 0, 0), listOf(1, 0, 0, 1, 0, 0), listOf(0, 1, 1, 0, 0, 0), listOf(1, 0, 0, 0, 1, 0), listOf(0, 1, 0, 1, 0, 0)),
            ),
        ),
    )

    private fun badCorners(p: Puzzle, v: Map<String, Int>): Int {
        val cells = LRingEngine.parseCells(p)
        val e = MasyuEngine.edges(cells, v)
        return cells.indices.sumOf { r -> cells[r].indices.count { c -> LRingRules.cornerState(cells, e, r, c) == LRingRules.ArrowState.BAD } }
    }

    @Test
    fun acceptsEachSolution() {
        for (b in boards) {
            assertTrue(b.name, PerfectLRingEngine.isComplete(b.puzzle, b.answer))
            assertEquals(b.name, 100.0, PerfectLRingEngine.computeProgress(b.puzzle, b.answer), 1e-9)
            assertEquals(b.name, 0, badCorners(b.puzzle, b.answer))
        }
    }

    @Test
    fun rejectsPlainLRingLoops() {
        for (b in boards) {
            assertTrue(b.name, LRingEngine.isComplete(b.puzzle, b.plainOnly))
            assertFalse(b.name, PerfectLRingEngine.isComplete(b.puzzle, b.plainOnly))
            assertTrue(b.name, badCorners(b.puzzle, b.plainOnly) > 0)
            // Progress counts arrows only, so the plain loop still reads 100%.
            assertEquals(b.name, 100.0, PerfectLRingEngine.computeProgress(b.puzzle, b.plainOnly), 1e-9)
        }
    }

    @Test
    fun cornerIsOpenUntilBothArmsTurn() {
        val p = puzzle("[[0,0,0],[0,0,0],[0,0,0]]")
        val cells = LRingEngine.parseCells(p)
        // An L at (0,0): right arm to (0,2), down arm to (1,0).
        val open = mapOf("h:0,0" to 1, "h:0,1" to 1, "v:0,0" to 1)
        assertEquals(LRingRules.ArrowState.OPEN, LRingRules.cornerState(cells, MasyuEngine.edges(cells, open), 0, 0))
        // Both ends turn: arms 2 and 1 differ by one.
        val bad = open + mapOf("v:0,2" to 1, "h:1,0" to 1)
        assertEquals(LRingRules.ArrowState.BAD, LRingRules.cornerState(cells, MasyuEngine.edges(cells, bad), 0, 0))
        // A straight cell is never judged.
        assertEquals(LRingRules.ArrowState.OPEN, LRingRules.cornerState(cells, MasyuEngine.edges(cells, bad), 0, 1))
    }

    @Test
    fun emptyBoardIsOpen() {
        val p = boards[0].puzzle
        assertFalse(PerfectLRingEngine.isComplete(p, emptyMap()))
        assertEquals(0.0, PerfectLRingEngine.computeProgress(p, emptyMap()), 1e-9)
    }

    @Test
    fun answerRoundTrips() {
        val b = boards[1]
        val json = PerfectLRingEngine.extractAnswer(b.puzzle, b.answer)
        assertEquals(b.answer, PerfectLRingEngine.restoreUserValues(b.puzzle, json))
    }

    @Test
    fun isRegistered() {
        assertEquals(PerfectLRingEngine, PuzzleEngines.forType(42))
    }
}
