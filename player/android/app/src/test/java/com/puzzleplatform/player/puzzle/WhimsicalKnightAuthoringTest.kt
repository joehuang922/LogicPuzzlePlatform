package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.WhimsicalKnightEngine.Point
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class WhimsicalKnightAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/whimsical-knight/$name.canon.json").readText()) as JsonObject

    private val empty3 = WhimsicalKnightEngine.Board(3, 3, listOf(listOf(0, 0), listOf(0, 0)), emptyList(), emptyList())

    @Test
    fun samples_roundTripThroughTheDraft() {
        for ((name, size) in listOf(
            "board-whimsical-knight" to 5, "board-whimsical-knight-2" to 6,
            "board-whimsical-knight-3" to 7, "rules-example" to 5,
        )) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.WHIMSICAL_KNIGHT, canon)
            assertEquals(CanonBoard(canon, size, size), board.toCanon(AuthoringType.WHIMSICAL_KNIGHT))
            assertEquals(emptyList<String>(), board.problems(AuthoringType.WHIMSICAL_KNIGHT))
        }
    }

    @Test
    fun tap_cellTogglesGrayDotCyclesMidpointToggles() {
        // Cell centre (0.5, 0.5) -> gray (0,0).
        var d = WhimsicalKnightAuthoring.tap(empty3, 0.45f, 0.55f)
        assertEquals(1, d.gray[0][0])
        assertEquals(0, WhimsicalKnightAuthoring.tap(d, 0.5f, 0.5f).gray[0][0])
        // Dot (1, 1): circle -> square -> none.
        d = WhimsicalKnightAuthoring.tap(d, 1.05f, 0.95f)
        assertEquals(listOf(Point(2, 2)), d.circles)
        d = WhimsicalKnightAuthoring.tap(d, 1f, 1f)
        assertEquals(listOf(Point(2, 2)), d.squares)
        assertTrue(d.circles.isEmpty())
        d = WhimsicalKnightAuthoring.tap(d, 1f, 1f)
        assertTrue(d.squares.isEmpty())
        // Midpoint between dots (0, 0) and (0, 1): circle -> none (no square).
        d = WhimsicalKnightAuthoring.tap(d, 0.5f, 0f)
        assertEquals(listOf(Point(0, 1)), d.circles)
        d = WhimsicalKnightAuthoring.tap(d, 0.5f, 0f)
        assertTrue(d.circles.isEmpty() && d.squares.isEmpty())
    }

    @Test
    fun resize_keepsGrayAndDropsCluesThatLeave() {
        var d = WhimsicalKnightAuthoring.toggleGray(empty3, 1, 1)
        d = WhimsicalKnightAuthoring.cycleClue(d, 4, 4)
        d = WhimsicalKnightAuthoring.addCol(d)
        assertEquals(listOf(listOf(0, 0, 0), listOf(0, 1, 0)), d.gray)
        d = WhimsicalKnightAuthoring.removeEdgeRow(d, top = false)
        assertEquals(listOf(listOf(0, 0, 0)), d.gray)
        assertTrue(d.circles.isEmpty())
    }

    @Test
    fun problems_noCluesAndFormat() {
        assertEquals(listOf("No circles or squares"), WhimsicalKnightAuthoring.problems(empty3))
        val bad = empty3.copy(gray = listOf(listOf(0)), circles = listOf(Point(1, 1)), squares = listOf(Point(1, 0)))
        assertEquals(3, WhimsicalKnightAuthoring.formatProblems(bad).size)
    }
}
