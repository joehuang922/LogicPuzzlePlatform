package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin number-clue flow (number link, shikaku, fillomino): parser canon ->
 * editable draft -> canon round-trips, clue and line edits, and each type's checks.
 */
class ClueGridAuthoringTest {

    private val small = ClueGridDraft(
        listOf(
            listOf(1, 0, 2),
            listOf(0, 0, 0),
            listOf(2, 0, 1),
        )
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        val canon = NumberLinkAuthoring.canonFromDraft(small)
        assertEquals(json("""{"cells":[[1,0,2],[0,0,0],[2,0,1]]}"""), canon)
        assertEquals(small, NumberLinkAuthoring.draftFromCanon(canon))
        assertEquals("admin-shikaku-draft-3x3", ShikakuAuthoring.previewPuzzle(small).id)
    }

    @Test
    fun raggedRowsArePaddedAndNegativesCleared() {
        val draft = ShikakuAuthoring.draftFromCanon(json("""{"cells":[[4,-2],[1]]}"""))
        assertEquals(listOf(listOf(4, 0), listOf(1, 0)), draft.cells)
    }

    @Test
    fun clueAndLineEdits() {
        assertEquals(7, NumberLinkAuthoring.setClue(small, col = 1, row = 1, clue = 7).cellAt(1, 1))
        assertEquals(0, NumberLinkAuthoring.setClue(small, col = 0, row = 0, clue = null).cellAt(0, 0))
        assertEquals(0, NumberLinkAuthoring.setClue(small, col = 0, row = 0, clue = 0).cellAt(0, 0))
        assertEquals(small, NumberLinkAuthoring.setClue(small, col = 3, row = 0, clue = 1))
        val grown = ShikakuAuthoring.addCol(ShikakuAuthoring.addRow(small))
        assertEquals(4 to 4, grown.rows to grown.cols)
        assertEquals(
            listOf(listOf(1, 2), listOf(2, 1)),
            ShikakuAuthoring.removeCol(ShikakuAuthoring.removeRow(small, 1), 1).cells,
        )
        val one = ClueGridDraft(listOf(listOf(1)))
        assertEquals(one, ShikakuAuthoring.removeRow(one, 0))
    }

    @Test
    fun commonProblems() {
        assertEquals(listOf("No cells"), NumberLinkAuthoring.problems(ClueGridDraft()))
        assertEquals(listOf("No clues"), ShikakuAuthoring.problems(ClueGridDraft(listOf(listOf(0, 0)))))
    }

    @Test
    fun numberLinkNeedsEveryNumberExactlyTwice() {
        assertTrue(NumberLinkAuthoring.problems(small).isEmpty())
        val bad = NumberLinkAuthoring.setClue(NumberLinkAuthoring.setClue(small, 2, 2, 2), 1, 1, 3)
        assertEquals(
            listOf(
                "1 appears once (R1C1): each number needs a pair",
                "2 appears 3 times (R1C3, R3C1, R3C3): each number needs exactly two",
                "3 appears once (R2C2): each number needs a pair",
            ),
            NumberLinkAuthoring.problems(bad),
        )
    }

    @Test
    fun shikakuAreasMustTileTheGrid() {
        // 3 x 3 split into a 3, a 3 and a 3 (three rows).
        val rowsOf3 = ClueGridDraft(listOf(listOf(3, 0, 0), listOf(0, 3, 0), listOf(0, 0, 3)))
        assertTrue(ShikakuAuthoring.problems(rowsOf3).isEmpty())
        assertEquals(
            listOf("Clues add up to 6 but the grid has 9 cells"),
            ShikakuAuthoring.problems(ShikakuAuthoring.setClue(rowsOf3, 2, 2, null)),
        )
        // A 4 in the middle of a 3 x 3 with clues at every corner: a 2 x 2 always takes a
        // corner, and 1 x 4 doesn't fit.
        val boxed = ClueGridDraft(listOf(listOf(1, 0, 1), listOf(0, 4, 0), listOf(1, 0, 1)))
        assertFalse(ShikakuAuthoring.fits(boxed, 1, 1, 4))
        assertEquals(
            listOf("R2C2 4 has no room for a 4-cell rectangle"),
            ShikakuAuthoring.problems(boxed).drop(1),
        )
        assertTrue(ShikakuAuthoring.fits(rowsOf3, 0, 0, 3))
    }

    @Test
    fun fillominoCluesMustFitTheirRooms() {
        val ok = ClueGridDraft(listOf(listOf(2, 2, 0), listOf(0, 1, 3), listOf(3, 0, 0)))
        assertTrue(FillominoAuthoring.problems(ok).isEmpty())
        // Two adjacent 1s would be one room of 2; three connected 2s overflow a 2-room.
        val crowded = ClueGridDraft(listOf(listOf(1, 1, 0), listOf(2, 2, 0), listOf(0, 2, 0)))
        assertEquals(
            listOf(
                "R1C1: 2 connected 1s can't fit in one 1-cell room",
                "R2C1: 3 connected 2s can't fit in one 2-cell room",
            ),
            FillominoAuthoring.problems(crowded),
        )
        assertEquals(
            listOf("R1C1: 5 is bigger than the grid's 4 cells"),
            FillominoAuthoring.problems(ClueGridDraft(listOf(listOf(5, 0), listOf(0, 0)))),
        )
    }
}
