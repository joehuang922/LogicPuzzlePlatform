package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.int
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class CountryRoadEngineTest {

    // Unit tests run from the app module directory.
    private fun json(path: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/country-road/$path").readText()) as JsonObject

    private fun puzzle(canon: JsonObject) = Puzzle(
        id = "p1",
        puzzleType = 41,
        puzzleTypeName = "country-road",
        puzzleTypeJpLabel = "カントリーロード",
        difficulty = 1,
        canonRepr = canon,
    )

    /** A sample's solution as userValues ("h:r,c" / "v:r,c" -> 1). */
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

    private val samples = listOf("board-country-road", "board-country-road-2", "board-country-road-3")
    private val ex = puzzle(json("board-country-road-example.canon.json"))
    // The doc's answer: the outer ring of the 3x3 example.
    private val ring = mapOf(
        "h:0,0" to 1, "h:0,1" to 1, "h:2,0" to 1, "h:2,1" to 1,
        "v:0,0" to 1, "v:1,0" to 1, "v:0,2" to 1, "v:1,2" to 1,
    )

    @Test
    fun registered() {
        assertEquals(CountryRoadEngine, PuzzleEngines.forType(41))
    }

    @Test
    fun samplesSolveAndRoundTrip() {
        for (name in samples) {
            val p = puzzle(json("$name.canon.json"))
            val values = solved(name)
            assertTrue(name, CountryRoadEngine.isComplete(p, values))
            assertEquals(name, values, CountryRoadEngine.restoreUserValues(p, CountryRoadEngine.extractAnswer(p, values)))
            val broken = values - values.keys.first()
            assertFalse(name, CountryRoadEngine.isComplete(p, broken))
        }
    }

    @Test
    fun exampleRules() {
        assertTrue(CountryRoadEngine.isComplete(ex, ring))
        // A 2x2 loop in the top-left room misses the other rooms.
        val small = mapOf("h:0,0" to 1, "h:1,0" to 1, "v:0,0" to 1, "v:0,1" to 1)
        assertFalse(CountryRoadEngine.isComplete(ex, small))
    }

    @Test
    fun marksRideTheShadeCycle() {
        assertEquals("m:1,2", CountryRoadEngine.cellKey(2, 1))
        assertEquals(mapOf("m:1,1" to CountryRoadEngine.CROSS), ShadeCycle.tap(CountryRoadEngine, ex, emptyMap(), 1, 1))
        assertEquals(
            mapOf("m:1,1" to CountryRoadEngine.DOT),
            ShadeCycle.tap(CountryRoadEngine, ex, mapOf("m:1,1" to CountryRoadEngine.CROSS), 1, 1),
        )
    }

    @Test
    fun extractAnswerMatchesWebShape() {
        val answer = CountryRoadEngine.extractAnswer(ex, ring + ("m:1,1" to 1))
        val edges = answer["edges"] as JsonObject
        assertEquals("[[1,1],[0,0],[1,1]]", edges["h"].toString())
        assertEquals("[[1,0,1],[1,0,1]]", edges["v"].toString())
        assertEquals("[[0,0,0],[0,1,0],[0,0,0]]", answer["marks"].toString())
    }

    @Test
    fun progressCountsDecidedCells() {
        assertEquals(0.0, CountryRoadEngine.computeProgress(ex, emptyMap()), 1e-9)
        assertEquals(100.0, CountryRoadEngine.computeProgress(ex, ring + ("m:1,1" to 1)), 1e-9)
        assertEquals(100.0 / 9, CountryRoadEngine.computeProgress(ex, mapOf("m:0,0" to 2)), 1e-9)
    }

    @Test
    fun brokenClues() {
        val board = CountryRoadEngine.parseBoard(ex)
        assertTrue(CountryRoadEngine.brokenClues(board, emptyMap()).numbers.isEmpty())
        val four = mapOf("h:0,0" to 1, "h:1,0" to 1, "v:0,0" to 1, "v:0,1" to 1)
        assertTrue((0 to 0) in CountryRoadEngine.brokenClues(board, four).numbers)
        val crosses = mapOf("m:0,2" to 1, "m:1,2" to 1)
        assertEquals(setOf(0 to 2, 1 to 2), CountryRoadEngine.brokenClues(board, crosses).crosses)
        val exits = mapOf("h:0,1" to 1, "h:1,1" to 1, "v:1,0" to 1)
        val topLeft = CountryRoadEngine.rooms(board).first[0][0]
        assertTrue(topLeft in CountryRoadEngine.brokenClues(board, exits).rooms)
    }
}
