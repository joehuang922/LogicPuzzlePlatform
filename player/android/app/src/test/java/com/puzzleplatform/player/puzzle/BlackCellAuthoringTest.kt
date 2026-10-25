package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.BlackCell.BLACK
import com.puzzleplatform.player.puzzle.BlackCell.WHITE
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin black-cell flow (shakashaka, akari): parser canon -> editable
 * draft -> canon round-trips, black/number and line edits, and the misread checks.
 */
class BlackCellAuthoringTest {

    private val small = BlackCellDraft(
        listOf(
            listOf(1, WHITE, WHITE),
            listOf(WHITE, WHITE, BLACK),
            listOf(WHITE, 2, WHITE),
        )
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        val canon = ShakashakaAuthoring.canonFromDraft(small)
        assertEquals(json("""{"cells":[[1,-1,-1],[-1,-1,5],[-1,2,-1]]}"""), canon)
        assertEquals(small, ShakashakaAuthoring.draftFromCanon(canon))
    }

    @Test
    fun raggedRowsArePaddedAndUnknownValuesCleared() {
        val draft = ShakashakaAuthoring.draftFromCanon(json("""{"cells":[[3,9],[-1]]}"""))
        assertEquals(listOf(listOf(3, WHITE), listOf(WHITE, WHITE)), draft.cells)
    }

    @Test
    fun cellEdits() {
        var d = ShakashakaAuthoring.setBlack(small, col = 1, row = 1, number = null)
        assertEquals(BLACK, d.cellAt(1, 1))
        d = ShakashakaAuthoring.setBlack(d, col = 1, row = 1, number = 0)
        assertEquals(0, d.cellAt(1, 1))
        assertEquals(WHITE, ShakashakaAuthoring.setWhite(d, col = 1, row = 1).cellAt(1, 1))
        // Numbers past 4 and off-grid edits are no-ops.
        assertEquals(small, ShakashakaAuthoring.setBlack(small, col = 0, row = 0, number = 5))
        assertEquals(small, ShakashakaAuthoring.setWhite(small, col = 3, row = 0))
    }

    @Test
    fun addAndRemoveLines() {
        val grown = ShakashakaAuthoring.addCol(ShakashakaAuthoring.addRow(small))
        assertEquals(4, grown.rows)
        assertEquals(4, grown.cols)
        val shrunk = ShakashakaAuthoring.removeCol(ShakashakaAuthoring.removeRow(small, 1), 0)
        assertEquals(listOf(listOf(WHITE, WHITE), listOf(2, WHITE)), shrunk.cells)
        val one = BlackCellDraft(listOf(listOf(BLACK)))
        assertEquals(one, ShakashakaAuthoring.removeRow(one, 0))
        assertEquals(one, ShakashakaAuthoring.removeCol(one, 0))
    }

    @Test
    fun problems() {
        assertTrue(ShakashakaAuthoring.problems(small).isEmpty())
        assertEquals(listOf("No cells"), ShakashakaAuthoring.problems(BlackCellDraft()))
        assertEquals(listOf("No black cells"), ShakashakaAuthoring.problems(BlackCellDraft(listOf(listOf(WHITE)))))
        // A corner has two neighbours; a black neighbour takes one away.
        assertEquals(
            listOf("R1C1 says 3 but has 2 white cells around it"),
            ShakashakaAuthoring.problems(ShakashakaAuthoring.setBlack(small, 0, 0, 3)),
        )
        assertEquals(
            listOf("R2C1 says 4 but has 2 white cells around it"),
            ShakashakaAuthoring.problems(ShakashakaAuthoring.setBlack(small, 0, 1, 4)),
        )
    }

    @Test
    fun akariSharesTheRulesUnderItsOwnType() {
        val canon = AkariAuthoring.canonFromDraft(small)
        assertEquals(small, AkariAuthoring.draftFromCanon(canon))
        assertEquals(AkariAuthoring.PUZZLE_TYPE, AkariAuthoring.previewPuzzle(small).puzzleType)
        assertEquals("admin-akari-draft-3x3", AkariAuthoring.previewPuzzle(small).id)
        assertEquals(
            listOf("R1C1 says 4 but has 2 white cells around it"),
            AkariAuthoring.problems(AkariAuthoring.setBlack(small, 0, 0, 4)),
        )
    }
}
