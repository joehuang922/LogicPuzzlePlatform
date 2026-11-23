package com.puzzleplatform.player.puzzle

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class MannequinGate2AuthoringTest {

    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/mannequin-gate-2/$name.canon.json").readText()) as JsonObject

    private val sizes = mapOf(1 to 4, 2 to 4, 3 to 8, 4 to 6)

    @Test
    fun samplesRoundTripThroughBoardDraftWithNoProblems() {
        for ((i, size) in sizes) {
            val name = "mannequin-gate-2-board-$i"
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.MANNEQUIN_GATE_2, canon)
            assertEquals(name, BoardDraft(mannequinGate2 = board.mannequinGate2), board)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.MANNEQUIN_GATE_2))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.MANNEQUIN_GATE_2))
            assertEquals(name, emptyList<String>(), board.formatProblems(AuthoringType.MANNEQUIN_GATE_2))
        }
    }

    @Test
    fun previewPuzzleIsTypeFortyThree() {
        val p = MannequinGate2Authoring.previewPuzzle(MannequinGate2Authoring.draftFromCanon(sample("mannequin-gate-2-board-1")))
        assertEquals(43, p.puzzleType)
        assertEquals("mannequin-gate-2", p.puzzleTypeName)
    }

    @Test
    fun drawAndDeleteLines() {
        var d = MannequinGate2Rules.Board(3, 3, emptyList())
        assertEquals(listOf("No lines"), MannequinGate2Authoring.problems(d))
        d = MannequinGate2Authoring.addLine(d, listOf(0 to 0))
        assertEquals(0, d.lines.size)
        d = MannequinGate2Authoring.addLine(d, listOf(0 to 0, 1 to 1, 1 to 2))
        d = MannequinGate2Authoring.addLine(d, listOf(1 to 1, 2 to 1))
        assertEquals(emptyList<String>(), MannequinGate2Authoring.problems(d))
        // The latest line through R2C2 goes first.
        d = MannequinGate2Authoring.removeLineAt(d, 1, 1)
        assertEquals(listOf(listOf(0 to 0, 1 to 1, 1 to 2)), d.lines)
        assertEquals(d, MannequinGate2Authoring.removeLineAt(d, 2, 2))
    }

    @Test
    fun resizingDropsLinesThatNoLongerFit() {
        var d = MannequinGate2Rules.Board(3, 3, listOf(listOf(0 to 0, 0 to 1), listOf(2 to 2, 1 to 2)))
        d = MannequinGate2Authoring.removeLastRow(d)
        assertEquals(2 to 3, d.rows to d.cols)
        assertEquals(listOf(listOf(0 to 0, 0 to 1)), d.lines)
        d = MannequinGate2Authoring.addCol(MannequinGate2Authoring.addRow(d))
        assertEquals(3 to 4, d.rows to d.cols)
    }

    @Test
    fun formatProblemsMatchTheWeb() {
        val d = MannequinGate2Rules.Board(
            3, 3,
            listOf(
                listOf(0 to 0),
                listOf(0 to 0, 2 to 2),
                listOf(0 to 0, 0 to 1, 0 to 0),
                listOf(1 to 0, 1 to 1),
                listOf(1 to 1, 1 to 0),
                listOf(2 to 2, 3 to 2),
            ),
        )
        assertEquals(
            listOf(
                "Line 1 has fewer than 2 cells",
                "Line 2: R1C1 and R3C3 aren't neighbours",
                "Line 3 visits R1C1 twice",
                "Lines 4 and 5 share the step R2C2–R2C1",
                "Line 6: R4C3 is off the board",
            ),
            MannequinGate2Authoring.formatProblems(d),
        )
    }

    @Test
    fun authoringTypeMapsToFortyThree() {
        assertEquals(AuthoringType.MANNEQUIN_GATE_2, AuthoringType.forPuzzleType(43))
    }
}
