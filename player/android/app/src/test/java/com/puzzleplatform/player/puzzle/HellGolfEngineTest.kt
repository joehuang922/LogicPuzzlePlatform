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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HellGolfEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "hg1",
        puzzleType = 19,
        puzzleTypeName = "hell-golf",
        puzzleTypeJpLabel = "ヘルゴルフ",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 1x5 board, no lakes. One ball n=2 at (0,0); one goal at (0,2).
    // Moving right 2 lands exactly on the goal -> a one-move solve.
    private val canon1x5 = """{
        "lakes": [[0,0,0,0,0]],
        "balls": [{"r":0,"c":0,"n":2}],
        "goals": [[0,2]]
    }"""

    // The single stop that solves canon1x5: ball 0, step 1 -> cell (0,2).
    // encode(0,2,cols=5) = 0*5 + 2 + 1 = 3.
    private val solved1x5 = mapOf(HellGolfEngine.stepKey(0, 1) to 3)

    // 3x3, lake at the center (1,1). Ball n=2 at (0,0), goal at (0,2) and (2,0).
    private val canon3x3 = """{
        "lakes": [[0,0,0],[0,1,0],[0,0,0]],
        "balls": [{"r":0,"c":0,"n":2},{"r":2,"c":2,"n":2}],
        "goals": [[0,2],[2,0]]
    }"""

    // -- parseCanon ---------------------------------------------------------

    @Test
    fun parseCanon_readsDimsBallsGoals() {
        val canon = HellGolfEngine.parseCanon(puzzle(canon1x5))
        assertEquals(1, canon.rows)
        assertEquals(5, canon.cols)
        assertEquals(1, canon.balls.size)
        assertEquals(HellGolfEngine.Ball(0, 0, 2), canon.balls[0])
        assertEquals(setOf("0,2"), canon.goalKeys)
    }

    @Test
    fun parseCanon_toleratesMissingKeys() {
        val canon = HellGolfEngine.parseCanon(puzzle("""{}"""))
        assertEquals(0, canon.rows)
        assertEquals(0, canon.cols)
        assertTrue(canon.balls.isEmpty())
        assertTrue(canon.goals.isEmpty())
    }

    // -- trailsFrom / currentNumber -----------------------------------------

    @Test
    fun trailsFrom_startsAtOriginAndAppendsStopsInOrder() {
        val canon = HellGolfEngine.parseCanon(puzzle(canon1x5))
        val trails = HellGolfEngine.trailsFrom(canon, solved1x5)
        assertEquals(listOf(HellGolfEngine.Cell(0, 0), HellGolfEngine.Cell(0, 2)), trails[0])
        // One move made -> number drops from 2 to 1.
        assertEquals(1, HellGolfEngine.currentNumber(canon, trails, 0))
    }

    @Test
    fun trailsFrom_emptyValues_isJustTheOrigin() {
        val canon = HellGolfEngine.parseCanon(puzzle(canon1x5))
        val trails = HellGolfEngine.trailsFrom(canon, emptyMap())
        assertEquals(listOf(HellGolfEngine.Cell(0, 0)), trails[0])
        assertEquals(2, HellGolfEngine.currentNumber(canon, trails, 0))
    }

    // -- tryMove / reachable ------------------------------------------------

    @Test
    fun reachable_offersExactLengthStraightMove() {
        val canon = HellGolfEngine.parseCanon(puzzle(canon1x5))
        val trails = HellGolfEngine.trailsFrom(canon, emptyMap())
        // From (0,0) with n=2, the only legal landing is (0,2) — right 2.
        assertEquals(listOf(HellGolfEngine.Cell(0, 2)), HellGolfEngine.reachable(canon, trails, 0))
    }

    @Test
    fun tryMove_cannotStopOnLake() {
        // 3x3 ball at (0,0) n=1 would stop on the center lake moving diagonally — but
        // moves are orthogonal, so test a 1x3 with a lake landing cell instead.
        val canon = HellGolfEngine.parseCanon(
            puzzle("""{"lakes":[[0,1,0]],"balls":[{"r":0,"c":0,"n":1}],"goals":[[0,2]]}"""),
        )
        val trails = HellGolfEngine.trailsFrom(canon, emptyMap())
        // Right 1 lands on the lake at (0,1) -> illegal.
        assertNull(HellGolfEngine.tryMove(canon, trails, 0, 0, 1))
    }

    @Test
    fun tryMove_maySlideOverALakeButNotStop() {
        // Lake at (0,1); ball n=2 slides over it and stops on (0,2) -> legal.
        val canon = HellGolfEngine.parseCanon(
            puzzle("""{"lakes":[[0,1,0]],"balls":[{"r":0,"c":0,"n":2}],"goals":[[0,2]]}"""),
        )
        val trails = HellGolfEngine.trailsFrom(canon, emptyMap())
        assertEquals(HellGolfEngine.Cell(0, 2), HellGolfEngine.tryMove(canon, trails, 0, 0, 1))
    }

    @Test
    fun tryMove_cannotLeaveTheBoard() {
        val canon = HellGolfEngine.parseCanon(puzzle(canon1x5))
        val trails = HellGolfEngine.trailsFrom(canon, emptyMap())
        // Up/down/left all leave the 1x5 board from (0,0).
        assertNull(HellGolfEngine.tryMove(canon, trails, 0, -1, 0))
        assertNull(HellGolfEngine.tryMove(canon, trails, 0, 1, 0))
        assertNull(HellGolfEngine.tryMove(canon, trails, 0, 0, -1))
    }

    // -- extractAnswer / restore round-trip ---------------------------------

    @Test
    fun extractAnswer_buildsTrailsWithOriginFirst() {
        val answer = HellGolfEngine.extractAnswer(puzzle(canon1x5), solved1x5)
        val trails = answer["trails"]!!.jsonArray
        assertEquals(1, trails.size)
        val path = trails[0].jsonObject["path"]!!.jsonArray
        assertEquals(2, path.size)
        assertEquals(listOf(0, 0), path[0].jsonArray.map { it.jsonPrimitive.int })
        assertEquals(listOf(0, 2), path[1].jsonArray.map { it.jsonPrimitive.int })
    }

    @Test
    fun extractAnswer_unmovedBallIsLengthOnePath() {
        val answer = HellGolfEngine.extractAnswer(puzzle(canon1x5), emptyMap())
        val path = answer["trails"]!!.jsonArray[0].jsonObject["path"]!!.jsonArray
        assertEquals(1, path.size)
        assertEquals(listOf(0, 0), path[0].jsonArray.map { it.jsonPrimitive.int })
    }

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon1x5)
        val answer = HellGolfEngine.extractAnswer(p, solved1x5)
        assertEquals(solved1x5, HellGolfEngine.restoreUserValues(p, answer))
    }

    @Test
    fun restore_emptyForUnmovedBalls() {
        val p = puzzle(canon1x5)
        val answer = HellGolfEngine.extractAnswer(p, emptyMap())
        assertEquals(emptyMap<String, Int>(), HellGolfEngine.restoreUserValues(p, answer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForUnmovedBalls() {
        assertEquals(0.0, HellGolfEngine.computeProgress(puzzle(canon1x5), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_hundredWhenBallOnGoal() {
        assertEquals(100.0, HellGolfEngine.computeProgress(puzzle(canon1x5), solved1x5), 1e-9)
    }

    @Test
    fun computeProgress_countsBallsOnGoals() {
        // 3x3, two balls. Move ball 0 right 2 -> lands on goal (0,2). Ball 1 unmoved.
        // encode(0,2,cols=3) = 0*3 + 2 + 1 = 3.
        val oneDone = mapOf(HellGolfEngine.stepKey(0, 1) to 3)
        assertEquals(50.0, HellGolfEngine.computeProgress(puzzle(canon3x3), oneDone), 1e-9)
    }

    @Test
    fun computeProgress_zeroWhenNoBalls() {
        val noBalls = """{"lakes":[[0,0]],"balls":[],"goals":[]}"""
        assertEquals(0.0, HellGolfEngine.computeProgress(puzzle(noBalls), emptyMap()), 0.0)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueWhenBallRestsOnGoal() {
        assertTrue(HellGolfEngine.isComplete(puzzle(canon1x5), solved1x5))
    }

    @Test
    fun isComplete_falseForUnmovedBall() {
        assertFalse(HellGolfEngine.isComplete(puzzle(canon1x5), emptyMap()))
    }

    @Test
    fun isComplete_falseWhenTwoBallsShareOneGoal() {
        // Both balls end on goal (0,2): not a bijection even though every head is a goal.
        // 1x5, two balls both able to reach (0,2): ball A n=2 at (0,0), ball B n=1 at (0,1).
        val canon = """{
            "lakes": [[0,0,0,0,0]],
            "balls": [{"r":0,"c":0,"n":2},{"r":0,"c":1,"n":1}],
            "goals": [[0,2],[0,4]]
        }"""
        // encode(0,2,cols=5) = 3. Both balls' last stop is (0,2).
        val both = mapOf(
            HellGolfEngine.stepKey(0, 1) to 3,
            HellGolfEngine.stepKey(1, 1) to 3,
        )
        assertFalse(HellGolfEngine.isComplete(puzzle(canon), both))
    }

    @Test
    fun isComplete_falseWhenNotAllGoalsUsed() {
        // Two goals, only one ball on a goal.
        val oneDone = mapOf(HellGolfEngine.stepKey(0, 1) to 3)
        assertFalse(HellGolfEngine.isComplete(puzzle(canon3x3), oneDone))
    }

    @Test
    fun isComplete_falseWhenNoBalls() {
        val noBalls = """{"lakes":[[0,0]],"balls":[],"goals":[]}"""
        assertFalse(HellGolfEngine.isComplete(puzzle(noBalls), emptyMap()))
    }
}
