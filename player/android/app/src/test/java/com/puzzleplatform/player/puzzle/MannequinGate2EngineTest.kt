package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors frontend/src/components/mannequinGate2Rules.test.ts. */
class MannequinGate2EngineTest {

    private fun puzzle(canon: String): Puzzle = Puzzle(
        id = "mg2",
        puzzleType = 43,
        puzzleTypeName = "mannequin-gate-2",
        puzzleTypeJpLabel = "マネキンゲート2",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canon) as JsonObject,
    )

    /** A board and its unique solution (CP-SAT), rows separated by "/", "#" shaded. */
    private class Board(val name: String, val canon: String, val solution: String)

    private val boards = listOf(
        Board("example", """{"rows":4,"cols":4,"lines":[[[0,0],[1,0],[2,0],[3,0]],[[1,0],[1,1]],[[3,0],[2,1],[1,2],[2,3]],[[3,1],[3,2],[2,2]],[[0,3],[1,3],[2,3],[3,3]]]}""", "..../##../...#/####"),
        Board("board1", """{"rows":4,"cols":4,"lines":[[[0,0],[0,1]],[[0,0],[1,0],[2,0]],[[0,0],[1,1],[0,2],[0,3]],[[0,3],[1,3],[2,2],[3,1]],[[2,2],[3,3]],[[3,0],[3,1],[3,2],[2,3]]]}""", "##.#/..../#.##/#..#"),
        Board("board2", """{"rows":4,"cols":4,"lines":[[[0,0],[1,1],[2,2],[3,3]],[[0,1],[1,0],[2,1]],[[1,1],[2,0],[3,1]],[[3,1],[3,2],[3,3]],[[0,2],[1,2],[1,3]],[[0,3],[1,3],[2,3]]]}""", "####/...#/##../##.#"),
        Board("board3", """{"rows":8,"cols":8,"lines":[[[1,1],[0,1],[0,2]],[[0,2],[1,2]],[[0,3],[1,3],[1,4]],[[0,4],[0,5],[0,6],[0,7]],[[0,7],[1,6]],[[1,6],[2,6],[2,7],[1,7]],[[2,0],[2,1],[2,2],[2,3],[2,4],[2,5]],[[2,0],[3,0],[3,1]],[[4,5],[3,6],[3,7]],[[3,5],[4,6],[5,5],[5,6],[4,7]],[[6,5],[7,6]],[[6,6],[7,7],[7,6],[7,5]],[[4,0],[4,1]],[[4,1],[5,1],[6,1],[7,1]],[[4,2],[5,2],[5,1]],[[5,0],[6,0],[7,0]],[[7,0],[7,1]],[[4,4],[4,3],[5,3],[6,3],[7,3],[7,2]],[[5,4],[6,4],[6,3],[6,2]]]}""", "..###..#/.###..##/...#.#../##.....#/###.##../#.#.###./....###./###...#."),
        Board("board4", """{"rows":6,"cols":6,"lines":[[[0,0],[0,1],[0,2]],[[1,0],[1,1]],[[0,4],[1,4],[0,3],[1,2],[2,2]],[[2,1],[3,2],[4,2]],[[2,2],[3,1],[4,0],[4,1]],[[1,3],[2,3],[2,4],[2,5]],[[1,5],[2,4],[3,3]],[[3,4],[4,4],[5,5]],[[4,5],[5,4]]]}""", "##..##/##.###/.....#/.#####/.##..#/....##"),
    )

    private fun values(solution: String): Map<String, Int> = buildMap {
        solution.split("/").forEachIndexed { r, row ->
            row.forEachIndexed { c, ch -> if (ch == '#') put(MannequinGate2Engine.cellKey(c, r), ShadeCycle.SHADED) }
        }
    }

    @Test
    fun acceptsEachSolution() {
        for (b in boards) {
            val p = puzzle(b.canon)
            val v = values(b.solution)
            assertTrue(b.name, MannequinGate2Engine.isComplete(p, v))
            assertEquals(b.name, 100.0, MannequinGate2Engine.computeProgress(p, v), 1e-9)
            val board = MannequinGate2Engine.parseBoard(p)
            assertEquals(b.name, emptySet<Int>(), MannequinGate2Rules.badLines(board, MannequinGate2Engine.states(board, v)))
            assertEquals(b.name, emptyList<String>(), MannequinGate2Rules.formatProblems(board))
        }
    }

    @Test
    fun rejectsEverySingleFlip() {
        for (b in boards) {
            val p = puzzle(b.canon)
            val board = MannequinGate2Engine.parseBoard(p)
            val v = values(b.solution)
            for (r in 0 until board.rows) for (c in 0 until board.cols) {
                val k = MannequinGate2Engine.cellKey(c, r)
                val flipped = if (k in v) v - k else v + (k to ShadeCycle.SHADED)
                assertFalse("${b.name} R${r + 1}C${c + 1}", MannequinGate2Engine.isComplete(p, flipped))
            }
        }
    }

    @Test
    fun marksCountAsUnshaded() {
        val b = boards[0]
        val p = puzzle(b.canon)
        val board = MannequinGate2Engine.parseBoard(p)
        val marks = (0 until board.rows).flatMap { r -> (0 until board.cols).map { c -> MannequinGate2Engine.cellKey(c, r) } }
            .associateWith { ShadeCycle.MARKED }
        assertTrue(MannequinGate2Engine.isComplete(p, marks + values(b.solution)))
    }

    @Test
    fun exampleGateSizes() {
        val p = puzzle(boards[0].canon)
        val board = MannequinGate2Engine.parseBoard(p)
        val states = MannequinGate2Engine.states(board, values(boards[0].solution))
        assertEquals(listOf(1, 0, 2, 0, 0), board.lines.map { MannequinGate2Rules.gateSize(it, states) })
    }

    @Test
    fun crossingsAtSharedCellsAndCornersOnly() {
        val lines = listOf(
            listOf(0 to 0, 1 to 1),
            listOf(0 to 1, 1 to 0),
            listOf(0 to 0, 0 to 1),
            listOf(1 to 0, 1 to 1),
            listOf(2 to 0, 2 to 1),
        )
        assertEquals(listOf(0 to 1, 0 to 2, 0 to 3, 1 to 2, 1 to 3), MannequinGate2Rules.crossingPairs(lines))
        assertEquals(emptyList<Pair<Int, Int>>(), MannequinGate2Rules.crossingPairs(listOf(listOf(0 to 0, 1 to 1), listOf(0 to 1, 1 to 2))))
    }

    @Test
    fun badLinesForErrorsOn() {
        val board = MannequinGate2Rules.Board(2, 3, listOf(listOf(0 to 0, 0 to 1, 0 to 2), listOf(0 to 1, 1 to 1)))
        assertEquals(setOf(0), MannequinGate2Rules.badLines(board, listOf(listOf(1, 1, 1), listOf(0, 0, 0))))
        assertEquals(setOf(1), MannequinGate2Rules.badLines(board, listOf(listOf(0, 2, 0), listOf(0, 1, 0))))
        assertEquals(setOf(0, 1), MannequinGate2Rules.badLines(board, listOf(listOf(1, 1, 0), listOf(0, 1, 0))))
    }

    @Test
    fun emptyBoardIsOpen() {
        val p = puzzle(boards[1].canon)
        assertFalse(MannequinGate2Engine.isComplete(p, emptyMap()))
        assertEquals(0.0, MannequinGate2Engine.computeProgress(p, emptyMap()), 1e-9)
    }

    @Test
    fun answerRoundTripsShading() {
        val p = puzzle(boards[3].canon)
        val v = values(boards[3].solution)
        val json = MannequinGate2Engine.extractAnswer(p, v + ("c:0,0" to ShadeCycle.MARKED))
        assertEquals(v, MannequinGate2Engine.restoreUserValues(p, json))
    }

    @Test
    fun isRegistered() {
        assertEquals(MannequinGate2Engine, PuzzleEngines.forType(43))
    }
}
