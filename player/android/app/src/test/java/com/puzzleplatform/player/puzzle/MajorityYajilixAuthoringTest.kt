package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.YajilixEngine.Clue
import com.puzzleplatform.player.puzzle.YajilixEngine.Dir
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

class MajorityYajilixAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/majority-yajilix/$name.canon.json").readText()) as JsonObject

    private val example = MajorityYajilixAuthoring.draftFromCanon(sample("board-majority-yajilix-example"))

    @Test
    fun samplesRoundTripThroughTheDraft() {
        for ((name, size) in listOf("board-majority-yajilix-example" to 5, "board-majority-yajilix-1" to 8,
            "board-majority-yajilix-2" to 8, "board-majority-yajilix-3" to 10)) {
            val canon = sample(name)
            val board = BoardDraft.fromCanon(AuthoringType.MAJORITY_YAJILIX, canon)
            assertEquals(name, CanonBoard(canon, size, size), board.toCanon(AuthoringType.MAJORITY_YAJILIX))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.MAJORITY_YAJILIX))
        }
    }

    @Test
    fun editsKeepCluesNumberless() {
        var d = MajorityYajilixAuthoring.setKind(example, 0, 0, 'I')
        assertEquals(Clue('I', null, Dir.UP), d.clue(0, 0))
        d = MajorityYajilixAuthoring.setDir(d, 0, 0, Dir.RIGHT)
        assertEquals(Clue('I', null, Dir.RIGHT), d.clue(0, 0))
        assertNull(MajorityYajilixAuthoring.setKind(d, 0, 0, null).clue(0, 0))
        // A new clue on an empty cell via the arrow chip has no number either.
        assertEquals(Clue('L', null, Dir.LEFT), MajorityYajilixAuthoring.setDir(example, 0, 1, Dir.LEFT).clue(0, 1))
        // Yajilix's still starts at 0.
        assertEquals(Clue('L', 0, Dir.UP), YajilixAuthoring.setKind(example, 0, 0, 'L').clue(0, 0))
    }

    @Test
    fun problems() {
        val empty = YajilixEngine.Board(List(3) { List(3) { null } })
        assertEquals(listOf("No clues"), MajorityYajilixAuthoring.problems(empty))
        val off = MajorityYajilixAuthoring.setKind(empty, 0, 0, 'L') // L↑ on the top row
        assertEquals(listOf("L↑ at R1C1 has no cells in its direction"), MajorityYajilixAuthoring.problems(off))
        val ragged = YajilixEngine.Board(listOf(listOf(null, null), listOf(null)))
        assertEquals(listOf("Rows of cells differ in length"), MajorityYajilixAuthoring.formatProblems(ragged))
    }
}
