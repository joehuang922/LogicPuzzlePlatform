package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin ripple effect flow: parser canon -> wall draft -> canon
 * round-trips, number edits, free wall toggles, line edits, and the format / misread
 * checks.
 */
class RippleEffectAuthoringTest {

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    // 3 wide x 2 tall: an L of three cells (clue 3 top-left) and a 3-cell L on the right.
    //   3 . | .
    //     ---+
    //   . | . .     (walls under and right of (0,1), right of (1,0))
    private val canon = json(
        """{"cells":[[3,0,0],[0,0,0]],"edges":{"h":[[0,1,0]],"v":[[0,1],[1,0]]}}""",
    )
    private val small = RippleEffectAuthoring.draftFromCanon(canon)

    @Test
    fun canonRoundTrips() {
        assertEquals(3, small.width)
        assertEquals(2, small.height)
        assertEquals(mapOf((0 to 0) to 3), small.clues)
        assertEquals(canon, RippleEffectAuthoring.canonFromDraft(small))
        assertEquals(small, RippleEffectAuthoring.draftFromCanon(RippleEffectAuthoring.canonFromDraft(small)))
    }

    @Test
    fun roomsMayBeAnyShape() {
        // (0,0),(0,1),(1,0) and (0,2),(1,1),(1,2): two L-shaped rooms, no format problem.
        assertEquals(2, small.regions().size)
        assertEquals(listOf(0 to 0, 0 to 1, 1 to 0), small.regions()[0])
        assertEquals(emptyList<String>(), RippleEffectAuthoring.formatProblems(small))
        assertEquals(emptyList<String>(), RippleEffectAuthoring.problems(small))
    }

    @Test
    fun raggedOrEmptyCanonReadsSafely() {
        assertEquals(RippleEffectDraft(), RippleEffectAuthoring.draftFromCanon(json("""{"cells":[]}""")))
        assertEquals(listOf("No cells"), RippleEffectAuthoring.formatProblems(RippleEffectDraft()))
        val d = RippleEffectAuthoring.draftFromCanon(json("""{"cells":[[1,0],[2]]}"""))
        assertEquals(2, d.width)
        assertEquals(mapOf((0 to 0) to 1, (1 to 0) to 2), d.clues)
        assertEquals(1, d.regions().size) // no edges -> one room
    }

    @Test
    fun setClueIsPerCell() {
        val d = RippleEffectAuthoring.setClue(small, col = 1, row = 0, clue = 2)
        assertEquals(mapOf((0 to 0) to 3, (0 to 1) to 2), d.clues)
        assertEquals(mapOf((0 to 1) to 2), RippleEffectAuthoring.setClue(d, col = 0, row = 0, clue = null).clues)
        assertEquals(d, RippleEffectAuthoring.setClue(d, col = 9, row = 0, clue = 1)) // off-grid
    }

    @Test
    fun parseClueTreatsZeroAsEmpty() {
        assertEquals(12, RippleEffectAuthoring.parseClue("1a2"))
        assertEquals(null, RippleEffectAuthoring.parseClue(""))
        assertEquals(null, RippleEffectAuthoring.parseClue("0"))
    }

    @Test
    fun danglingWallIsAFormatProblem() {
        // Remove the wall right of (0,1): the wall under (0,1) now ends inside one big room.
        val d = RippleEffectAuthoring.toggleWall(small, col = 1, row = 0, side = WallSide.RIGHT)
        assertEquals(1, d.regions().size)
        assertEquals(1, RippleEffectAuthoring.formatProblems(d).size)
        // Closing it again heals it.
        val healed = RippleEffectAuthoring.toggleWall(d, col = 2, row = 0, side = WallSide.LEFT)
        assertEquals(small, healed)
    }

    @Test
    fun outerBorderDoesNotToggle() {
        assertFalse(RippleEffectAuthoring.canToggleWall(small, 0, 0, WallSide.TOP))
        assertEquals(small, RippleEffectAuthoring.toggleWall(small, 0, 0, WallSide.LEFT))
        assertTrue(RippleEffectAuthoring.hasWall(small, 1, 0, WallSide.BOTTOM))
        assertFalse(RippleEffectAuthoring.hasWall(small, 0, 0, WallSide.BOTTOM))
    }

    @Test
    fun misreadsAreOverridableProblems() {
        // 1x3 single room holding 4: too big for 3 cells.
        val tooBig = RippleEffectAuthoring.draftFromCanon(json("""{"cells":[[4,0,0]],"edges":{"h":[],"v":[[0,0]]}}"""))
        assertEquals(emptyList<String>(), RippleEffectAuthoring.formatProblems(tooBig))
        assertEquals(1, RippleEffectAuthoring.problems(tooBig).size)

        // Two 1s in one room (also within reach of each other in the row).
        val twice = RippleEffectAuthoring.draftFromCanon(json("""{"cells":[[1,1]],"edges":{"h":[],"v":[[0]]}}"""))
        val twiceProblems = RippleEffectAuthoring.problems(twice)
        assertTrue(twiceProblems.any { "2 times" in it })
        assertTrue(twiceProblems.any { "too close" in it })

        // Two 2s in separate rooms of one row, 2 apart: too close (they need 3).
        val close = RippleEffectAuthoring.draftFromCanon(
            json("""{"cells":[[2,0,2,0]],"edges":{"h":[],"v":[[0,1,0]]}}"""),
        )
        assertEquals(listOf("Two 2s at R1C1 and R1C3 are too close"), RippleEffectAuthoring.problems(close))
        // Three apart is fine.
        val far = RippleEffectAuthoring.draftFromCanon(
            json("""{"cells":[[2,0,0,2,0,0]],"edges":{"h":[],"v":[[0,0,1,0,0]]}}"""),
        )
        assertEquals(emptyList<String>(), RippleEffectAuthoring.problems(far))
        // Columns are checked too.
        val col = RippleEffectAuthoring.draftFromCanon(json("""{"cells":[[1],[1]],"edges":{"h":[[1]],"v":[[],[]]}}"""))
        assertEquals(listOf("Two 1s at R1C1 and R2C1 are too close"), RippleEffectAuthoring.problems(col))
    }

    @Test
    fun removeRowMergesWallsAndDropsItsNumbers() {
        val d = RippleEffectAuthoring.setClue(small, col = 2, row = 1, clue = 1)
        val removed = RippleEffectAuthoring.removeRow(d, 0)
        assertEquals(1, removed.height)
        assertEquals(emptyList<List<Boolean>>(), removed.hWalls)
        assertEquals(listOf(listOf(true, false)), removed.vWalls)
        assertEquals(mapOf((0 to 2) to 1), removed.clues)
        assertEquals(removed, RippleEffectAuthoring.removeRow(removed, 0)) // keeps one row
    }

    @Test
    fun removeColShiftsNumbers() {
        val removed = RippleEffectAuthoring.removeCol(small, 0)
        assertEquals(2, removed.width)
        assertEquals(emptyMap<Pair<Int, Int>, Int>(), removed.clues)
        val keep = RippleEffectAuthoring.removeCol(RippleEffectAuthoring.setClue(small, 2, 1, 2), 1)
        assertEquals(mapOf((0 to 0) to 3, (1 to 1) to 2), keep.clues)
    }

    @Test
    fun addRowAndColAppendOneRoomEach() {
        val rows = RippleEffectAuthoring.addRow(small)
        assertEquals(3, rows.height)
        assertEquals(3, rows.regions().size)
        assertEquals(emptyList<String>(), RippleEffectAuthoring.formatProblems(rows))
        val cols = RippleEffectAuthoring.addCol(small)
        assertEquals(4, cols.width)
        assertEquals(3, cols.regions().size)
        assertEquals(small.clues, cols.clues)
        assertEquals(emptyList<String>(), RippleEffectAuthoring.formatProblems(cols))
    }
}
