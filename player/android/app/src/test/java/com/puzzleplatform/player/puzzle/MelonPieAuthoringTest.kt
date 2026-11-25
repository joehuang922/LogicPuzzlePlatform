package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class MelonPieAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/melon-pie/$name.canon.json").readText()) as JsonObject

    private val example = MelonPieAuthoring.draftFromCanon(sample("board-melon-pie-example"))

    @Test
    fun samplesRoundTripThroughTheDraft() {
        for ((name, size) in listOf("board-melon-pie-example" to 4, "board-melon-pie-1" to 6,
            "board-melon-pie-2" to 6, "board-melon-pie-3" to 6)) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.MELON_PIE, canon)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.MELON_PIE))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.MELON_PIE))
        }
    }

    @Test
    fun circlesCycle() {
        fun color(b: MelonPieEngine.Board) = b.circleAt(3, 3)?.color
        var d = MelonPieAuthoring.cycleCircle(example, 3, 3)
        assertEquals(KuralinEngine.WHITE_CIRCLE, color(d))
        d = MelonPieAuthoring.cycleCircle(d, 3, 3)
        assertEquals(KuralinEngine.GRAY_CIRCLE, color(d))
        d = MelonPieAuthoring.cycleCircle(d, 3, 3)
        assertEquals(KuralinEngine.BLACK_CIRCLE, color(d))
        assertEquals(example, MelonPieAuthoring.cycleCircle(d, 3, 3))
        assertEquals(example, MelonPieAuthoring.cycleCircle(example, 5, 0)) // off the lattice
    }

    @Test
    fun rowsAndColumnsShiftCircles() {
        val taller = MelonPieAuthoring.addRow(example, top = true)
        assertEquals(5, taller.height)
        assertEquals(example.circles.map { it.r + 1 }, taller.circles.map { it.r })
        assertEquals(example, MelonPieAuthoring.removeEdgeRow(taller, top = true))
        assertEquals(example, MelonPieAuthoring.removeEdgeCol(MelonPieAuthoring.addCol(example), left = false))
        // Dropping the left column loses the four circles on its outer points.
        assertEquals(4, MelonPieAuthoring.removeEdgeCol(example, left = true).circles.size)
    }

    @Test
    fun problems() {
        val empty = MelonPieEngine.Board(2, 2, emptyList())
        assertEquals(listOf("No circles"), MelonPieAuthoring.problems(empty))
        val odd = example.copy(circles = example.circles.drop(1)) // one black gone
        assertEquals(listOf("3 black circles can't pair up"), MelonPieAuthoring.problems(odd))
        val twice = example.copy(circles = example.circles + example.circles[0])
        assertEquals(listOf("Two circles at (0,0)"), MelonPieAuthoring.formatProblems(twice))
    }
}
