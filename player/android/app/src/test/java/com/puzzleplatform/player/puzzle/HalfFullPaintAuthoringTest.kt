package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

class HalfFullPaintAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/half-full-paint/$name.canon.json").readText()) as JsonObject

    private val example = HalfFullPaintAuthoring.draftFromCanon(sample("board-half-full-paint-example"))

    @Test
    fun samplesRoundTripThroughTheDraft() {
        for ((name, size) in listOf("board-half-full-paint-example" to 4, "board-half-full-paint-1" to 6,
            "board-half-full-paint-2" to 10, "board-half-full-paint-3" to 10)) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.HALF_FULL_PAINT, canon)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.HALF_FULL_PAINT))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.HALF_FULL_PAINT))
        }
    }

    @Test
    fun wallsAndCircles() {
        val d = HalfFullPaintAuthoring.toggleWall(example, "h:0,0")
        assertEquals(1, d.h[0][0])
        assertEquals(example, HalfFullPaintAuthoring.toggleWall(d, "h:0,0"))
        assertEquals(example, HalfFullPaintAuthoring.toggleWall(example, "h:3,0")) // off the grid
        fun color(b: HalfFullPaintEngine.Board) = b.circles.firstOrNull { it.dr == 2 && it.dc == 2 }?.color
        var c = HalfFullPaintAuthoring.cycleCircle(example, 2, 2)
        assertEquals(KuralinEngine.WHITE_CIRCLE, color(c))
        c = HalfFullPaintAuthoring.cycleCircle(c, 2, 2)
        assertEquals(KuralinEngine.GRAY_CIRCLE, color(c))
        c = HalfFullPaintAuthoring.cycleCircle(c, 2, 2)
        assertEquals(KuralinEngine.BLACK_CIRCLE, color(c))
        assertEquals(example, HalfFullPaintAuthoring.cycleCircle(c, 2, 2))
        assertEquals(example, HalfFullPaintAuthoring.cycleCircle(example, 1, 1)) // a cell centre
    }

    @Test
    fun rowsAndColumnsShiftCircles() {
        val taller = HalfFullPaintAuthoring.addRow(example, top = true)
        assertEquals(5, taller.rows)
        assertEquals(1, taller.h[0][0]) // the new row is walled off
        assertEquals(example.circles.map { it.dr + 2 }, taller.circles.map { it.dr })
        assertEquals(example, HalfFullPaintAuthoring.removeEdgeRow(taller, top = true))
        val wider = HalfFullPaintAuthoring.addCol(example)
        assertEquals(example, HalfFullPaintAuthoring.removeEdgeCol(wider, left = false))
        // Dropping the left column loses the circles on its right edge.
        val narrower = HalfFullPaintAuthoring.removeEdgeCol(example, left = true)
        assertNull(narrower.circles.firstOrNull { it.dc == 0 })
        assertEquals(3, narrower.circles.size)
    }

    @Test
    fun problems() {
        val open = HalfFullPaintEngine.Board(3, 3, List(2) { List(3) { 0 } }, List(3) { List(2) { 0 } }, emptyList())
        assertEquals(listOf("No circles", "Only one room"), HalfFullPaintAuthoring.problems(open))
        val dangling = HalfFullPaintAuthoring.toggleWall(example, "h:0,1") // inside the L room
        assertEquals(listOf("Wall at R1C2 doesn't close off a room"), HalfFullPaintAuthoring.formatProblems(dangling))
        val twice = example.copy(circles = example.circles + example.circles[0])
        assertEquals(listOf("Two circles at (1,2)"), HalfFullPaintAuthoring.formatProblems(twice))
    }
}
