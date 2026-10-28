package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class KuralinAuthoringTest {

    private fun canon(json: String) = Json.parseToJsonElement(json) as JsonObject

    private val parsed = canon(
        """{"width":3,"height":2,"circles":[
            {"dr":2,"dc":4,"color":2},{"dr":1,"dc":2,"color":0},{"dr":2,"dc":5,"color":1}]}""",
    )

    @Test
    fun canonRoundTrip_sortsCircles() {
        val draft = KuralinAuthoring.draftFromCanon(parsed)
        assertEquals(2, draft.rows)
        assertEquals(3, draft.cols)
        assertEquals(listOf(1 to 2, 2 to 4, 2 to 5), draft.circles.map { it.dr to it.dc })
        assertEquals(draft, KuralinAuthoring.draftFromCanon(KuralinAuthoring.canonFromDraft(draft)))
    }

    @Test
    fun draftFromCanon_dropsInvalidCircles() {
        val draft = KuralinAuthoring.draftFromCanon(
            canon(
                """{"width":3,"height":2,"circles":[
                    {"dr":1,"dc":1,"color":0},{"dr":0,"dc":2,"color":0},
                    {"dr":2,"dc":2,"color":7},{"dr":2,"dc":2,"color":1},{"dr":2,"dc":2,"color":0}]}""",
            ),
        )
        assertEquals(listOf(KuralinEngine.Circle(2, 2, 1)), draft.circles)
    }

    @Test
    fun cycleCircle_noneWhiteBlackGrayNone() {
        var draft = KuralinDraft(2, 3)
        val seen = mutableListOf<Int?>()
        repeat(4) {
            draft = KuralinAuthoring.cycleCircle(draft, 2, 2)
            seen += draft.circleAt(2, 2)?.color
        }
        assertEquals(listOf(0, 1, 2, null), seen)
        // A cell center or the border is never a circle.
        assertEquals(draft, KuralinAuthoring.cycleCircle(draft, 1, 1))
        assertEquals(draft, KuralinAuthoring.cycleCircle(draft, 0, 2))
    }

    @Test
    fun removeLastRowAndCol_dropCirclesLeavingTheInterior() {
        val draft = KuralinAuthoring.draftFromCanon(parsed)
        // 2 x 3 -> 2 x 2: the corner at dc=4 is now on the border, dc=5 is outside.
        val narrower = KuralinAuthoring.removeLastCol(draft)
        assertEquals(2, narrower.cols)
        assertEquals(listOf(KuralinEngine.Circle(1, 2, 0)), narrower.circles)
        // Never below two rows/columns.
        assertEquals(narrower, KuralinAuthoring.removeLastCol(narrower))
        assertEquals(draft, KuralinAuthoring.removeLastRow(draft))
        assertEquals(3, KuralinAuthoring.addRow(draft).rows)
    }

    @Test
    fun problems_flagsNoCircles() {
        assertEquals(listOf("No circles"), KuralinAuthoring.problems(KuralinDraft(2, 2)))
        assertTrue(KuralinAuthoring.problems(KuralinAuthoring.draftFromCanon(parsed)).isEmpty())
    }
}
