package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.NonogramHinter.Line
import com.puzzleplatform.player.puzzle.NonogramHinter.Placement
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors player/solver/src/plugins/nonogram/techniques.test.ts. */
class NonogramHinterTest {

    private class Canon(val rowClues: List<List<Int>>, val colClues: List<List<Int>>)

    private fun lineClue(line: List<Int>): List<Int> {
        val out = mutableListOf<Int>()
        var run = 0
        for (v in line) {
            if (v == 1) run++ else if (run > 0) { out.add(run); run = 0 }
        }
        if (run > 0) out.add(run)
        return out.ifEmpty { listOf(0) }
    }

    private fun canonFromGrid(grid: List<List<Int>>) =
        Canon(grid.map(::lineClue), grid[0].indices.map { c -> lineClue(grid.map { it[c] }) })

    // docs/nonogram/board-nonogram.json — the 10x10 sample board.
    private val small = Canon(
        listOf(listOf(2, 1, 1, 2), listOf(2, 2), listOf(2, 2, 2), listOf(3, 2, 3), listOf(2, 2), listOf(1, 4, 1),
            listOf(2, 4, 2), listOf(3, 2, 3), listOf(4, 4), listOf(10)),
        listOf(listOf(4, 4), listOf(4, 5), listOf(2, 3), listOf(1, 3, 2), listOf(2, 3, 1), listOf(2, 3, 1),
            listOf(1, 3, 2), listOf(2, 3), listOf(4, 5), listOf(4, 4)),
    )

    // A unique 6x6 that line solving alone can't finish (PROBE in fixtures.ts).
    private val probeGrid = listOf(
        listOf(0, 1, 1, 0, 1, 1),
        listOf(0, 0, 0, 1, 0, 1),
        listOf(1, 0, 0, 1, 0, 0),
        listOf(1, 0, 0, 1, 1, 0),
        listOf(1, 1, 0, 0, 1, 0),
        listOf(0, 1, 0, 1, 1, 1),
    )
    private val probe = canonFromGrid(probeGrid)
    private val probeStalled = mapOf(
        "1,0" to 1, "4,0" to 1, "4,1" to 2, "4,3" to 1, "4,4" to 1, "1,4" to 1, "3,4" to 2, "5,4" to 2, "3,1" to 1,
        "3,2" to 1, "3,5" to 1, "4,5" to 1, "2,2" to 2, "4,2" to 2, "1,1" to 2, "1,2" to 2, "2,1" to 2,
    )

    private fun hint(canon: Canon, values: Map<String, Int> = emptyMap()) =
        NonogramHinter.nextHint(canon.rowClues, canon.colClues, values)

    /** Follow hints from an empty board until none fires. */
    private fun playOut(canon: Canon): Map<String, Int> {
        val cols = canon.colClues.size
        var values = emptyMap<String, Int>()
        repeat(10_000) {
            val step = hint(canon, values) ?: return values
            assertTrue(step.placements.isNotEmpty())
            values = values + step.placements.associate { NonogramHinter.cellKey(it.cell, cols) to it.value }
        }
        return values
    }

    @Test
    fun solveLine_overlapAndContradiction() {
        val u = -1
        assertArrayEquals(intArrayOf(u, u, 1, u, u), NonogramHinter.solveLine(IntArray(5) { u }, intArrayOf(3)))
        assertArrayEquals(intArrayOf(1, 1, 0, 1), NonogramHinter.solveLine(IntArray(4) { u }, intArrayOf(2, 1)))
        assertArrayEquals(intArrayOf(0, 0, 0), NonogramHinter.solveLine(IntArray(3) { u }, intArrayOf()))
        assertNull(NonogramHinter.solveLine(intArrayOf(u, 0, u), intArrayOf(2)))
    }

    @Test
    fun emptyBoard_pointsAtALineThatCanBeFinished() {
        // Row 4 is [3, 2, 3]: 3+1+2+1+3 = 10 cells, exactly one arrangement.
        val step = hint(small)!!
        assertEquals("line-complete", step.technique)
        assertEquals(listOf(Line(true, 3)), step.focusLines)
        assertEquals(listOf(1, 1, 1, 2, 1, 1, 2, 1, 1, 1), step.placements.map { it.value })
    }

    @Test
    fun contradictoryLine_isFlagged() {
        val step = hint(small, mapOf("4,9" to 2))!!
        assertEquals("line-contradiction", step.technique)
        assertEquals(listOf(Line(true, 9)), step.focusLines)
        assertTrue(step.placements.isEmpty())
    }

    @Test
    fun satisfiedLine_crossesOutTheRest() {
        val canon = Canon(listOf(listOf(1)), listOf(listOf(0), listOf(1), listOf(0)))
        val step = hint(canon, mapOf("1,0" to 1))!!
        assertEquals("line-empties", step.technique)
        assertEquals(listOf(Placement(0, 2), Placement(2, 2)), step.placements)
    }

    @Test
    fun stalledLines_fallBackToTwoLines() {
        val step = hint(probe, probeStalled)!!
        assertEquals("two-lines", step.technique)
        assertEquals(2, step.focusLines.size)
        val p = step.placements.single()
        assertEquals(if (probeGrid[p.cell / 6][p.cell % 6] == 1) 1 else 2, p.value)
    }

    @Test
    fun followingHints_solvesTheBoardCorrectly() {
        for (grid in listOf(probeGrid)) {
            val values = playOut(canonFromGrid(grid))
            grid.forEachIndexed { r, row ->
                row.forEachIndexed { c, want -> assertEquals(if (want == 1) 1 else 2, values["$c,$r"]) }
            }
        }
        val values = playOut(small)
        assertEquals(100, values.size)
        assertNull(hint(small, values))
    }

    @Test
    fun ambiguousBoard_hasNoHint_andRevealUsesTheSolution() {
        val multiple = Canon(listOf(listOf(1), listOf(1)), listOf(listOf(1), listOf(1)))
        assertNull(hint(multiple))
        val reveal = NonogramHinter.reveal(
            multiple.rowClues, multiple.colClues, emptyMap(), arrayOf(intArrayOf(1, 0), intArrayOf(0, 1)),
        )
        assertNotNull(reveal)
        assertEquals(listOf(Placement(0, 1)), reveal!!.placements)
        assertNull(NonogramHinter.reveal(multiple.rowClues, multiple.colClues, emptyMap(), null))
    }
}
