package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.TentaishowEngine.Dot
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TentaishowAuthoringTest {

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    private val canon = json(
        """{"width":3,"height":2,"dots":[{"dr":1,"dc":1,"color":0},{"dr":2,"dc":4,"color":1}]}"""
    )

    @Test
    fun canonRoundTrips() {
        val draft = TentaishowAuthoring.draftFromCanon(canon)
        assertEquals(2, draft.rows)
        assertEquals(3, draft.cols)
        assertEquals(canon, TentaishowAuthoring.canonFromDraft(draft))
        assertTrue(TentaishowAuthoring.problems(draft).isEmpty())
    }

    @Test
    fun offGridAndRepeatedDotsAreDropped() {
        val draft = TentaishowAuthoring.draftFromCanon(
            json("""{"width":2,"height":2,"dots":[{"dr":5,"dc":1,"color":0},{"dr":1,"dc":1,"color":7},{"dr":1,"dc":1,"color":1}]}""")
        )
        assertEquals(listOf(Dot(1, 1, TentaishowAuthoring.OPEN)), draft.dots)
    }

    @Test
    fun tapsSnapToTheNearestPoint() {
        assertEquals(1 to 1, TentaishowAuthoring.nearestPoint(0.45f, 0.55f, 2, 3))
        assertEquals(2 to 4, TentaishowAuthoring.nearestPoint(2.05f, 0.95f, 2, 3))
        // A tap on the outer border clamps inside the grid.
        assertEquals(1 to 5, TentaishowAuthoring.nearestPoint(3.0f, 0.0f, 2, 3))
        assertNull(TentaishowAuthoring.nearestPoint(0f, 0f, 0, 0))
    }

    @Test
    fun cycleGoesNoneOpenFilledNone() {
        var draft = TentaishowAuthoring.draftFromCanon(canon)
        draft = TentaishowAuthoring.cycleDot(draft, 3, 5)
        assertEquals(TentaishowAuthoring.OPEN, draft.dotAt(3, 5)?.color)
        draft = TentaishowAuthoring.cycleDot(draft, 3, 5)
        assertEquals(TentaishowAuthoring.FILLED, draft.dotAt(3, 5)?.color)
        draft = TentaishowAuthoring.cycleDot(draft, 3, 5)
        assertNull(draft.dotAt(3, 5))
        assertEquals(draft, TentaishowAuthoring.cycleDot(draft, 0, 0))
    }

    @Test
    fun noDotsIsAFormatProblem() {
        val draft = TentaishowDraft(2, 2)
        assertEquals(listOf("No dots"), TentaishowAuthoring.formatProblems(draft))
    }

    @Test
    fun dotsSharingACellAreAProblem() {
        // (1,1) is cell R1C1's center; (2,2) is the corner touching R1C1..R2C2.
        val draft = TentaishowAuthoring.cycleDot(TentaishowAuthoring.draftFromCanon(canon), 2, 2)
        assertTrue(TentaishowAuthoring.formatProblems(draft).isEmpty())
        // Clashes with the center dot (R1C1) and with the (2,4) corner dot (R1C2, R2C2).
        assertEquals(2, TentaishowAuthoring.problems(draft).size)
    }

    @Test
    fun removingTheLastColumnDropsItsDots() {
        val draft = TentaishowAuthoring.removeLastCol(TentaishowAuthoring.draftFromCanon(canon))
        assertEquals(2, draft.cols)
        assertEquals(listOf(Dot(1, 1, 0)), draft.dots)
    }
}
