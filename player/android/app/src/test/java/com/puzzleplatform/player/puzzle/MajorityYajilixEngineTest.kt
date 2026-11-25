package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MajorityYajilixEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/majority-yajilix/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "p1",
        puzzleType = 47,
        puzzleTypeName = "majority-yajilix",
        puzzleTypeJpLabel = "多数派ヤジリックス",
        difficulty = 1,
        canonRepr = canon,
    )

    private fun solved(name: String): Map<String, Int> {
        val edges = json("$name.solution.json")["edges"] as JsonObject
        val out = HashMap<String, Int>()
        for ((kind, grid) in listOf("h" to edges["h"], "v" to edges["v"])) {
            (grid as JsonArray).forEachIndexed { r, row ->
                (row as JsonArray).forEachIndexed { c, x -> if ((x as JsonPrimitive).int == 1) out["$kind:$r,$c"] = 1 }
            }
        }
        return out
    }

    private val samples = listOf(
        "board-majority-yajilix-example", "board-majority-yajilix-1", "board-majority-yajilix-2", "board-majority-yajilix-3",
    )
    private val ex = puzzle(json("board-majority-yajilix-example.canon.json"))
    private val exBoard = MajorityYajilixEngine.parseBoard(ex)

    @Test
    fun registered() {
        assertEquals(MajorityYajilixEngine, PuzzleEngines.forType(47))
    }

    @Test
    fun parsesLetterOnlyClues() {
        assertEquals(YajilixEngine.Clue('X', null, YajilixEngine.Dir.RIGHT), exBoard.clue(1, 1))
        assertEquals("X→", exBoard.clue(1, 1)!!.label)
        assertNull(exBoard.clue(0, 0))
    }

    @Test
    fun samplesSolveAndRoundTrip() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = solved(name)
            assertTrue(name, MajorityYajilixEngine.isComplete(p, values))
            val withMark = values + ("m:0,0" to YajilixEngine.CROSS)
            val answer = MajorityYajilixEngine.extractAnswer(p, withMark)
            assertEquals(name, withMark, MajorityYajilixEngine.restoreUserValues(p, answer))
            assertEquals(json("$name.solution.json")["edges"], answer["edges"])
        }
    }

    @Test
    fun theClueClassMustBeAloneOnTop() {
        val values = solved("board-majority-yajilix-example")
        assertFalse(MajorityYajilixEngine.isComplete(ex, values - "h:0,0"))
        // A 2x2 ring over R1C3-R2C4: X→ at R2C2 then sees L 2, X 1.
        val ring = mapOf("h:0,2" to 1, "h:1,2" to 1, "v:0,2" to 1, "v:0,3" to 1)
        assertFalse(MajorityYajilixEngine.isComplete(ex, ring))
    }

    @Test
    fun liveValidation() {
        assertTrue(MajorityYajilixEngine.brokenClues(exBoard, emptyMap()).clues.isEmpty())
        assertTrue(MajorityYajilixEngine.brokenClues(exBoard, solved("board-majority-yajilix-example")).clues.isEmpty())
        // L↓ at R3C5 sees R4C5 and R5C5: one × leaves L at most tying X.
        assertTrue((2 to 4) in MajorityYajilixEngine.brokenClues(exBoard, mapOf("m:3,4" to YajilixEngine.CROSS)).clues)
    }

    @Test
    fun progressAndMarks() {
        assertEquals(0.0, MajorityYajilixEngine.computeProgress(ex, emptyMap()), 1e-9)
        // 21 empty cells; one ×.
        assertEquals(100.0 / 21, MajorityYajilixEngine.computeProgress(ex, mapOf("m:0,0" to 1)), 1e-9)
        assertNull(MajorityYajilixEngine.shadeGroup(ex, 1, 1))
    }
}
