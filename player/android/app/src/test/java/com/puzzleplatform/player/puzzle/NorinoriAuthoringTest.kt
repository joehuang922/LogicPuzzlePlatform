package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NorinoriAuthoringTest {

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    /** 2 rows x 3 cols: rooms {(0,0),(0,1)}, {(0,2),(1,2)}, {(1,0),(1,1)}. */
    private val canon = json("""{"grids":{"h":[[1,1,0]],"v":[[0,1],[0,1]]}}""")

    @Test
    fun canonRoundTrips() {
        val draft = NorinoriAuthoring.draftFromCanon(canon)
        assertEquals(3, draft.width)
        assertEquals(2, draft.height)
        assertEquals(3, draft.regions().size)
        assertTrue(draft.clues.isEmpty())
        assertEquals(canon, NorinoriAuthoring.canonFromDraft(draft))
        assertTrue(NorinoriAuthoring.problems(draft).isEmpty())
    }

    @Test
    fun singleRowCanonReadsItsWidth() {
        val draft = NorinoriAuthoring.draftFromCanon(json("""{"grids":{"h":[],"v":[[1,0,0]]}}"""))
        assertEquals(4, draft.width)
        assertEquals(1, draft.height)
    }

    @Test
    fun emptyCanonIsNoCells() {
        val draft = NorinoriAuthoring.draftFromCanon(json("""{}"""))
        assertEquals(listOf("No cells"), NorinoriAuthoring.formatProblems(draft))
    }

    @Test
    fun danglingWallIsAFormatProblem() {
        // Remove the wall between (0,0)/(1,0) only: the rooms merge, and the wall under
        // (0,1) now ends inside the merged room.
        val draft = RippleEffectAuthoring.toggleWall(
            NorinoriAuthoring.draftFromCanon(canon), col = 0, row = 0, side = WallSide.BOTTOM,
        )
        assertEquals(1, NorinoriAuthoring.formatProblems(draft).size)
        assertEquals(NorinoriAuthoring.formatProblems(draft), NorinoriAuthoring.problems(draft))
    }

    @Test
    fun oneCellRoomIsAProblemButNotAFormatProblem() {
        val draft = RippleEffectAuthoring.toggleWall(
            NorinoriAuthoring.draftFromCanon(canon), col = 0, row = 0, side = WallSide.RIGHT,
        )
        // Splits the top-left room into two one-cell rooms.
        assertTrue(NorinoriAuthoring.formatProblems(draft).isEmpty())
        assertEquals(2, NorinoriAuthoring.problems(draft).size)
    }
}
