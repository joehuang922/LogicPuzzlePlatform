package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class PicturesqueMazeAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(i: Int): JsonObject = Json.parseToJsonElement(
        File("../../../docs/picturesque-maze/board-picturesque-maze-$i.canon.json").readText(),
    ) as JsonObject

    @Test
    fun samples_roundTripThroughTheDraft() {
        val sizes = mapOf(1 to (57 to 57), 2 to (50 to 50), 3 to (80 to 120))
        for ((i, size) in sizes) {
            val canon = sample(i)
            val board = BoardDraft.fromCanon(AuthoringType.PICTURESQUE_MAZE, canon)
            assertEquals(CanonBoard(canon, size.first, size.second), board.toCanon(AuthoringType.PICTURESQUE_MAZE))
            assertEquals(emptyList<String>(), board.problems(AuthoringType.PICTURESQUE_MAZE))
            assertEquals(44, PicturesqueMazeAuthoring.previewPuzzle(board.picturesqueMaze).puzzleType)
        }
    }

    private val small = PicturesqueMazeAuthoring.draftFromCanon(
        Json.parseToJsonElement(
            """{"width":4,"height":3,
               "walls":{"h":[[0,1,0,0],[0,1,1,0]],"v":[[0,1,0],[0,0,1],[0,0,1]]},
               "entrance":{"side":"top","index":0},"exit":{"side":"bottom","index":3}}"""
        ) as JsonObject,
    )

    @Test
    fun tap_togglesWallsAndMovesOpenings() {
        // The edge between (0,1) and (1,1): a wall, tapped near its middle.
        val opened = PicturesqueMazeAuthoring.tap(small, 1.5f, 0.95f, asExit = false)
        assertEquals(0, opened.wallsH[0][1])
        // Now (0,0),(0,1),(1,1),(1,0) form a loop: an overridable warning, not a format problem.
        assertTrue(PicturesqueMazeAuthoring.problems(opened).any { it.startsWith("Not a perfect maze") })
        assertEquals(small, PicturesqueMazeAuthoring.tap(opened, 1.5f, 1.05f, asExit = false))
        // The border: top of column 2 becomes the entrance; Exit mode moves the exit.
        assertEquals(
            PicturesqueMazeEngine.Opening("top", 2),
            PicturesqueMazeAuthoring.tap(small, 2.5f, 0.1f, asExit = false).entrance,
        )
        assertEquals(
            PicturesqueMazeEngine.Opening("right", 1),
            PicturesqueMazeAuthoring.tap(small, 3.9f, 1.5f, asExit = true).exit,
        )
        // A cell's middle is no edge.
        assertEquals(small, PicturesqueMazeAuthoring.tap(small, 1.5f, 1.5f, asExit = false))
    }

    @Test
    fun formatProblems_blockSameOpeningAndNoRoute() {
        assertEquals(
            listOf("Entrance and exit are the same opening"),
            PicturesqueMazeAuthoring.formatProblems(small.copy(exit = small.entrance)),
        )
        val sealed = small.copy(wallsH = small.wallsH.map { row -> row.map { 1 } }, wallsV = small.wallsV.map { row -> row.map { 1 } })
        assertEquals(listOf("No route from the entrance to the exit"), PicturesqueMazeAuthoring.formatProblems(sealed))
    }

    @Test
    fun resize_addsWallsAndKeepsOpeningsOnTheBoard() {
        val bigger = PicturesqueMazeAuthoring.addRow(PicturesqueMazeAuthoring.addCol(small))
        assertEquals(4, bigger.rows)
        assertEquals(5, bigger.cols)
        assertEquals(listOf(1, 1, 1, 1, 1), bigger.wallsH[2])
        assertEquals(1, bigger.wallsV[0][3])
        val smaller = PicturesqueMazeAuthoring.removeLastCol(small)
        assertEquals(3, smaller.cols)
        assertEquals(PicturesqueMazeEngine.Opening("bottom", 0), smaller.exit)
        assertEquals(small, PicturesqueMazeAuthoring.draftFromCanon(PicturesqueMazeAuthoring.canonFromDraft(small)))
    }
}
