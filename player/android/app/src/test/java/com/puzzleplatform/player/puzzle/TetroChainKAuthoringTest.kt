package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class TetroChainKAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/tetro-chain-k/$name.canon.json").readText()) as JsonObject

    private val example = TetroChainKAuthoring.draftFromCanon(sample("board-tetro-chain-k-example"))

    @Test
    fun samplesRoundTripThroughTheDraft() {
        for ((name, size) in listOf("board-tetro-chain-k-example" to 5, "board-tetro-chain-k-1" to 6,
            "board-tetro-chain-k-2" to 8, "board-tetro-chain-k-3" to 8, "board-tetro-chain-k-4" to 8)) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.TETRO_CHAIN_K, canon)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.TETRO_CHAIN_K))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.TETRO_CHAIN_K))
        }
    }

    @Test
    fun circlesCycleWhiteGrayBlack() {
        fun color(d: KuralinDraft) = d.circleAt(4, 4)?.color
        var d = TetroChainKAuthoring.cycleCircle(example, 4, 4)
        assertEquals(KuralinEngine.WHITE_CIRCLE, color(d))
        d = TetroChainKAuthoring.cycleCircle(d, 4, 4)
        assertEquals(KuralinEngine.GRAY_CIRCLE, color(d))
        d = TetroChainKAuthoring.cycleCircle(d, 4, 4)
        assertEquals(KuralinEngine.BLACK_CIRCLE, color(d))
        assertEquals(example, TetroChainKAuthoring.cycleCircle(d, 4, 4))
        assertEquals(example, TetroChainKAuthoring.cycleCircle(example, 3, 3)) // a cell centre
    }

    @Test
    fun rowsAndColumns() {
        val taller = TetroChainKAuthoring.addRow(example, top = true)
        assertEquals(6, taller.rows)
        assertEquals(example.circles.map { it.dr + 2 }, taller.circles.map { it.dr })
        assertEquals(example, TetroChainKAuthoring.removeEdgeRow(taller, top = true))
    }

    @Test
    fun problems() {
        assertEquals(listOf("No circles"), TetroChainKAuthoring.problems(KuralinDraft(3, 3, emptyList())))
        val twice = example.copy(circles = example.circles + example.circles[0])
        assertEquals(listOf("Two circles at (2,4)"), TetroChainKAuthoring.formatProblems(twice))
    }
}
