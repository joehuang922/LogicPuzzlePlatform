package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors frontend/src/components/balanceLinkRules.test.ts. */
class BalanceLinkEngineTest {

    private fun puzzle(cells: String): Puzzle = Puzzle(
        id = "bl",
        puzzleType = 32,
        puzzleTypeName = "balance-link",
        puzzleTypeJpLabel = "バランスリンク",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement("""{"cells":$cells}""") as JsonObject,
    )

    /** userValues from h/v grids, keyed like the web board. */
    private fun values(h: List<List<Int>>, v: List<List<Int>>): Map<String, Int> = buildMap {
        h.forEachIndexed { r, row -> row.forEachIndexed { c, x -> if (x == 1) put("h:$r,$c", 1) } }
        v.forEachIndexed { r, row -> row.forEachIndexed { c, x -> if (x == 1) put("v:$r,$c", 1) } }
    }

    // The rule sheet's 4x4 example and its answer.
    private val example = puzzle("[[0,0,0,60],[11,1,11,0],[0,60,0,0],[41,0,0,41]]")
    private val answer = values(
        h = listOf(listOf(1, 1, 0), listOf(0, 0, 0), listOf(0, 1, 1), listOf(1, 1, 1)),
        v = listOf(listOf(1, 0, 1, 1), listOf(0, 0, 0, 1), listOf(0, 0, 0, 0)),
    )

    @Test
    fun acceptsTheRuleSheetAnswer() {
        assertTrue(BalanceLinkEngine.isComplete(example, answer))
        assertEquals(100.0, BalanceLinkEngine.computeProgress(example, answer), 1e-9)
    }

    @Test
    fun missingSegmentOrSegmentIntoBlackFails() {
        val missing = answer - "h:3,1"
        assertFalse(BalanceLinkEngine.isComplete(example, missing))
        assertEquals(4.0 / 6 * 100, BalanceLinkEngine.computeProgress(example, missing), 1e-9)
        assertFalse(BalanceLinkEngine.isComplete(example, answer + ("h:1,0" to 1)))
    }

    @Test
    fun balanceChecksMirrorSymmetry() {
        fun ok(vararg p: Pair<Int, Int>) = BalanceLinkRules.isBalanced(p.toList())
        assertTrue(ok(0 to 0, 0 to 1, 0 to 2))
        assertTrue(ok(1 to 0, 0 to 0, 0 to 1, 0 to 2, 1 to 2)) // U
        assertTrue(ok(0 to 3, 1 to 3, 2 to 3, 2 to 2, 2 to 1)) // L, diagonal mirror
        assertTrue(ok(0 to 0, 1 to 0, 1 to 1, 0 to 1)) // short U
        assertFalse(ok(0 to 0, 0 to 1, 1 to 1, 1 to 2)) // step
        assertFalse(ok(0 to 0, 1 to 0, 2 to 0, 2 to 1)) // uneven L
        assertFalse(ok(0 to 0, 0 to 1, 1 to 1, 2 to 1, 2 to 2)) // Z
    }

    @Test
    fun matchedButUnbalancedLineFails() {
        val p = puzzle("[[60,0,0],[0,0,0],[0,0,60]]")
        val l = values(h = listOf(listOf(0, 0), listOf(0, 0), listOf(1, 1)), v = listOf(listOf(1, 0, 0), listOf(1, 0, 0)))
        assertTrue(BalanceLinkEngine.isComplete(p, l))
        val z = values(h = listOf(listOf(1, 0), listOf(0, 0), listOf(0, 1)), v = listOf(listOf(0, 1, 0), listOf(0, 1, 0)))
        val line = BalanceLinkRules.traceLines(BalanceLinkEngine.parseCells(p), NumberLinkEngine.edges(BalanceLinkEngine.parseCells(p), z)).single()
        assertTrue(line.matched && !line.balanced)
        assertFalse(BalanceLinkEngine.isComplete(p, z))
    }

    @Test
    fun differentSymbolsAndLoopsFail() {
        assertFalse(BalanceLinkEngine.isComplete(puzzle("[[60,0,61]]"), mapOf("h:0,0" to 1, "h:0,1" to 1)))
        val p = puzzle("[[60,0,0,0],[0,0,0,0],[60,0,0,0]]")
        val withLoop = values(
            h = listOf(listOf(0, 1, 0), listOf(0, 1, 0), listOf(0, 0, 0)),
            v = listOf(listOf(1, 1, 1, 0), listOf(1, 0, 0, 0)),
        )
        assertFalse(BalanceLinkEngine.isComplete(p, withLoop))
    }

    @Test
    fun capacityBlocksBlackAndCapsSymbols() {
        assertEquals(0, BalanceLinkRules.capacity(BalanceLinkRules.BLACK))
        assertEquals(1, BalanceLinkRules.capacity(61))
        assertEquals(2, BalanceLinkRules.capacity(BalanceLinkRules.EMPTY))
    }

    @Test
    fun answerRoundTripsLikeNumberLink() {
        val json = BalanceLinkEngine.extractAnswer(example, answer)
        assertEquals(answer, BalanceLinkEngine.restoreUserValues(example, json))
        assertEquals(BalanceLinkEngine, PuzzleEngines.forType(32))
    }
}
