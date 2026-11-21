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

class TilePaintEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/tile-paint/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "p1",
        puzzleType = 40,
        puzzleTypeName = "tile-paint",
        puzzleTypeJpLabel = "タイルペイント",
        difficulty = 1,
        canonRepr = canon,
    )

    /** The sample's solution as userValues: shaded 1, every other tile cell marked 2. */
    private fun solved(name: String, p: Puzzle): Map<String, Int> {
        val board = TilePaintEngine.parseBoard(p)
        val shaded = json("$name.solution.json")["shaded"] as JsonArray
        val out = HashMap<String, Int>()
        shaded.forEachIndexed { r, row ->
            (row as JsonArray).forEachIndexed { c, v ->
                if (board.isTile(r, c)) out["$c,$r"] = if ((v as JsonPrimitive).int == 1) 1 else 2
            }
        }
        return out
    }

    private val samples = listOf("example", "small", "medium", "big").map { "board-tile-paint-$it" }
    private val ex = puzzle(json("board-tile-paint-example.canon.json"))

    @Test
    fun registered() {
        assertEquals(TilePaintEngine, PuzzleEngines.forType(40))
    }

    @Test
    fun samples_solveAndRoundTrip() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = solved(name, p)
            assertTrue(name, TilePaintEngine.isComplete(p, values))
            assertEquals(name, 100.0, TilePaintEngine.computeProgress(p, values), 1e-9)
            val answer = TilePaintEngine.extractAnswer(p, values)
            assertEquals(name, values, TilePaintEngine.restoreUserValues(p, answer))
            val wrong = values.toMutableMap()
            val key = values.entries.first { it.value == 1 }.key
            wrong[key] = 2
            assertFalse(name, TilePaintEngine.isComplete(p, wrong))
        }
    }

    @Test
    fun tilesAndShadeGroup() {
        val board = TilePaintEngine.parseBoard(ex)
        val (ids, count) = TilePaintEngine.tiles(board)
        assertEquals(12, count)
        assertEquals(-1, ids[0][0])
        assertEquals(ids[1][2], ids[2][2])
        assertNull(TilePaintEngine.shadeGroup(ex, 0, 0)) // a clue cell takes no input
        assertEquals(setOf(2 to 1, 2 to 2), TilePaintEngine.shadeGroup(ex, 2, 1)!!.cells.toSet())
        // A tap cycles the whole tile through the shared rule.
        val changes = ShadeCycle.tap(TilePaintEngine, ex, emptyMap(), 2, 2)
        assertEquals(mapOf("2,1" to 1, "2,2" to 1), changes)
    }

    @Test
    fun progressCountsTiles() {
        assertEquals(0.0, TilePaintEngine.computeProgress(ex, emptyMap()), 1e-9)
        val oneTile = mapOf("2,1" to 1, "2,2" to 1)
        assertEquals(100.0 / 12, TilePaintEngine.computeProgress(ex, oneTile), 1e-9)
        assertEquals(100.0 / 12, TilePaintEngine.computeProgress(ex, mapOf("4,1" to 2)), 1e-9)
    }

    @Test
    fun extractAnswer_matchesWebShape() {
        val answer = TilePaintEngine.extractAnswer(ex, mapOf("2,1" to 1, "2,2" to 1, "0,0" to 1, "4,4" to 2))
        val states = answer["states"] as JsonArray
        assertEquals(5, states.size)
        assertEquals("[0,0,0,0,0]", states[0].toString()) // a value on a clue cell is dropped
        assertEquals("[0,0,1,0,0]", states[1].toString())
        assertEquals("[0,0,0,0,2]", states[4].toString())
    }

    @Test
    fun brokenClues() {
        val board = TilePaintEngine.parseBoard(ex)
        assertTrue(TilePaintEngine.brokenClues(board, emptyMap()).isEmpty())
        // Row 1 wants 1: two shaded cells break it.
        val over = mapOf("1,1" to 1, "2,1" to 1)
        assertTrue(Triple(1, 0, true) in TilePaintEngine.brokenClues(board, over))
        // Column 2 wants 4: one marked cell leaves too few.
        val under = mapOf("2,1" to 2)
        assertTrue(Triple(0, 2, false) in TilePaintEngine.brokenClues(board, under))
    }

    @Test
    fun pictureAndThumbnail() {
        val values = solved("board-tile-paint-example", ex)
        val board = TilePaintEngine.parseBoard(ex)
        val (cells, rows, cols) = TilePaintEngine.pictureCells(board, values)
        assertEquals(4 to 4, rows to cols)
        assertEquals(TilePaintEngine.FILL_ARGB, cells[1]) // (1,2) shaded
        assertEquals(TilePaintEngine.MARK_ARGB, cells[0])
        val thumb = TilePaintEngine.renderThumbnail(ex, TilePaintEngine.extractAnswer(ex, values))!!
        assertEquals(4, thumb.width)
        assertEquals(4, thumb.height)
        assertEquals(8, thumb.cells.count { it == TilePaintEngine.FILL_ARGB })
        // Undecided cells are ground in the live preview.
        assertEquals(TilePaintEngine.GROUND_ARGB, TilePaintEngine.pictureCells(board, emptyMap()).first[0])
    }
}
