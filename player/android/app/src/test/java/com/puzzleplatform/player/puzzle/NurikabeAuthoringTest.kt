package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin nurikabe flow: parser canon -> editable draft -> canon
 * round-trips, clue and line edits, and the misread checks.
 */
class NurikabeAuthoringTest {

    private val small = NurikabeDraft(
        listOf(
            listOf(2, 0, 0),
            listOf(0, 0, 3),
        )
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        assertEquals(small, NurikabeAuthoring.draftFromCanon(NurikabeAuthoring.canonFromDraft(small)))
    }

    @Test
    fun raggedRowsArePaddedAndNegativesCleared() {
        val draft = NurikabeAuthoring.draftFromCanon(json("""{"cells":[[1,0,-4],[5]]}"""))
        assertEquals(listOf(listOf(1, 0, 0), listOf(5, 0, 0)), draft.cells)
    }

    @Test
    fun setClueAndClear() {
        var d = NurikabeAuthoring.setClue(small, col = 1, row = 0, clue = 12)
        assertEquals(12, d.cellAt(1, 0))
        d = NurikabeAuthoring.setClue(d, col = 1, row = 0, clue = null)
        assertEquals(0, d.cellAt(1, 0))
        assertEquals(small, NurikabeAuthoring.setClue(small, col = 7, row = 0, clue = 1))
        assertEquals(0, NurikabeAuthoring.setClue(small, col = 0, row = 0, clue = 0).cellAt(0, 0))
    }

    @Test
    fun parseClue() {
        assertEquals(12, NurikabeAuthoring.parseClue("1a2"))
        assertNull(NurikabeAuthoring.parseClue(""))
    }

    @Test
    fun addAndRemoveLines() {
        val grown = NurikabeAuthoring.addCol(NurikabeAuthoring.addRow(small))
        assertEquals(3, grown.rows)
        assertEquals(4, grown.cols)
        val shrunk = NurikabeAuthoring.removeCol(NurikabeAuthoring.removeRow(small, 0), 2)
        assertEquals(listOf(listOf(0, 0)), shrunk.cells)
        val one = NurikabeDraft(listOf(listOf(1)))
        assertEquals(one, NurikabeAuthoring.removeRow(one, 0))
        assertEquals(one, NurikabeAuthoring.removeCol(one, 0))
    }

    @Test
    fun problems() {
        assertTrue(NurikabeAuthoring.problems(small).isEmpty())
        assertEquals(listOf("No cells"), NurikabeAuthoring.problems(NurikabeDraft()))
        assertEquals(listOf("No clues"), NurikabeAuthoring.problems(NurikabeDraft(listOf(listOf(0, 0)))))
        assertEquals(
            listOf("Clues add up to 9 but the grid has only 6 cells"),
            NurikabeAuthoring.problems(NurikabeDraft(listOf(listOf(5, 0, 0), listOf(0, 0, 4)))),
        )
        assertEquals(
            listOf("R1C1 and R1C2 clues touch", "R1C2 and R2C2 clues touch"),
            NurikabeAuthoring.problems(NurikabeDraft(listOf(listOf(1, 1, 0), listOf(0, 1, 0)))),
        )
    }
}
