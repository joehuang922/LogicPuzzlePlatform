package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NurimazeAuthoringTest {

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    private val canon = json("""{"cells":[[3,0,1],[2,0,4]],"grids":{"h":[[1,1,0]],"v":[[0,1],[0,1]]}}""")

    @Test
    fun canonRoundTrips() {
        val draft = NurimazeAuthoring.draftFromCanon(canon)
        assertEquals(3, draft.width)
        assertEquals(2, draft.height)
        assertEquals(3, draft.regions().size)
        assertEquals(NurimazeAuthoring.START, draft.clues[0 to 0])
        assertEquals(canon, NurimazeAuthoring.canonFromDraft(draft))
        assertTrue(NurimazeAuthoring.problems(draft).isEmpty())
    }

    @Test
    fun unknownSymbolsReadAsNone() {
        val draft = NurimazeAuthoring.draftFromCanon(json("""{"cells":[[7,3]],"grids":{"h":[],"v":[[0]]}}"""))
        assertEquals(mapOf((0 to 1) to NurimazeAuthoring.START), draft.clues)
    }

    @Test
    fun startAndGoalMustBeOneEach() {
        var draft = NurimazeAuthoring.draftFromCanon(canon)
        draft = NurimazeAuthoring.setSymbol(draft, 1, 0, NurimazeAuthoring.START)
        draft = NurimazeAuthoring.setSymbol(draft, 2, 1, null)
        val problems = NurimazeAuthoring.problems(draft)
        assertEquals(2, problems.size)
        assertTrue(NurimazeAuthoring.formatProblems(draft).isEmpty())
    }

    @Test
    fun danglingWallIsAFormatProblem() {
        val draft = RippleEffectAuthoring.toggleWall(
            NurimazeAuthoring.draftFromCanon(canon), col = 0, row = 0, side = WallSide.BOTTOM,
        )
        assertEquals(1, NurimazeAuthoring.formatProblems(draft).size)
    }
}
