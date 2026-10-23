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
 * Pure logic behind the Admin heyawake flow: parser canon -> wall draft -> canon
 * round-trips, clue edits, free wall toggles through interim shapes, line edits, and
 * the format / misread checks.
 */
class HeyawakeAuthoringTest {

    // 3 wide x 2 tall: a 2x2 room (clue 1) on the left, a 1x2 strip on the right.
    private val small = HeyawakeAuthoring.draftFromRooms(
        3, 2, listOf(Room(0, 0, 2, 2, 1), Room(0, 2, 1, 2, null)),
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    private fun roomsOf(d: HeyawakeDraft): Set<Room> =
        HeyawakeAuthoring.draftFromCanon(HeyawakeAuthoring.canonFromDraft(d)).regions()
            .map { Room(it.r, it.c, it.w, it.h, it.clue) }.toSet()

    @Test
    fun canonRoundTrips() {
        val canon = HeyawakeAuthoring.canonFromDraft(small)
        assertEquals(small, HeyawakeAuthoring.draftFromCanon(canon))
        assertEquals(setOf(Room(0, 0, 2, 2, 1), Room(0, 2, 1, 2, null)), roomsOf(small))
    }

    @Test
    fun missingClueReadsAsUnclued() {
        val d = HeyawakeAuthoring.draftFromCanon(json("""{"width":1,"height":1,"rooms":[{"r":0,"c":0,"w":1,"h":1}]}"""))
        assertEquals(emptyMap<Pair<Int, Int>, Int>(), d.clues)
        assertEquals(1, d.regions().size)
    }

    @Test
    fun setClueTargetsTheRoomUnderTheCell() {
        val d = HeyawakeAuthoring.setClue(small, col = 1, row = 1, clue = 2)
        // The room's existing clue cell keeps the clue.
        assertEquals(mapOf((0 to 0) to 2), d.clues)
        assertEquals(emptyMap<Pair<Int, Int>, Int>(), HeyawakeAuthoring.setClue(d, col = 0, row = 0, clue = null).clues)
        // An unclued room gets it on its first cell.
        assertEquals(3, HeyawakeAuthoring.setClue(small, col = 2, row = 1, clue = 3).clues[0 to 2])
    }

    @Test
    fun wallsReadFromRooms() {
        assertTrue(HeyawakeAuthoring.hasWall(small, 1, 0, WallSide.RIGHT))
        assertFalse(HeyawakeAuthoring.hasWall(small, 0, 0, WallSide.RIGHT))
        assertFalse(HeyawakeAuthoring.hasWall(small, 0, 0, WallSide.TOP)) // outer border
    }

    @Test
    fun aFullSplitLineMakesTwoRooms() {
        // Walls under both cells of the 2x2 room split it into two 2x1 rooms; the top one
        // holds the clue cell.
        val half = HeyawakeAuthoring.toggleWall(small, 0, 0, WallSide.BOTTOM)
        val d = HeyawakeAuthoring.toggleWall(half, 1, 1, WallSide.TOP)
        assertTrue(HeyawakeAuthoring.formatProblems(d).isEmpty())
        assertEquals(setOf(Room(0, 0, 2, 1, 1), Room(1, 0, 2, 1, null), Room(0, 2, 1, 2, null)), roomsOf(d))
    }

    @Test
    fun aHalfDrawnSplitIsAnInterimFormatProblem() {
        val half = HeyawakeAuthoring.toggleWall(small, 0, 0, WallSide.BOTTOM)
        assertEquals(listOf("Room at R1C1 has a wall that doesn't close off a room"), HeyawakeAuthoring.formatProblems(half))
        // Toggling it back restores the original exactly.
        assertEquals(small, HeyawakeAuthoring.toggleWall(half, 0, 0, WallSide.BOTTOM))
    }

    @Test
    fun removingWallsCanPassThroughAnLShape() {
        // Split the left room into a top and bottom strip, then remove the wall between
        // the top strip and the right column: an L, allowed mid-edit but flagged.
        val split = HeyawakeAuthoring.toggleWall(HeyawakeAuthoring.toggleWall(small, 0, 0, WallSide.BOTTOM), 1, 0, WallSide.BOTTOM)
        val l = HeyawakeAuthoring.toggleWall(split, 1, 0, WallSide.RIGHT)
        assertTrue(HeyawakeAuthoring.canToggleWall(split, 1, 0, WallSide.RIGHT))
        assertTrue(HeyawakeAuthoring.formatProblems(l).contains("Room at R1C1 isn't a rectangle"))
        // Removing the remaining walls on the right merges everything into one rectangle.
        val whole = HeyawakeAuthoring.toggleWall(HeyawakeAuthoring.toggleWall(l, 1, 1, WallSide.RIGHT), 0, 0, WallSide.BOTTOM)
        val done = HeyawakeAuthoring.toggleWall(whole, 1, 0, WallSide.BOTTOM)
        assertTrue(HeyawakeAuthoring.formatProblems(done).isEmpty())
        assertEquals(setOf(Room(0, 0, 3, 2, 1)), roomsOf(done))
    }

    @Test
    fun mergingTwoCluedRoomsFlagsTheExtraClue() {
        val d = HeyawakeAuthoring.draftFromRooms(1, 2, listOf(Room(0, 0, 1, 1, 1), Room(1, 0, 1, 1, 0)))
        val merged = HeyawakeAuthoring.toggleWall(d, 0, 0, WallSide.BOTTOM)
        assertEquals(listOf("Room at R1C1 has 2 clues"), HeyawakeAuthoring.formatProblems(merged))
        // Setting the room's clue leaves just one.
        assertTrue(HeyawakeAuthoring.formatProblems(HeyawakeAuthoring.setClue(merged, 0, 1, 1)).isEmpty())
    }

    @Test
    fun aParseWithGapsOrOverlapsLoadsAndIsEditable() {
        // R2C2, R3C2 and R3C3 in no room: an L-shaped "room" of its own.
        val gappy = HeyawakeAuthoring.draftFromRooms(
            3, 3, listOf(Room(0, 0, 3, 1, 1), Room(1, 0, 1, 2, null), Room(1, 2, 1, 1, null)),
        )
        assertEquals(listOf("Room at R2C2 isn't a rectangle"), HeyawakeAuthoring.formatProblems(gappy))
        val fixed = HeyawakeAuthoring.toggleWall(gappy, 1, 1, WallSide.BOTTOM)
        assertTrue(HeyawakeAuthoring.formatProblems(fixed).isEmpty())

        // A phantom 1x1 room over the centre of a 3x3 room notches it into a ring.
        val notched = HeyawakeAuthoring.draftFromRooms(3, 3, listOf(Room(0, 0, 3, 3, 2), Room(1, 1, 1, 1, null)))
        assertEquals(listOf("Room at R1C1 isn't a rectangle"), HeyawakeAuthoring.formatProblems(notched))
        var healed = notched
        for (side in WallSide.entries) healed = HeyawakeAuthoring.toggleWall(healed, 1, 1, side)
        assertEquals(setOf(Room(0, 0, 3, 3, 2)), roomsOf(healed))
    }

    @Test
    fun borderSidesCantToggle() {
        assertFalse(HeyawakeAuthoring.canToggleWall(small, 0, 0, WallSide.TOP))
        assertFalse(HeyawakeAuthoring.canToggleWall(small, 2, 1, WallSide.RIGHT))
        assertEquals(small, HeyawakeAuthoring.toggleWall(small, 0, 0, WallSide.TOP))
    }

    @Test
    fun addAndRemoveLines() {
        val grown = HeyawakeAuthoring.addCol(HeyawakeAuthoring.addRow(small))
        assertEquals(4, grown.width)
        assertEquals(3, grown.height)
        assertTrue(HeyawakeAuthoring.problems(grown).isEmpty())
        assertEquals(
            setOf(Room(0, 0, 2, 2, 1), Room(0, 2, 1, 2, null), Room(2, 0, 3, 1, null), Room(0, 3, 1, 3, null)),
            roomsOf(grown),
        )

        // Dropping row 0 shrinks both rooms (the clue moves down with its room);
        // dropping column 2 then removes the strip.
        val shrunk = HeyawakeAuthoring.removeCol(HeyawakeAuthoring.removeRow(small, 0), 2)
        assertEquals(2, shrunk.width)
        assertEquals(1, shrunk.height)
        assertEquals(setOf(Room(0, 0, 2, 1, 1)), roomsOf(shrunk))
    }

    @Test
    fun problems() {
        assertTrue(HeyawakeAuthoring.problems(small).isEmpty())
        assertEquals(listOf("No cells"), HeyawakeAuthoring.problems(HeyawakeDraft()))
        val tooBig = HeyawakeAuthoring.setClue(small, 0, 0, 3)
        assertEquals(listOf("Room at R1C1: clue 3 can't fit in 2×2 (at most 2)"), HeyawakeAuthoring.problems(tooBig))
        // A clue too big is a misread, not a format problem: it may be overridden.
        assertTrue(HeyawakeAuthoring.formatProblems(tooBig).isEmpty())
    }
}
