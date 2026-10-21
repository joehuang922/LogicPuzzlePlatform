package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PictoLinkAuthoringTest {

    private fun draft(vararg rows: List<Int>) = PictoLinkDraft(rows.toList())

    private val docDraft = draft(
        listOf(2, 0, 0, 0, 1),
        listOf(2, 0, 0, 0, 0),
        listOf(0, 4, 0, 0, 4),
        listOf(0, 0, 0, 0, 0),
        listOf(0, 0, 0, 0, 0),
    )

    @Test
    fun draftFromCanon_padsRaggedRowsAndRoundTrips() {
        val canon = Json.parseToJsonElement("""{"cells":[[2,0,12],[2]]}""") as JsonObject
        val d = PictoLinkAuthoring.draftFromCanon(canon)
        assertEquals(listOf(listOf(2, 0, 12), listOf(2, 0, 0)), d.cells)
        assertEquals(d, PictoLinkAuthoring.draftFromCanon(PictoLinkAuthoring.canonFromDraft(d)))
    }

    @Test
    fun problems_cleanForTheDocsExample() {
        assertTrue(PictoLinkAuthoring.problems(docDraft).isEmpty())
    }

    @Test
    fun problems_flagsNoCluesAndNoCells() {
        assertEquals(listOf("No cells"), PictoLinkAuthoring.problems(PictoLinkDraft()))
        assertEquals(listOf("No clues"), PictoLinkAuthoring.problems(draft(listOf(0, 0), listOf(0, 0))))
    }

    @Test
    fun problems_flagsAnOddCount() {
        val d = PictoLinkAuthoring.setClue(docDraft, col = 4, row = 4, clue = 4)
        assertTrue(PictoLinkAuthoring.problems(d).any { it.startsWith("4 appears 3 times") })
    }

    @Test
    fun problems_flagsAClueNoPartnerCanReach() {
        // Two 3s side by side: a 3-cell path between adjacent cells is impossible (parity).
        val d = draft(listOf(3, 3, 0), listOf(0, 0, 0))
        val problems = PictoLinkAuthoring.problems(d)
        assertEquals(2, problems.size)
        assertTrue(problems[0].startsWith("R1C1 (3)"))
        // Two 2s three apart are too far for a 2-cell path.
        assertTrue(PictoLinkAuthoring.problems(draft(listOf(2, 0, 0, 2))).isNotEmpty())
        // Ones never need a partner.
        assertTrue(PictoLinkAuthoring.problems(draft(listOf(1, 0, 1))).isEmpty())
    }

    @Test
    fun setClue_andLineEdits() {
        assertEquals(7, PictoLinkAuthoring.setClue(docDraft, 2, 3, 7).cellAt(2, 3))
        assertEquals(0, PictoLinkAuthoring.setClue(docDraft, 0, 0, null).cellAt(0, 0))
        assertEquals(6, PictoLinkAuthoring.addRow(docDraft).rows)
        assertEquals(6, PictoLinkAuthoring.addCol(docDraft).cols)
        assertEquals(listOf(2, 0, 0, 0, 0), PictoLinkAuthoring.removeRow(docDraft, 0).cells[0])
        assertEquals(listOf(0, 0, 0, 1), PictoLinkAuthoring.removeCol(docDraft, 0).cells[0])
        assertEquals(12, PictoLinkAuthoring.parseClue("12"))
    }

    @Test
    fun pictoLinkIsAnAuthoringType() {
        assertEquals(27, AuthoringType.PICTO_LINK.puzzleType)
    }
}
