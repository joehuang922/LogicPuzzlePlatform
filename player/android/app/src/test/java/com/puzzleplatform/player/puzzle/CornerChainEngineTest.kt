package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors frontend/src/components/CornerChainBoard.test.ts. */
class CornerChainEngineTest {

    private fun puzzle(cells: List<List<Int>>): Puzzle = Puzzle(
        id = "cc",
        puzzleType = 30,
        puzzleTypeName = "corner-chain",
        puzzleTypeJpLabel = "隅角チェーン",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement("""{"cells":$cells}""") as JsonObject,
    )

    /** userValues from a states grid (row-major), keyed "col,row". */
    private fun values(states: List<List<Int>>): Map<String, Int> = buildMap {
        states.forEachIndexed { r, row -> row.forEachIndexed { c, v -> if (v != 0) put("$c,$r", v) } }
    }

    // The rule sheet's 5x5 example and its published answer (1 = black).
    private val example = puzzle(
        listOf(
            listOf(3, 0, 0, 4, 4),
            listOf(0, 0, 0, 0, 0),
            listOf(2, 0, 0, 0, 0),
            listOf(0, 0, 0, 0, 5),
            listOf(0, 0, 0, 0, 5),
        )
    )
    private val answer = listOf(
        listOf(0, 0, 1, 0, 0),
        listOf(1, 0, 1, 0, 0),
        listOf(0, 1, 0, 1, 1),
        listOf(0, 1, 0, 0, 0),
        listOf(1, 1, 1, 1, 0),
    )

    @Test
    fun acceptsThePublishedAnswer() {
        assertTrue(CornerChainEngine.isComplete(example, values(answer)))
    }

    @Test
    fun marksCountAsWhite() {
        val marked = answer.map { row -> row.map { if (it == 0) 2 else it } }
        assertTrue(CornerChainEngine.isComplete(example, values(marked)))
    }

    @Test
    fun rejectsEverySingleCellChange() {
        for (r in 0 until 5) for (c in 0 until 5) {
            if (NurikabeEngine.isClue(NurikabeEngine.parseCells(example), r, c)) continue
            val flipped = answer.mapIndexed { rr, row -> row.mapIndexed { cc, v -> if (rr == r && cc == c) 1 - v else v } }
            assertFalse("flip R${r + 1}C${c + 1}", CornerChainEngine.isComplete(example, values(flipped)))
        }
    }

    @Test
    fun rejectsOddRectangleAndEvenNonRectangle() {
        val bar = puzzle(listOf(listOf(0, 0, 0), listOf(3, 0, 0), listOf(0, 0, 0)))
        assertFalse(CornerChainEngine.isComplete(bar, values(listOf(listOf(1, 1, 1), listOf(0, 0, 0), listOf(1, 1, 1)))))
        val ell = puzzle(listOf(listOf(4, 0, 0), listOf(0, 0, 0), listOf(0, 0, 0)))
        assertFalse(CornerChainEngine.isComplete(ell, values(listOf(listOf(0, 1, 1), listOf(0, 1, 1), listOf(0, 0, 1)))))
    }

    @Test
    fun islandsMustLinkAtCorners() {
        val apart = puzzle(listOf(listOf(2, 0, 0, 2, 0), listOf(0, 0, 0, 0, 0)))
        assertFalse(CornerChainEngine.isComplete(apart, values(listOf(listOf(0, 0, 1, 0, 0), listOf(1, 1, 1, 1, 1)))))
        val linked = puzzle(listOf(listOf(2, 0, 0, 0, 0), listOf(0, 0, 2, 0, 0)))
        assertTrue(CornerChainEngine.isComplete(linked, values(listOf(listOf(0, 0, 1, 1, 1), listOf(1, 1, 0, 0, 1)))))
    }

    @Test
    fun cluesTakeNoInputAndAnswerIsNurikabeShaped() {
        assertNull(CornerChainEngine.shadeGroup(example, 0, 0))
        val answerJson = CornerChainEngine.extractAnswer(example, values(answer))
        assertEquals(values(answer), CornerChainEngine.restoreUserValues(example, answerJson))
        assertEquals(PuzzleEngines.forType(30), CornerChainEngine)
    }
}
