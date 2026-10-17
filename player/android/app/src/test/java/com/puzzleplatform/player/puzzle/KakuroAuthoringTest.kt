package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.KakuroEngine.Cell
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin kakuro flow: parser canon -> editable draft -> canon
 * round-trips, cell edits, and the misread checks.
 */
class KakuroAuthoringTest {

    private val x = Cell.Clue(null, null)
    private val e = Cell.Empty

    // A clean 3x3: two down sums over two across sums.
    private val small = KakuroDraft(
        listOf(
            listOf(x, Cell.Clue(null, 3), Cell.Clue(null, 4)),
            listOf(Cell.Clue(3, null), e, e),
            listOf(Cell.Clue(4, null), e, e),
        )
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        val canon = KakuroAuthoring.canonFromDraft(small)
        assertEquals(small, KakuroAuthoring.draftFromCanon(canon))
    }

    @Test
    fun parserCanonWithMissingKeysAndRaggedRows() {
        val canon = json(
            """{"cells":[[{"type":"clue"},{"type":"clue","down":3}],[{"type":"clue","right":3},{"type":"empty"},{"type":"empty"}]]}"""
        )
        val draft = KakuroAuthoring.draftFromCanon(canon)
        assertEquals(3, draft.cols)
        assertEquals(listOf(x, Cell.Clue(null, 3), x), draft.cells[0])
    }

    @Test
    fun outOfRangeSumsAreDroppedFromCanon() {
        val bad = KakuroAuthoring.setClue(small, 0, 1, 0, 50)
        val back = KakuroAuthoring.draftFromCanon(KakuroAuthoring.canonFromDraft(bad))
        assertEquals(x, back.cells[1][0])
    }

    @Test
    fun cleanDraftHasNoProblems() {
        assertEquals(emptyList<String>(), KakuroAuthoring.problems(small))
    }

    @Test
    fun toggleAndSetSums() {
        val toggled = KakuroAuthoring.toggleCell(small, 1, 1)
        assertEquals(x, toggled.cells[1][1])
        assertEquals(e, KakuroAuthoring.toggleCell(toggled, 1, 1).cells[1][1])
        // White cells take no sums.
        assertEquals(small, KakuroAuthoring.setClue(small, 1, 1, 5, 5))
        val across = KakuroAuthoring.setAcross(small, 1, 0, 7)
        assertEquals(Cell.Clue(7, 3), across.cells[0][1])
        assertEquals(Cell.Clue(7, null), KakuroAuthoring.setDown(across, 1, 0, null).cells[0][1])
    }

    @Test
    fun parseSum() {
        assertEquals(12, KakuroAuthoring.parseSum("12"))
        assertEquals(12, KakuroAuthoring.parseSum(" 1a2 "))
        assertNull(KakuroAuthoring.parseSum(""))
    }

    @Test
    fun sumBounds() {
        assertEquals(1..9, KakuroAuthoring.sumBounds(1))
        assertEquals(3..17, KakuroAuthoring.sumBounds(2))
        assertEquals(45..45, KakuroAuthoring.sumBounds(9))
        assertNull(KakuroAuthoring.sumBounds(10))
    }

    @Test
    fun flagsSumWithNoCells() {
        val bad = KakuroAuthoring.setAcross(small, 1, 0, 5)
        assertEquals(listOf("R1C2 across sum 5 has no white cells"), KakuroAuthoring.problems(bad))
    }

    @Test
    fun flagsImpossibleSum() {
        val bad = KakuroAuthoring.setAcross(small, 0, 1, 18)
        assertEquals(listOf("R2C1 across sum 18 can't be made with 2 cells (3–17)"), KakuroAuthoring.problems(bad))
    }

    @Test
    fun flagsUncoveredWhiteRun() {
        val bad = KakuroAuthoring.setDown(small, 2, 0, null)
        assertEquals(listOf("White cells from R2C3 have no down sum"), KakuroAuthoring.problems(bad))
    }

    @Test
    fun addAndRemoveLines() {
        val grown = KakuroAuthoring.addCol(KakuroAuthoring.addRow(small))
        assertEquals(4, grown.rows)
        assertEquals(4, grown.cols)
        assertTrue(grown.cells[3].all { it == x } && grown.cells.all { it[3] == x })
        assertEquals(small, KakuroAuthoring.removeCol(KakuroAuthoring.removeRow(grown, 3), 3))
        val one = KakuroDraft(listOf(listOf(e)))
        assertEquals(one, KakuroAuthoring.removeRow(one, 0))
        assertEquals(one, KakuroAuthoring.removeCol(one, 0))
    }

    @Test
    fun kakuroIsAnAuthoringType() {
        assertEquals(12, AuthoringType.KAKURO.puzzleType)
    }
}
