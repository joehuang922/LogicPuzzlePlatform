package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DoubleChocoAuthoringTest {

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    private val canon = json("""{"cells":[[[0,2],[1,0]],[[0,0],[1,0]]]}""")

    @Test
    fun canonRoundTrips() {
        val draft = DoubleChocoAuthoring.draftFromCanon(canon)
        assertEquals(2, draft.rows)
        assertEquals(2, draft.cols)
        assertEquals(canon, DoubleChocoAuthoring.canonFromDraft(draft))
        assertTrue(DoubleChocoAuthoring.problems(draft).isEmpty())
    }

    @Test
    fun raggedRowsPadWithWhite() {
        val draft = DoubleChocoAuthoring.draftFromCanon(json("""{"cells":[[[1,0],[1,0]],[[0,0]]]}"""))
        assertEquals(DoubleChocoDraft.WHITE, draft.cellAt(1, 1))
    }

    @Test
    fun colorAndNumberEditsKeepEachOther() {
        var draft = DoubleChocoAuthoring.draftFromCanon(canon)
        draft = DoubleChocoAuthoring.setGray(draft, 0, 0, true)
        assertEquals(DoubleChocoEngine.Cell(gray = true, number = 2), draft.cellAt(0, 0))
        draft = DoubleChocoAuthoring.setNumber(draft, 0, 0, null)
        assertEquals(DoubleChocoEngine.Cell(gray = true, number = 0), draft.cellAt(0, 0))
        assertEquals(null, DoubleChocoAuthoring.parseNumber("0"))
        assertEquals(12, DoubleChocoAuthoring.parseNumber("12"))
    }

    @Test
    fun unbalancedColorsAndOversizedNumbersAreProblems() {
        val draft = DoubleChocoAuthoring.setGray(DoubleChocoAuthoring.draftFromCanon(canon), 0, 1, true)
        // 1 white and 3 gray don't balance, and the 2 is more than the one white cell.
        assertEquals(2, DoubleChocoAuthoring.problems(draft).size)
    }

    @Test
    fun rowAndColumnEdits() {
        var draft = DoubleChocoAuthoring.draftFromCanon(canon)
        draft = DoubleChocoAuthoring.addRow(DoubleChocoAuthoring.addCol(draft))
        assertEquals(3, draft.rows)
        assertEquals(3, draft.cols)
        draft = DoubleChocoAuthoring.removeCol(DoubleChocoAuthoring.removeRow(draft, 2), 2)
        assertEquals(canon, DoubleChocoAuthoring.canonFromDraft(draft))
    }

    @Test
    fun allWhiteIsAProblem() {
        val draft = DoubleChocoDraft(List(2) { List(2) { DoubleChocoDraft.WHITE } })
        assertEquals(listOf("No gray cells"), DoubleChocoAuthoring.problems(draft))
    }
}
