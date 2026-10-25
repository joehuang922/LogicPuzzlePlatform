package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.MasyuEngine.BLACK
import com.puzzleplatform.player.puzzle.MasyuEngine.EMPTY
import com.puzzleplatform.player.puzzle.MasyuEngine.WHITE
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin masyu flow: parser canon -> editable draft -> canon
 * round-trips, circle and line edits, and the misread checks.
 */
class MasyuAuthoringTest {

    private val small = MasyuDraft(
        listOf(
            listOf(EMPTY, WHITE, EMPTY, EMPTY),
            listOf(EMPTY, EMPTY, EMPTY, EMPTY),
            listOf(BLACK, EMPTY, EMPTY, EMPTY),
        )
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        val canon = MasyuAuthoring.canonFromDraft(small)
        assertEquals(json("""{"cells":[[0,1,0,0],[0,0,0,0],[2,0,0,0]]}"""), canon)
        assertEquals(small, MasyuAuthoring.draftFromCanon(canon))
    }

    @Test
    fun raggedRowsArePaddedAndUnknownValuesCleared() {
        val draft = MasyuAuthoring.draftFromCanon(json("""{"cells":[[2,7],[1]]}"""))
        assertEquals(listOf(listOf(BLACK, EMPTY), listOf(WHITE, EMPTY)), draft.cells)
    }

    @Test
    fun circleEdits() {
        val d = MasyuAuthoring.setCell(small, col = 2, row = 1, kind = BLACK)
        assertEquals(BLACK, d.cellAt(2, 1))
        assertEquals(EMPTY, MasyuAuthoring.setCell(d, col = 2, row = 1, kind = EMPTY).cellAt(2, 1))
        // Off-grid edits and unknown kinds are no-ops.
        assertEquals(small, MasyuAuthoring.setCell(small, col = 9, row = 0, kind = WHITE))
        assertEquals(small, MasyuAuthoring.setCell(small, col = 0, row = 0, kind = 3))
    }

    @Test
    fun addAndRemoveLines() {
        val grown = MasyuAuthoring.addCol(MasyuAuthoring.addRow(small))
        assertEquals(4, grown.rows)
        assertEquals(5, grown.cols)
        val shrunk = MasyuAuthoring.removeCol(MasyuAuthoring.removeRow(small, 1), 0)
        assertEquals(listOf(listOf(WHITE, EMPTY, EMPTY), listOf(EMPTY, EMPTY, EMPTY)), shrunk.cells)
        val one = MasyuDraft(listOf(listOf(WHITE)))
        assertEquals(one, MasyuAuthoring.removeRow(one, 0))
        assertEquals(one, MasyuAuthoring.removeCol(one, 0))
    }

    @Test
    fun problems() {
        assertTrue(MasyuAuthoring.problems(small).isEmpty())
        assertEquals(listOf("No cells"), MasyuAuthoring.problems(MasyuDraft()))
        assertEquals(listOf("No circles"), MasyuAuthoring.problems(MasyuDraft(listOf(listOf(EMPTY, EMPTY)))))
        // A white circle in a corner can't be passed straight through; on an edge it can.
        assertEquals(
            listOf("R3C4 ○ can't be passed straight through"),
            MasyuAuthoring.problems(MasyuAuthoring.setCell(small, col = 3, row = 2, kind = WHITE)),
        )
        // A black circle needs two cells straight one way along its row and its column.
        val narrow = MasyuDraft(listOf(listOf(EMPTY, BLACK, EMPTY), listOf(EMPTY, EMPTY, EMPTY), listOf(EMPTY, EMPTY, EMPTY)))
        assertEquals(listOf("R1C2 ● has no room to go two cells left or right"), MasyuAuthoring.problems(narrow))
        val flat = MasyuDraft(listOf(listOf(BLACK, EMPTY, EMPTY), listOf(EMPTY, EMPTY, EMPTY)))
        assertEquals(listOf("R1C1 ● has no room to go two cells up or down"), MasyuAuthoring.problems(flat))
    }
}
