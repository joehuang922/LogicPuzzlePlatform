package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.YajilixEngine.Clue
import com.puzzleplatform.player.puzzle.YajilixEngine.Dir
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class YajilixAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/yajilix/$name.canon.json").readText()) as JsonObject

    private val example = YajilixAuthoring.draftFromCanon(sample("board-yajilix-example"))

    @Test
    fun samplesRoundTripThroughTheDraft() {
        for ((name, size) in listOf("board-yajilix-example" to 6, "board-yajilix-1" to 8,
            "board-yajilix-2" to 10, "board-yajilix-3" to 10)) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.YAJILIX, canon)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.YAJILIX))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.YAJILIX))
        }
    }

    @Test
    fun edits() {
        var d = YajilixAuthoring.setKind(example, 0, 0, 'X')
        assertEquals(Clue('X', 0, Dir.UP), d.clue(0, 0))
        d = YajilixAuthoring.setDir(d, 0, 0, Dir.RIGHT)
        d = YajilixAuthoring.stepNum(d, 0, 0, 1)
        d = YajilixAuthoring.stepNum(d, 0, 0, 1)
        assertEquals(Clue('X', 2, Dir.RIGHT), d.clue(0, 0))
        assertEquals(Clue('X', 0, Dir.RIGHT), YajilixAuthoring.stepNum(YajilixAuthoring.stepNum(d, 0, 0, -2), 0, 0, -1).clue(0, 0))
        assertEquals(Clue('I', 2, Dir.RIGHT), YajilixAuthoring.setKind(d, 0, 0, 'I').clue(0, 0))
        assertNull(YajilixAuthoring.setKind(d, 0, 0, null).clue(0, 0))
        assertEquals(d, YajilixAuthoring.setKind(d, 0, 0, 'Q'))
        assertEquals(example, YajilixAuthoring.setDir(example, 9, 9, Dir.UP)) // off the grid
    }

    @Test
    fun rowsAndColumns() {
        val wider = YajilixAuthoring.addCol(example)
        assertEquals(7, wider.cols)
        assertNull(wider.clue(0, 6))
        assertEquals(example, YajilixAuthoring.removeLastCol(wider))
        val taller = YajilixAuthoring.addRow(example)
        assertEquals(7, taller.rows)
        assertEquals(example, YajilixAuthoring.removeLastRow(taller))
        val tiny = YajilixEngine.Board(List(2) { List(2) { null } })
        assertEquals(tiny, YajilixAuthoring.removeLastRow(tiny))
    }

    @Test
    fun problems() {
        val empty = YajilixEngine.Board(List(3) { List(3) { null } })
        assertEquals(listOf("No clues"), YajilixAuthoring.problems(empty))
        val off = YajilixAuthoring.stepNum(YajilixAuthoring.setKind(empty, 0, 0, 'L'), 0, 0, 1) // L1↑ on the top row
        assertTrue(YajilixAuthoring.problems(off).single().startsWith("L1↑ at R1C1"))
        assertEquals(emptyList<String>(), YajilixAuthoring.formatProblems(off))
        val ragged = YajilixEngine.Board(listOf(listOf(null, null), listOf(null)))
        assertEquals(listOf("Rows of cells differ in length"), YajilixAuthoring.formatProblems(ragged))
    }
}
