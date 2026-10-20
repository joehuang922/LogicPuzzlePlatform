package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin slitherlink flow: parser canon -> editable draft -> canon
 * round-trips, clue and line edits, and the misread checks.
 */
class SlitherlinkAuthoringTest {

    private val b = SlitherlinkAuthoring.BLANK

    private val small = SlitherlinkDraft(
        listOf(
            listOf(3, b, 2),
            listOf(b, 0, b),
        )
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        val canon = SlitherlinkAuthoring.canonFromDraft(small)
        assertEquals(small, SlitherlinkAuthoring.draftFromCanon(canon))
    }

    @Test
    fun raggedParserRowsArePaddedWithBlanks() {
        val draft = SlitherlinkAuthoring.draftFromCanon(json("""{"cells":[[1,2,3],[0]]}"""))
        assertEquals(listOf(listOf(1, 2, 3), listOf(0, b, b)), draft.cells)
    }

    @Test
    fun outOfRangeClueIsFlaggedAndSentAsBlank() {
        val draft = SlitherlinkAuthoring.draftFromCanon(json("""{"cells":[[7,1]]}"""))
        assertEquals(listOf("R1C1 clue 7 is out of range (0–3)"), SlitherlinkAuthoring.problems(draft))
        assertEquals(
            json("""{"cells":[[-1,1]]}"""),
            SlitherlinkAuthoring.canonFromDraft(draft),
        )
    }

    @Test
    fun setClueAndClear() {
        var d = SlitherlinkAuthoring.setClue(small, col = 1, row = 0, clue = 1)
        assertEquals(1, d.cellAt(1, 0))
        d = SlitherlinkAuthoring.setClue(d, col = 1, row = 0, clue = null)
        assertEquals(b, d.cellAt(1, 0))
        // Off-grid is a no-op; an out-of-range digit clears.
        assertEquals(small, SlitherlinkAuthoring.setClue(small, col = 9, row = 9, clue = 1))
        assertEquals(b, SlitherlinkAuthoring.setClue(small, col = 0, row = 0, clue = 5).cellAt(0, 0))
    }

    @Test
    fun addAndRemoveLines() {
        val grown = SlitherlinkAuthoring.addCol(SlitherlinkAuthoring.addRow(small))
        assertEquals(3, grown.rows)
        assertEquals(4, grown.cols)
        assertEquals(listOf(b, b, b, b), grown.cells.last())

        val shrunk = SlitherlinkAuthoring.removeCol(SlitherlinkAuthoring.removeRow(small, 0), 1)
        assertEquals(listOf(listOf(b, b)), shrunk.cells)

        // Never drops the last line.
        val one = SlitherlinkDraft(listOf(listOf(1)))
        assertEquals(one, SlitherlinkAuthoring.removeRow(one, 0))
        assertEquals(one, SlitherlinkAuthoring.removeCol(one, 0))
    }

    @Test
    fun problems() {
        assertTrue(SlitherlinkAuthoring.problems(small).isEmpty())
        assertEquals(listOf("No cells"), SlitherlinkAuthoring.problems(SlitherlinkDraft()))
        assertEquals(
            listOf("No clues"),
            SlitherlinkAuthoring.problems(SlitherlinkDraft(listOf(listOf(b, b)))),
        )
    }
}
