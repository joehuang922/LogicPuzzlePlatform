package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.puzzle.HashiRules.Point
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors frontend/src/components/hashiRules.test.ts. */
class HashiEngineTest {

    private fun puzzle(cells: String): Puzzle = Puzzle(
        id = "hashi",
        puzzleType = 34,
        puzzleTypeName = "hashi",
        puzzleTypeJpLabel = "橋をかけろ",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement("""{"cells":$cells}""") as JsonObject,
    )

    // Four 2s on the corners of a 3x3 lattice: a ring of single bridges.
    private val square = puzzle("[[2,0,2],[0,0,0],[2,0,2]]")
    private val cells = HashiEngine.parseCells(square)
    private val tl = Point(0, 0)
    private val tr = Point(0, 2)
    private val bl = Point(2, 0)
    private val br = Point(2, 2)

    private fun bridges(values: Map<String, Int>) = HashiRules.bridges(3, 3, values)

    @Test
    fun findsTheNearestIslandAlongALine() {
        assertEquals(tr, HashiRules.neighbour(cells, tl, 0, 1))
        assertEquals(bl, HashiRules.neighbour(cells, tl, 1, 0))
        assertEquals(null, HashiRules.neighbour(cells, tl, -1, 0))
    }

    @Test
    fun aBridgeFillsEverySegment() {
        assertEquals(mapOf("h:0,0" to 2, "h:0,1" to 2), HashiRules.bridgeChanges(tl, tr, 2))
        assertEquals(mapOf("v:0,2" to 1, "v:1,2" to 1), HashiRules.bridgeChanges(br, tr, 1))
    }

    @Test
    fun acceptsTheRingOfSingleBridges() {
        val ring = HashiRules.bridgeChanges(tl, tr, 1) + HashiRules.bridgeChanges(bl, br, 1) +
            HashiRules.bridgeChanges(tl, bl, 1) + HashiRules.bridgeChanges(tr, br, 1)
        assertTrue(HashiEngine.isComplete(square, ring))
        assertEquals(100.0, HashiEngine.computeProgress(square, ring), 1e-9)
    }

    @Test
    fun rejectsTwoDisconnectedDoubleBridges() {
        val split = HashiRules.bridgeChanges(tl, tr, 2) + HashiRules.bridgeChanges(bl, br, 2)
        assertEquals(100.0, HashiEngine.computeProgress(square, split), 1e-9)
        assertFalse(HashiEngine.isComplete(square, split))
    }

    @Test
    fun aDragCyclesTheBridgeAndRefusesCrossings() {
        var values = emptyMap<String, Int>()
        repeat(2) { values = values + HashiRules.cycleBridge(cells, bridges(values), tl, tr) }
        assertEquals(2, HashiRules.bridgeCount(bridges(values), tl, tr))
        values = (values + HashiRules.cycleBridge(cells, bridges(values), tl, tr)).filterValues { it != 0 }
        assertEquals(emptyMap<String, Int>(), values)

        val plus = HashiEngine.parseCells(puzzle("[[0,1,0],[1,0,1],[0,1,0]]"))
        val across = HashiRules.bridgeChanges(Point(1, 0), Point(1, 2), 1)
        assertEquals(emptyMap<String, Int>(), HashiRules.cycleBridge(plus, bridges(across), Point(0, 1), Point(2, 1)))
        assertFalse(HashiRules.isSolved(plus, bridges(across + HashiRules.bridgeChanges(Point(0, 1), Point(2, 1), 1))))
    }

    @Test
    fun islandStates() {
        val b = bridges(HashiRules.bridgeChanges(tl, tr, 2))
        assertEquals(HashiRules.IslandState.DONE, HashiRules.islandState(cells, b, 0, 0))
        val over = bridges(HashiRules.bridgeChanges(tl, tr, 2) + HashiRules.bridgeChanges(tl, bl, 1))
        assertEquals(HashiRules.IslandState.OVER, HashiRules.islandState(cells, over, 0, 0))
        assertEquals(HashiRules.IslandState.OPEN, HashiRules.islandState(cells, over, 2, 2))
        assertEquals(50.0, HashiEngine.computeProgress(square, HashiRules.bridgeChanges(tl, tr, 2)), 1e-9)
    }

    @Test
    fun answerRoundTripsKeepingDoubleBridges() {
        val values = HashiRules.bridgeChanges(tl, tr, 2) + HashiRules.bridgeChanges(tr, br, 1)
        val answer = HashiEngine.extractAnswer(square, values)
        assertEquals(
            """{"bridges":{"h":[[2,2],[0,0],[0,0]],"v":[[0,0,1],[0,0,1]]}}""",
            answer.toString(),
        )
        assertEquals(values, HashiEngine.restoreUserValues(square, answer))
    }
}
