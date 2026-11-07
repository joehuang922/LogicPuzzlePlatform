package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NuritwinAuthoringTest {

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    /** 2 rows x 4 cols: a 4-cell room on the left (clued 1), a 4-cell room on the right. */
    private val canon = json(
        """{"cells":[[1,0,0,0],[0,0,0,0]],"grids":{"h":[[0,0,0,0]],"v":[[0,1,0],[0,1,0]]}}"""
    )

    @Test
    fun canonRoundTrips() {
        val draft = NuritwinAuthoring.draftFromCanon(canon)
        assertEquals(4, draft.width)
        assertEquals(2, draft.height)
        assertEquals(2, draft.regions().size)
        assertEquals(mapOf((0 to 0) to 1), draft.clues)
        assertEquals(canon, NuritwinAuthoring.canonFromDraft(draft))
        assertTrue(NuritwinAuthoring.problems(draft).isEmpty())
    }

    @Test
    fun numberTooBigForTwoGroupsIsAProblem() {
        val draft = RippleEffectAuthoring.setClue(NuritwinAuthoring.draftFromCanon(canon), 0, 0, 3)
        assertEquals(1, NuritwinAuthoring.problems(draft).size)
        assertTrue(NuritwinAuthoring.formatProblems(draft).isEmpty())
    }

    @Test
    fun twoNumbersInARoomIsAProblem() {
        val draft = RippleEffectAuthoring.setClue(NuritwinAuthoring.draftFromCanon(canon), 1, 1, 2)
        assertEquals(1, NuritwinAuthoring.problems(draft).size)
    }

    @Test
    fun roomTooSmallForTwoGroupsIsAProblem() {
        // Splitting the left room's column 0 off leaves two 2-cell rooms.
        val draft = RippleEffectAuthoring.toggleWall(
            RippleEffectAuthoring.toggleWall(NuritwinAuthoring.draftFromCanon(canon), 0, 0, WallSide.RIGHT),
            0, 1, WallSide.RIGHT,
        )
        assertTrue(NuritwinAuthoring.formatProblems(draft).isEmpty())
        // Two 2-cell rooms, and the 1 in one of them still fits (2 / 2 = 1).
        assertEquals(2, NuritwinAuthoring.problems(draft).size)
    }

    @Test
    fun danglingWallIsAFormatProblem() {
        val draft = RippleEffectAuthoring.toggleWall(NuritwinAuthoring.draftFromCanon(canon), 0, 0, WallSide.RIGHT)
        assertEquals(1, NuritwinAuthoring.formatProblems(draft).size)
    }
}
