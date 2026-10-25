package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.SlalomCell.EMPTY
import com.puzzleplatform.player.puzzle.SlalomCell.GATE_H
import com.puzzleplatform.player.puzzle.SlalomCell.GATE_V
import com.puzzleplatform.player.puzzle.SlalomCell.WALL
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin slalom flow: parser canon -> editable draft -> canon
 * round-trips, gate runs, cell/number/start edits, and the misread and format checks.
 */
class SlalomAuthoringTest {

    // Row 0: a horizontal gate over C2-C3 capped by a wall at C1; a vertical gate down C5.
    private val canon = json(
        """{"cells":[[0,1,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,1]],
            "start":{"row":2,"col":0},"gateCount":2,
            "gates":[{"orientation":"h","line":0,"from":2,"to":3,"number":1},
                     {"orientation":"v","line":4,"from":1,"to":2,"number":null}]}"""
    )

    private val draft = SlalomDraft(
        cells = listOf(
            listOf(EMPTY, WALL, GATE_H, GATE_H, EMPTY, EMPTY),
            listOf(EMPTY, EMPTY, EMPTY, EMPTY, GATE_V, EMPTY),
            listOf(EMPTY, EMPTY, EMPTY, EMPTY, GATE_V, WALL),
        ),
        numbers = mapOf((0 to 2) to 1, (0 to 3) to 1),
        start = 2 to 0,
        gateCount = 2,
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        assertEquals(draft, SlalomAuthoring.draftFromCanon(canon))
        assertEquals(canon, SlalomAuthoring.canonFromDraft(draft))
    }

    @Test
    fun gateCellsOnWallsOrOffTheGridAreDropped() {
        val d = SlalomAuthoring.draftFromCanon(
            json(
                """{"cells":[[1,0,0]],"start":{"row":0,"col":1},"gateCount":1,
                    "gates":[{"orientation":"h","line":0,"from":0,"to":5,"number":null}]}"""
            )
        )
        assertEquals(listOf(listOf(WALL, GATE_H, GATE_H)), d.cells)
        assertNull(SlalomAuthoring.draftFromCanon(json("""{"cells":[[0]],"gates":[]}""")).start)
    }

    @Test
    fun gatesAreRunsOfLikeCells() {
        val gates = SlalomAuthoring.gates(draft)
        assertEquals(
            listOf(
                SlalomDraftGate(vertical = false, line = 0, from = 2, to = 3, numbers = listOf(1)),
                SlalomDraftGate(vertical = true, line = 4, from = 1, to = 2, numbers = emptyList()),
            ),
            gates,
        )
        assertEquals("R1C3–R1C4", gates[0].label)
        assertEquals(gates[1], SlalomAuthoring.gateAt(draft, col = 4, row = 2))
        assertNull(SlalomAuthoring.gateAt(draft, col = 0, row = 0))
        // Clearing the middle of a run splits it; both halves keep the number.
        val split = SlalomAuthoring.setCell(SlalomAuthoring.setCell(draft, 4, 0, GATE_H), 3, 0, EMPTY)
        assertEquals(listOf(listOf(1), emptyList<Int>()), SlalomAuthoring.gates(split).filter { !it.vertical }.map { it.numbers })
    }

    @Test
    fun numberEditsCoverTheWholeGate() {
        val d = SlalomAuthoring.setGateNumber(draft, col = 4, row = 1, number = 2)
        assertEquals(listOf(2), SlalomAuthoring.gateAt(d, 4, 2)?.numbers)
        val cleared = SlalomAuthoring.setGateNumber(draft, col = 3, row = 0, number = null)
        assertEquals(emptyList<Int>(), SlalomAuthoring.gateAt(cleared, 2, 0)?.numbers)
        // Off a gate, or a number below 1: no-op.
        assertEquals(draft, SlalomAuthoring.setGateNumber(draft, col = 0, row = 0, number = 1))
        assertEquals(draft, SlalomAuthoring.setGateNumber(draft, col = 2, row = 0, number = 0))
        // A cell that stops being a gate loses its number.
        assertEquals(mapOf((0 to 3) to 1), SlalomAuthoring.setCell(draft, 2, 0, WALL).numbers)
    }

    @Test
    fun removingLinesShiftsNumbersAndStart() {
        val noTop = SlalomAuthoring.removeRow(draft, 0)
        assertEquals(2, noTop.rows)
        assertEquals(emptyMap<Pair<Int, Int>, Int>(), noTop.numbers)
        assertEquals(1 to 0, noTop.start)
        val noFirstCol = SlalomAuthoring.removeCol(draft, 0)
        assertNull(noFirstCol.start)
        assertEquals(mapOf((0 to 1) to 1, (0 to 2) to 1), noFirstCol.numbers)
        val grown = SlalomAuthoring.addCol(SlalomAuthoring.addRow(draft))
        assertEquals(4, grown.rows)
        assertEquals(7, grown.cols)
    }

    @Test
    fun problems() {
        assertTrue(SlalomAuthoring.problems(draft).isEmpty())
        assertEquals(listOf("No cells"), SlalomAuthoring.problems(SlalomDraft()))
        assertEquals(
            listOf("Start circle says 3 but there are 2 gates"),
            SlalomAuthoring.problems(SlalomAuthoring.setGateCount(draft, 3)),
        )
        assertEquals(
            listOf("Start R1C2 is on a wall"),
            SlalomAuthoring.problems(SlalomAuthoring.setStart(draft, col = 1, row = 0)),
        )
        assertEquals(
            listOf("No start circle"),
            SlalomAuthoring.problems(draft.copy(start = null)),
        )
        // The vertical gate has a wall at neither end, so its number has nowhere to show.
        assertEquals(
            listOf(
                "Gate R2C5–R3C5 is number 3, past the 2 in the start circle",
                "Gate R2C5–R3C5 is numbered but has no wall at either end to show it",
            ),
            SlalomAuthoring.problems(SlalomAuthoring.setGateNumber(draft, 4, 1, 3)),
        )
    }

    @Test
    fun aGateWithTwoNumbersIsAFormatProblem() {
        // Two numbered gates on one row, drawn into one run.
        val joined = draft.copy(
            cells = listOf(listOf(EMPTY, WALL, GATE_H, GATE_H, GATE_H, GATE_H)) + draft.cells.drop(1),
            numbers = draft.numbers + ((0 to 5) to 2),
        )
        val expected = listOf("Gate R1C3–R1C6 has two numbers (1, 2): keep one")
        assertEquals(expected, SlalomAuthoring.formatProblems(joined))
        assertEquals(expected, SlalomAuthoring.problems(joined).take(1))
        assertTrue(SlalomAuthoring.formatProblems(draft).isEmpty())
    }
}
