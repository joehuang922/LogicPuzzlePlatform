package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors frontend/src/components/sinkaminoRules.test.ts. */
class SinkaminoEngineTest {

    private fun puzzle(canon: String): Puzzle = Puzzle(
        id = "sk",
        puzzleType = 31,
        puzzleTypeName = "sinkamino",
        puzzleTypeJpLabel = "シンカミノ",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canon) as JsonObject,
    )

    /** userValues from a states grid (row-major), keyed "col,row". */
    private fun values(states: List<List<Int>>): Map<String, Int> = buildMap {
        states.forEachIndexed { r, row -> row.forEachIndexed { c, v -> if (v != 0) put("$c,$r", v) } }
    }

    // The doc's 3x5 example: islands {(0,0)} -> {(0,2),(1,2)} -> {(0,4),(1,4),(2,4)}.
    private val example = puzzle(
        """{"cells":[[2,0,0,0,0],[0,1,0,0,0],[0,0,0,0,2]],"arrows":[[[0,0],[0,1],[0,2],[0,3],[0,4]]]}"""
    )
    private val answer = listOf(
        listOf(0, 0, 1, 0, 1),
        listOf(0, 0, 1, 0, 1),
        listOf(0, 0, 0, 0, 0),
    )

    @Test
    fun acceptsTheExampleAnswerWithMarksAsEmpty() {
        assertTrue(SinkaminoEngine.isComplete(example, values(answer)))
        val marked = answer.map { row -> row.map { if (it == 0) 2 else it } }
        assertTrue(SinkaminoEngine.isComplete(example, values(marked)))
    }

    @Test
    fun rejectsEverySingleCellChange() {
        val grid = SinkaminoEngine.parse(example)
        for (r in 0 until 3) for (c in 0 until 5) {
            if (grid.cellAt(r, c) != SinkaminoRules.WHITE) continue
            val flipped = answer.mapIndexed { rr, row -> row.mapIndexed { cc, v -> if (rr == r && cc == c) 1 - v else v } }
            assertFalse("flip R${r + 1}C${c + 1}", SinkaminoEngine.isComplete(example, values(flipped)))
        }
    }

    @Test
    fun evolvesFromKeepsOrientation() {
        val vDomino = listOf(0 to 0, 1 to 0)
        assertTrue(SinkaminoRules.evolvesFrom(vDomino, listOf(5 to 5, 6 to 5, 7 to 5)))
        assertTrue(SinkaminoRules.evolvesFrom(vDomino, listOf(5 to 5, 6 to 5, 6 to 6)))
        // Rotated: vertical domino -> horizontal tromino.
        assertFalse(SinkaminoRules.evolvesFrom(vDomino, listOf(0 to 0, 0 to 1, 0 to 2)))
        // Mirrored L plus one.
        assertFalse(SinkaminoRules.evolvesFrom(listOf(0 to 0, 1 to 0, 1 to 1), listOf(0 to 1, 1 to 1, 1 to 0, 2 to 0)))
        // Size jump of 2.
        assertFalse(SinkaminoRules.evolvesFrom(listOf(0 to 0), listOf(0 to 0, 0 to 1, 0 to 2)))
    }

    @Test
    fun rejectsAnIslandCrossedTwice() {
        val p = puzzle("""{"cells":[[2,0,0,0,0]],"arrows":[[[0,0],[0,1],[0,2],[0,3],[0,4]]]}""")
        assertFalse(SinkaminoEngine.isComplete(p, values(listOf(listOf(0, 0, 1, 1, 0)))))
    }

    @Test
    fun lockedCellsTakeNoInputAndAnswerRoundTrips() {
        assertNull(SinkaminoEngine.shadeGroup(example, 0, 0)) // given square
        assertNull(SinkaminoEngine.shadeGroup(example, 1, 1)) // black
        val json = SinkaminoEngine.extractAnswer(example, values(answer) + mapOf("0,0" to 1))
        assertEquals(values(answer), SinkaminoEngine.restoreUserValues(example, json))
        // 12 white cells (15 less 1 black and 2 givens), 4 squares placed.
        assertEquals(4.0 / 12 * 100, SinkaminoEngine.computeProgress(example, values(answer)), 1e-9)
        assertEquals(SinkaminoEngine, PuzzleEngines.forType(31))
    }

    @Test
    fun formatProblemsListBrokenTrails() {
        val grid = SinkaminoRules.parse(
            Json.parseToJsonElement(
                """{"cells":[[0,1,0],[0,0,0]],"arrows":[[[0,0]],[[0,0],[0,1]],[[1,0],[1,2]],[[1,2],[2,2]]]}"""
            ) as JsonObject
        )
        assertEquals(
            listOf(
                "Arrow 1 is shorter than 2 cells",
                "Arrow 2 crosses the black cell R1C2",
                "Arrow 3 jumps from R2C1 to R2C3",
                "Arrow 4 leaves the grid at R3C3",
            ),
            SinkaminoRules.formatProblems(grid),
        )
    }
}
