package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

class HellGolfAuthoringTest {

    private fun json(s: String) = Json.parseToJsonElement(s) as JsonObject

    private val canon = json(
        """{"lakes":[[0,1,1,0],[0,0,0,0],[0,0,0,0]],"balls":[{"r":0,"c":0,"n":2},{"r":2,"c":3,"n":1}],"goals":[[1,2],[2,0]]}""",
    )

    @Test
    fun canonRoundTripsThroughBoardDraft() {
        val board = BoardDraft.fromCanon(AuthoringType.HELL_GOLF, canon)
        assertEquals(BoardDraft(hellGolf = board.hellGolf), board)
        assertEquals(2, board.hellGolf.cellAt(0, 0))
        assertEquals(HellGolfAuthoring.LAKE, board.hellGolf.cellAt(1, 0))
        assertEquals(HellGolfAuthoring.GOAL, board.hellGolf.cellAt(2, 1))
        assertEquals(CanonBoard(canon, 4, 3), board.toCanon(AuthoringType.HELL_GOLF))
        assertEquals(19, HellGolfAuthoring.previewPuzzle(board.hellGolf).puzzleType)
    }

    @Test
    fun cleanBoardHasNoProblems() {
        assertEquals(emptyList<String>(), HellGolfAuthoring.problems(HellGolfAuthoring.draftFromCanon(canon)))
        assertEquals(emptyList<String>(), BoardDraft.fromCanon(AuthoringType.HELL_GOLF, canon).formatProblems(AuthoringType.HELL_GOLF))
    }

    @Test
    fun setClueSwitchesBetweenBallLakeAndGoal() {
        var d = HellGolfAuthoring.draftFromCanon(canon)
        d = HellGolfAuthoring.setClue(d, col = 0, row = 0, clue = HellGolfAuthoring.LAKE)
        assertEquals(HellGolfAuthoring.LAKE, d.cellAt(0, 0))
        d = HellGolfAuthoring.setClue(d, col = 0, row = 0, clue = HellGolfAuthoring.GOAL)
        assertEquals(HellGolfAuthoring.GOAL, d.cellAt(0, 0))
        d = HellGolfAuthoring.setClue(d, col = 0, row = 0, clue = 3)
        assertEquals(3, d.cellAt(0, 0))
        d = HellGolfAuthoring.setClue(d, col = 0, row = 0, clue = -7)
        assertEquals(0, d.cellAt(0, 0))
    }

    @Test
    fun ballOnALakeReplacesTheLake() {
        val d = HellGolfAuthoring.draftFromCanon(
            json("""{"lakes":[[1,1],[0,0]],"balls":[{"r":0,"c":0,"n":1}],"goals":[[0,1]]}"""),
        )
        assertEquals(1, d.cellAt(0, 0))
        assertEquals(HellGolfAuthoring.GOAL, d.cellAt(1, 0))
    }

    @Test
    fun flagsCountMismatchAndStuckBalls() {
        var d = HellGolfAuthoring.draftFromCanon(canon)
        d = HellGolfAuthoring.setClue(d, col = 0, row = 2, clue = 0)
        assertEquals(listOf("2 balls but 1 goals: each ball needs its own goal"), HellGolfAuthoring.problems(d))

        val stuck = HellGolfAuthoring.draftFromCanon(
            json("""{"lakes":[[0,0,0],[0,0,0],[0,0,0]],"balls":[{"r":1,"c":1,"n":2}],"goals":[[0,0]]}"""),
        )
        assertEquals(listOf("R2C2: ball 2 can't move 2 cells in any direction"), HellGolfAuthoring.problems(stuck))

        val empty = HellGolfAuthoring.draftFromCanon(json("""{"lakes":[[1,0]],"balls":[],"goals":[[0,1]]}"""))
        assertEquals(listOf("No balls"), HellGolfAuthoring.problems(empty))
    }
}
