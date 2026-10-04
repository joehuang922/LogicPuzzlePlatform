package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FillominoEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "f1",
        puzzleType = 14,
        puzzleTypeName = "fillomino",
        puzzleTypeJpLabel = "フィルオミノ",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 2x3 board with three clues. The intended solution is
    //   2 2 1
    //   3 3 3
    // giving a size-2 room {(0,0),(0,1)}, a size-1 room {(0,2)}, and a size-3
    // room filling the bottom row.
    private val canon2x3 = """{"cells":[
        [2,0,1],
        [0,3,0]
    ]}"""

    // The solved input: the two player-entered numbers + the walls that carve the
    // three rooms. Keys match the web board exactly ("c:col,row", "h:r,c", "v:r,c").
    private val solved = mapOf(
        "c:1,0" to 2,            // (row0,col1) completes the size-2 room
        "c:0,1" to 3,            // (row1,col0)
        "c:2,1" to 3,            // (row1,col2)
        "h:0,0" to 1,            // walls separating the top row from the bottom row
        "h:0,1" to 1,
        "h:0,2" to 1,
        "v:0,1" to 1,            // wall between the size-2 and size-1 rooms
    )

    // -- parseCells ---------------------------------------------------------

    @Test
    fun parseCells_readsClues() {
        val cells = FillominoEngine.parseCells(puzzle(canon2x3))
        assertEquals(2, cells.size)
        assertEquals(listOf(2, 0, 1), cells[0])
        assertEquals(listOf(0, 3, 0), cells[1])
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_mergesCluesAndBuildsWallGrids() {
        val answer = FillominoEngine.extractAnswer(puzzle(canon2x3), solved)

        val numbers = (answer["numbers"] as JsonArray).map { it.jsonArray }
        assertEquals(2, numbers.size)
        assertEquals(3, numbers[0].size)
        // Clues merged with the player's entries into the full grid.
        assertEquals(listOf(2, 2, 1), numbers[0].map { it.jsonPrimitive.int })
        assertEquals(listOf(3, 3, 3), numbers[1].map { it.jsonPrimitive.int })

        val edges = answer["edges"]!!.jsonObject
        val h = (edges["h"] as JsonArray).map { it.jsonArray }
        val v = (edges["v"] as JsonArray).map { it.jsonArray }
        assertEquals(1, h.size)      // rows - 1
        assertEquals(3, h[0].size)   // cols
        assertEquals(2, v.size)      // rows
        assertEquals(2, v[0].size)   // cols - 1
        assertEquals(listOf(1, 1, 1), h[0].map { it.jsonPrimitive.int })
        assertEquals(listOf(0, 1), v[0].map { it.jsonPrimitive.int })
        assertEquals(listOf(0, 0), v[1].map { it.jsonPrimitive.int })
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon2x3)
        val answer = FillominoEngine.extractAnswer(p, solved)
        // Clue cells are not player input, so they must not reappear as "c:" entries.
        assertEquals(solved, FillominoEngine.restoreUserValues(p, answer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForEmptyBoard() {
        assertEquals(0.0, FillominoEngine.computeProgress(puzzle(canon2x3), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_countsFilledEmptyCellsOnly() {
        // One of the three empty cells filled -> 1/3.
        val partial = mapOf("c:1,0" to 2)
        assertEquals(100.0 / 3.0, FillominoEngine.computeProgress(puzzle(canon2x3), partial), 1e-9)
    }

    @Test
    fun computeProgress_hundredWhenAllEmptyCellsFilled() {
        assertEquals(100.0, FillominoEngine.computeProgress(puzzle(canon2x3), solved), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidSolution() {
        assertTrue(FillominoEngine.isComplete(puzzle(canon2x3), solved))
    }

    @Test
    fun isComplete_falseWhenACellIsUnfilled() {
        val missingNumber = solved - "c:2,1"
        assertFalse(FillominoEngine.isComplete(puzzle(canon2x3), missingNumber))
    }

    @Test
    fun isComplete_falseWhenNoWalls() {
        // Fill every cell to the "right" numbers but draw no walls: the whole grid is
        // one room, so sizes can't match and there's no wall -> not solved.
        val noWalls = mapOf("c:1,0" to 2, "c:0,1" to 3, "c:2,1" to 3)
        assertFalse(FillominoEngine.isComplete(puzzle(canon2x3), noWalls))
    }

    @Test
    fun isComplete_falseWhenRoomSizeMismatchesNumber() {
        // Drop the vertical wall: the size-2 and size-1 rooms merge into a size-3 room
        // on the top row, but its cells read 2,2,1 -> no cell equals 3.
        val merged = solved - "v:0,1"
        assertFalse(FillominoEngine.isComplete(puzzle(canon2x3), merged))
    }

    @Test
    fun isComplete_falseForAdjacentRoomsWithSameNumber() {
        // 1x4 strip: two size-2 rooms side by side (2 2 | 2 2). All sizes match their
        // numbers, but the two rooms share the number 2 across the wall -> invalid.
        val strip = puzzle("""{"cells":[[0,0,0,0]]}""")
        val input = mapOf(
            "c:0,0" to 2, "c:1,0" to 2, "c:2,0" to 2, "c:3,0" to 2,
            "v:0,1" to 1, // wall between col1 and col2 splits into {0,1} and {2,3}
        )
        assertFalse(FillominoEngine.isComplete(strip, input))
    }
}
