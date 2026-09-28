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

class MasyuEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "m1",
        puzzleType = 7,
        puzzleTypeName = "masyu",
        puzzleTypeJpLabel = "ましゅ",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 4x4 board. Black circle at (0,0), white circle at (0,2); the intended
    // solution is the rectangle loop around the whole perimeter.
    //   (0,0) black: corner turn with straight segments both sides -> ok
    //   (0,2) white: straight through, and neighbor (0,3) turns -> ok
    private val canon4x4 = """{"cells":[
        [2,0,1,0],
        [0,0,0,0],
        [0,0,0,0],
        [0,0,0,0]
    ]}"""

    // The perimeter loop, as flat "h:r,c" / "v:r,c" -> 1 edges.
    private val perimeter = buildMap {
        // top + bottom edges (horizontal segments)
        for (c in 0..2) { put("h:0,$c", 1); put("h:3,$c", 1) }
        // left + right edges (vertical segments)
        for (r in 0..2) { put("v:$r,0", 1); put("v:$r,3", 1) }
    }

    // -- parseCells ---------------------------------------------------------

    @Test
    fun parseCells_readsCircles() {
        val cells = MasyuEngine.parseCells(puzzle(canon4x4))
        assertEquals(4, cells.size)
        assertEquals(MasyuEngine.BLACK, cells[0][0])
        assertEquals(MasyuEngine.WHITE, cells[0][2])
        assertEquals(MasyuEngine.EMPTY, cells[1][1])
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_buildsHVGridsOfCorrectShape() {
        val answer = MasyuEngine.extractAnswer(puzzle(canon4x4), perimeter)
        val edges = answer["edges"]!!.jsonObject
        val h = (edges["h"] as JsonArray).map { it.jsonArray }
        val v = (edges["v"] as JsonArray).map { it.jsonArray }
        assertEquals(4, h.size)      // rows
        assertEquals(3, h[0].size)   // cols - 1
        assertEquals(3, v.size)      // rows - 1
        assertEquals(4, v[0].size)   // cols
        // Top edge drawn, an interior horizontal not.
        assertEquals(1, h[0][0].jsonPrimitive.int)
        assertEquals(0, h[1][1].jsonPrimitive.int)
        // Left + right verticals drawn.
        assertEquals(1, v[0][0].jsonPrimitive.int)
        assertEquals(1, v[0][3].jsonPrimitive.int)
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon4x4)
        val answer = MasyuEngine.extractAnswer(p, perimeter)
        assertEquals(perimeter, MasyuEngine.restoreUserValues(p, answer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_isAlwaysZero() {
        val p = puzzle(canon4x4)
        assertEquals(0.0, MasyuEngine.computeProgress(p, emptyMap()), 0.0)
        assertEquals(0.0, MasyuEngine.computeProgress(p, perimeter), 0.0)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidPerimeterLoop() {
        assertTrue(MasyuEngine.isComplete(puzzle(canon4x4), perimeter))
    }

    @Test
    fun isComplete_falseForEmptyBoard() {
        assertFalse(MasyuEngine.isComplete(puzzle(canon4x4), emptyMap()))
    }

    @Test
    fun isComplete_falseForOpenLoop() {
        // Remove one segment: cells at that gap drop to degree 1 -> not all 0/2.
        assertFalse(MasyuEngine.isComplete(puzzle(canon4x4), perimeter - "h:0,0"))
    }

    @Test
    fun isComplete_falseWhenWhiteCircleSitsOnATurn() {
        // White circle at the corner (0,0): the perimeter loop turns there, but a
        // white circle must be passed straight through -> not a valid solution.
        val whiteCorner = """{"cells":[
            [1,0,0,0],
            [0,0,0,0],
            [0,0,0,0],
            [0,0,0,0]
        ]}"""
        assertFalse(MasyuEngine.isComplete(puzzle(whiteCorner), perimeter))
    }

    @Test
    fun isComplete_falseWhenBlackCircleSitsOnAStraight() {
        // Black circle at (0,1) on the top edge: the perimeter passes straight
        // through, but a black circle must be a turn -> not a valid solution.
        val blackStraight = """{"cells":[
            [0,2,0,0],
            [0,0,0,0],
            [0,0,0,0],
            [0,0,0,0]
        ]}"""
        assertFalse(MasyuEngine.isComplete(puzzle(blackStraight), perimeter))
    }

    // -- analyze (live validation) -----------------------------------------

    @Test
    fun analyze_cleanForEmptyBoardAndSolvedLoop() {
        val p = puzzle(canon4x4)
        val empty = MasyuEngine.analyze(p, emptyMap())
        assertTrue(empty.circleErrors.isEmpty())
        assertTrue(empty.loopSegments.isEmpty())
        val solved = MasyuEngine.analyze(p, perimeter)
        assertTrue(solved.circleErrors.isEmpty())
        assertTrue(solved.loopSegments.isEmpty())
    }

    @Test
    fun analyze_flagsPrematureLoopThatMissesCircles() {
        // A small closed loop among the interior cells, leaving both circles uncovered.
        val innerLoop = mapOf(
            "h:1,1" to 1, "h:2,1" to 1, // top + bottom of the 2x2 at (1,1)..(2,2)
            "v:1,1" to 1, "v:1,2" to 1, // left + right
        )
        val a = MasyuEngine.analyze(puzzle(canon4x4), innerLoop)
        assertEquals(
            setOf("h:1,1", "h:2,1", "v:1,1", "v:1,2"),
            a.loopSegments,
        )
    }

    @Test
    fun analyze_flagsWhiteCircleForcedToTurn() {
        // White circle at (0,2) with a right+down bend -> not straight -> error.
        val bent = mapOf("h:0,2" to 1, "v:0,2" to 1)
        val a = MasyuEngine.analyze(puzzle(canon4x4), bent)
        assertTrue(a.circleErrors.contains("0,2"))
    }

    @Test
    fun analyze_flagsBranchAtCircle() {
        // A white circle in the middle of the top row with three segments meeting
        // it (left, right, down) is a branch (degree 3) -> a certain violation.
        val branchCanon = """{"cells":[
            [0,0,1,0],
            [0,0,0,0],
            [0,0,0,0],
            [0,0,0,0]
        ]}"""
        val branch = mapOf("h:0,1" to 1, "h:0,2" to 1, "v:0,2" to 1) // left+right+down at (0,2)
        val a = MasyuEngine.analyze(puzzle(branchCanon), branch)
        assertTrue(a.circleErrors.contains("0,2"))
    }

    // -- ragged / missing tolerance ----------------------------------------

    @Test
    fun missingCellsKey_yieldsEmptyAndNotComplete() {
        val p = puzzle("""{}""")
        assertTrue(MasyuEngine.parseCells(p).isEmpty())
        assertFalse(MasyuEngine.isComplete(p, emptyMap()))
        assertTrue(MasyuEngine.analyze(p, emptyMap()).circleErrors.isEmpty())
    }
}
