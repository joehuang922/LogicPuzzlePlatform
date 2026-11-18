package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.OminoTreeEngine.Arrow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class OminoTreeAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/omino-tree/$name.canon.json").readText()) as JsonObject

    private val empty3 = OminoTreeEngine.Board(3, 3, List(3) { List(3) { 0 } }, emptyList())

    @Test
    fun samples_roundTripThroughTheDraft() {
        for ((name, size) in listOf(
            "rules-example" to 4, "board-omino-tree-1" to 5, "board-omino-tree-2" to 6,
            "board-omino-tree-3" to 6, "board-omino-tree-4" to 8,
        )) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.OMINO_TREE, canon)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.OMINO_TREE))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.OMINO_TREE))
        }
    }

    @Test
    fun cycleArrow_forwardBackwardNone() {
        var d = OminoTreeAuthoring.cycleArrow(empty3, "h:0,1")
        assertEquals(listOf(Arrow(0, 1, "down")), d.arrows)
        d = OminoTreeAuthoring.cycleArrow(d, "h:0,1")
        assertEquals(listOf(Arrow(1, 1, "up")), d.arrows)
        d = OminoTreeAuthoring.cycleArrow(d, "h:0,1")
        assertTrue(d.arrows.isEmpty())

        d = OminoTreeAuthoring.cycleArrow(empty3, "v:2,0")
        assertEquals(listOf(Arrow(2, 0, "right")), d.arrows)
        d = OminoTreeAuthoring.cycleArrow(d, "v:2,0")
        assertEquals(listOf(Arrow(2, 1, "left")), d.arrows)
        // Off-board edges are ignored.
        assertEquals(empty3, OminoTreeAuthoring.cycleArrow(empty3, "h:2,0"))
        assertEquals(empty3, OminoTreeAuthoring.cycleArrow(empty3, "v:0,2"))
    }

    @Test
    fun setNumber_setsAndClears() {
        val d = OminoTreeAuthoring.setNumber(empty3, 1, 2, 12)
        assertEquals(12, d.number(1, 2))
        assertEquals(0, OminoTreeAuthoring.setNumber(d, 1, 2, null).number(1, 2))
        assertEquals(12, OminoTreeAuthoring.parseNumber("12"))
        assertEquals(null, OminoTreeAuthoring.parseNumber("0"))
    }

    @Test
    fun resize_dropsArrowsThatNoLongerFit() {
        val d = OminoTreeAuthoring.cycleArrow(OminoTreeAuthoring.cycleArrow(empty3, "h:1,0"), "v:0,0")
        val smaller = OminoTreeAuthoring.removeLastRow(d)
        assertEquals(2, smaller.rows)
        assertEquals(listOf(Arrow(0, 0, "right")), smaller.arrows)
        assertEquals(2, smaller.numbers.size)
        val bigger = OminoTreeAuthoring.addCol(d)
        assertEquals(4, bigger.cols)
        assertTrue(bigger.numbers.all { it.size == 4 })
        assertEquals(OminoTreeAuthoring.removeLastRow(OminoTreeAuthoring.removeLastRow(d)).rows, 2)
    }

    @Test
    fun problems_formatAndWarnings() {
        assertEquals(listOf("No arrows"), OminoTreeAuthoring.problems(empty3))
        val bad = empty3.copy(arrows = listOf(Arrow(0, 0, "up"), Arrow(0, 0, "right"), Arrow(0, 1, "left")))
        val format = OminoTreeAuthoring.formatProblems(bad)
        assertEquals(2, format.size)
        assertTrue(format[0].contains("leaves the grid"))
        assertTrue(format[1].contains("Two arrows"))
        assertEquals(format, BoardDraft(ominoTree = bad).formatProblems(AuthoringType.OMINO_TREE))
    }
}
