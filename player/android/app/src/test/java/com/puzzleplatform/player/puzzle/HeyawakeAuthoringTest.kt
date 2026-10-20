package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.HeyawakeEngine.Room
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin heyawake flow: parser canon -> editable draft -> canon
 * round-trips, clue edits, wall split/merge, line edits, and the misread checks.
 */
class HeyawakeAuthoringTest {

    // 3 wide x 2 tall: a 2x2 room (clue 1) on the left, a 1x2 strip on the right.
    private val small = HeyawakeDraft(
        width = 3,
        height = 2,
        rooms = listOf(Room(0, 0, 2, 2, 1), Room(0, 2, 1, 2, null)),
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        val canon = HeyawakeAuthoring.canonFromDraft(small)
        assertEquals(small, HeyawakeAuthoring.draftFromCanon(canon))
    }

    @Test
    fun missingClueReadsAsUnclued() {
        val d = HeyawakeAuthoring.draftFromCanon(json("""{"width":1,"height":1,"rooms":[{"r":0,"c":0,"w":1,"h":1}]}"""))
        assertEquals(listOf(Room(0, 0, 1, 1, null)), d.rooms)
    }

    @Test
    fun setClueTargetsTheRoomUnderTheCell() {
        val d = HeyawakeAuthoring.setClue(small, col = 1, row = 1, clue = 2)
        assertEquals(2, d.rooms[0].clue)
        assertEquals(null, HeyawakeAuthoring.setClue(d, col = 0, row = 0, clue = null).rooms[0].clue)
    }

    @Test
    fun wallsReadFromRooms() {
        assertTrue(HeyawakeAuthoring.hasWall(small, 1, 0, WallSide.RIGHT))
        assertFalse(HeyawakeAuthoring.hasWall(small, 0, 0, WallSide.RIGHT))
        assertFalse(HeyawakeAuthoring.hasWall(small, 0, 0, WallSide.TOP)) // outer border
    }

    @Test
    fun addingAWallSplitsTheRoomAlongTheLine() {
        // Wall under (0,0) splits the 2x2 room into two 2x1 rooms; the top keeps the clue.
        val d = HeyawakeAuthoring.toggleWall(small, 0, 0, WallSide.BOTTOM)
        assertEquals(
            setOf(Room(0, 0, 2, 1, 1), Room(1, 0, 2, 1, null), Room(0, 2, 1, 2, null)),
            d.rooms.toSet(),
        )
        // The same split from the lower cell's top side.
        assertEquals(d.rooms.toSet(), HeyawakeAuthoring.toggleWall(small, 1, 1, WallSide.TOP).rooms.toSet())
        // A vertical split from the right-hand cell's left side.
        assertEquals(
            setOf(Room(0, 0, 1, 2, 1), Room(0, 1, 1, 2, null), Room(0, 2, 1, 2, null)),
            HeyawakeAuthoring.toggleWall(small, 1, 0, WallSide.LEFT).rooms.toSet(),
        )
    }

    @Test
    fun removingAWallMergesWhenTheUnionIsARectangle() {
        val merged = HeyawakeAuthoring.toggleWall(small, 1, 0, WallSide.RIGHT)
        assertEquals(listOf(Room(0, 0, 3, 2, 1)), merged.rooms)

        // An L-shaped union is refused.
        val split = HeyawakeAuthoring.toggleWall(small, 0, 0, WallSide.BOTTOM) // 2x1 top, 2x1 bottom, 1x2 right
        assertFalse(HeyawakeAuthoring.canToggleWall(split, 1, 0, WallSide.RIGHT))
        assertEquals(split, HeyawakeAuthoring.toggleWall(split, 1, 0, WallSide.RIGHT))

        // Merging an unclued room above into a clued one below keeps the clue.
        val d = HeyawakeDraft(1, 2, listOf(Room(0, 0, 1, 1, null), Room(1, 0, 1, 1, 1)))
        assertEquals(listOf(Room(0, 0, 1, 2, 1)), HeyawakeAuthoring.toggleWall(d, 0, 0, WallSide.BOTTOM).rooms)
    }

    @Test
    fun borderSidesCantToggle() {
        assertFalse(HeyawakeAuthoring.canToggleWall(small, 0, 0, WallSide.TOP))
        assertFalse(HeyawakeAuthoring.canToggleWall(small, 2, 1, WallSide.RIGHT))
    }

    @Test
    fun addAndRemoveLines() {
        val grown = HeyawakeAuthoring.addCol(HeyawakeAuthoring.addRow(small))
        assertEquals(4, grown.width)
        assertEquals(3, grown.height)
        assertTrue(HeyawakeAuthoring.problems(grown).isEmpty())

        // Dropping row 0 shrinks both rooms; dropping column 2 then removes the strip.
        val shrunk = HeyawakeAuthoring.removeCol(HeyawakeAuthoring.removeRow(small, 0), 2)
        assertEquals(HeyawakeDraft(2, 1, listOf(Room(0, 0, 2, 1, 1))), shrunk)
    }

    @Test
    fun problems() {
        assertTrue(HeyawakeAuthoring.problems(small).isEmpty())
        assertEquals(listOf("No cells"), HeyawakeAuthoring.problems(HeyawakeDraft()))
        assertEquals(
            listOf("Room at R1C1: clue 3 can't fit in 2×2 (at most 2)"),
            HeyawakeAuthoring.problems(HeyawakeAuthoring.setClue(small, 0, 0, 3)),
        )
        assertEquals(
            listOf("R1C3 is in no room"),
            HeyawakeAuthoring.problems(small.copy(rooms = small.rooms.take(1))),
        )
        assertEquals(
            listOf("Room at R1C2 runs off the grid", "Rooms overlap at R1C2"),
            HeyawakeAuthoring.problems(small.copy(rooms = small.rooms + Room(0, 1, 3, 1, null))),
        )
    }
}
