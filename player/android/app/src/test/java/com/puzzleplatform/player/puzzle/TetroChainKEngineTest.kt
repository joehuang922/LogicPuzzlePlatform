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

class TetroChainKEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/tetro-chain-k/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "p1",
        puzzleType = 50,
        puzzleTypeName = "tetro-chain-k",
        puzzleTypeJpLabel = "テトロチェーンK",
        difficulty = 1,
        canonRepr = canon,
    )

    private fun solved(name: String): Map<String, Int> {
        val out = HashMap<String, Int>()
        (json("$name.solution.json")["cells"] as JsonArray).forEachIndexed { r, row ->
            (row as JsonArray).forEachIndexed { c, x -> if ((x as JsonPrimitive).int == 1) out["$c,$r"] = 1 }
        }
        return out
    }

    private val samples = listOf(
        "board-tetro-chain-k-example", "board-tetro-chain-k-1", "board-tetro-chain-k-2",
        "board-tetro-chain-k-3", "board-tetro-chain-k-4",
    )
    private val ex = puzzle(json("board-tetro-chain-k-example.canon.json"))
    private val exBoard = TetroChainKEngine.parseBoard(ex)

    @Test
    fun registered() {
        assertEquals(TetroChainKEngine, PuzzleEngines.forType(50))
    }

    @Test
    fun samplesSolveAndRoundTrip() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = solved(name)
            assertTrue(name, TetroChainKEngine.isComplete(p, values))
            val withDot = if ("0,0" in values) values else values + ("0,0" to TetroChainKEngine.DOT)
            assertEquals(name, withDot, TetroChainKEngine.restoreUserValues(p, TetroChainKEngine.extractAnswer(p, withDot)))
        }
    }

    @Test
    fun shapes() {
        assertEquals('I', TetroChainKEngine.shapeOf(listOf(0 to 0, 1 to 0, 2 to 0, 3 to 0)))
        assertEquals('O', TetroChainKEngine.shapeOf(listOf(0 to 0, 0 to 1, 1 to 0, 1 to 1)))
        assertEquals('T', TetroChainKEngine.shapeOf(listOf(0 to 1, 1 to 0, 1 to 1, 1 to 2)))
        assertEquals('L', TetroChainKEngine.shapeOf(listOf(0 to 0, 0 to 1, 0 to 2, 1 to 0)))
        assertEquals('S', TetroChainKEngine.shapeOf(listOf(0 to 0, 1 to 0, 1 to 1, 2 to 1)))
        assertNull(TetroChainKEngine.shapeOf(listOf(0 to 0, 0 to 1)))
    }

    @Test
    fun twinTsTouchingIsIncomplete() {
        val values = solved("board-tetro-chain-k-example")
        assertFalse(TetroChainKEngine.isComplete(ex, emptyMap()))
        // The other finish: a T bottom-right, corner to corner with the top T.
        val twin = values - "3,4" + ("4,4" to 1)
        assertFalse(TetroChainKEngine.isComplete(ex, twin))
        val broken = TetroChainKEngine.brokenClues(exBoard, twin)
        assertTrue((4 to 4) in broken.cells && (0 to 2) in broken.cells)
    }

    @Test
    fun liveValidation() {
        val clean = TetroChainKEngine.brokenClues(exBoard, solved("board-tetro-chain-k-example"))
        assertTrue(clean.circles.isEmpty() && clean.cells.isEmpty())
        // Three dots at the black corner circle (index 0) leave at most one shaded.
        val dots = mapOf("1,0" to 2, "2,0" to 2, "1,1" to 2)
        assertTrue(0 in TetroChainKEngine.brokenClues(exBoard, dots).circles)
        // A shaded corner boxed in by dots can't grow.
        val stuck = mapOf("0,0" to 1, "1,0" to 2, "0,1" to 2)
        assertTrue((0 to 0) in TetroChainKEngine.brokenClues(exBoard, stuck).cells)
    }

    @Test
    fun progress() {
        assertEquals(0.0, TetroChainKEngine.computeProgress(ex, emptyMap()), 1e-9)
        assertEquals(200.0 / 25, TetroChainKEngine.computeProgress(ex, mapOf("0,0" to 1, "1,0" to 2)), 1e-9)
        assertEquals(mapOf("0,0" to 1), ShadeCycle.tap(TetroChainKEngine, ex, emptyMap(), 0, 0))
    }
}
