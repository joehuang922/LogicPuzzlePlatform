package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class TilePaintAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(name: String): JsonObject =
        Json.parseToJsonElement(File("../../../docs/tile-paint/$name.canon.json").readText()) as JsonObject

    private val example = TilePaintAuthoring.draftFromCanon(sample("board-tile-paint-example"))

    @Test
    fun samples_roundTripThroughTheDraft() {
        for ((name, size) in listOf("example" to (5 to 5), "small" to (11 to 11), "medium" to (26 to 26), "big" to (27 to 40))) {
            val canon = sample("board-tile-paint-$name")
            val board = BoardDraft.fromCanon(AuthoringType.TILE_PAINT, canon)
            assertEquals(name, CanonBoard(canon, size.first, size.second), board.toCanon(AuthoringType.TILE_PAINT))
            assertEquals(name, emptyList<String>(), board.problems(AuthoringType.TILE_PAINT))
        }
    }

    @Test
    fun toggleClueCell_walls() {
        // (2,3) becomes a clue cell: its edges against tile cells read 1.
        val d = TilePaintAuthoring.toggleClueCell(example, 2, 3)
        assertEquals(TilePaintEngine.Clue(), d.cells[2][3])
        assertEquals(1, d.h[1][3])
        assertEquals(1, d.v[2][2])
        // Back to a tile: a single cell, walled in.
        val back = TilePaintAuthoring.toggleClueCell(d, 2, 3)
        assertNull(back.cells[2][3])
        assertTrue(back.wallBelow(2, 3) && back.wallRight(2, 3) && back.wallRight(2, 2) && back.wallBelow(1, 3))
    }

    @Test
    fun numbersAndWalls() {
        var d = TilePaintAuthoring.setNumber(example, 0, 1, right = false, n = 0)
        assertEquals(0, d.cells[0][1]!!.down)
        d = TilePaintAuthoring.setNumber(d, 0, 1, right = false, n = null)
        assertNull(d.cells[0][1]!!.down)
        assertEquals(example, TilePaintAuthoring.setNumber(example, 1, 1, right = true, n = 3)) // not a clue cell
        // A wall only toggles between two tile cells.
        assertEquals(example, TilePaintAuthoring.toggleWall(example, "h:0,1"))
        val open = TilePaintAuthoring.toggleWall(example, "h:1,1")
        assertEquals(0, open.h[1][1])
        assertEquals(0, TilePaintAuthoring.parseNumber("0"))
        assertEquals(12, TilePaintAuthoring.parseNumber("12"))
        assertNull(TilePaintAuthoring.parseNumber(""))
    }

    @Test
    fun rowsAndColumns() {
        val wider = TilePaintAuthoring.addCol(example)
        assertEquals(6, wider.cols)
        assertEquals(TilePaintEngine.Clue(), wider.cells[0][5]) // the clue row continues
        assertNull(wider.cells[1][5])
        assertTrue(wider.wallRight(1, 4)) // new cells are single-cell tiles
        val taller = TilePaintAuthoring.addRow(example)
        assertEquals(TilePaintEngine.Clue(), taller.cells[5][0])
        assertEquals(example, TilePaintAuthoring.removeLastRow(taller))
        assertEquals(example, TilePaintAuthoring.removeLastCol(wider))
    }

    @Test
    fun formatProblemsAndWarnings() {
        assertEquals(emptyList<String>(), TilePaintAuthoring.problems(example))
        // A wall that doesn't close off a tile: (3,3)-(4,4) made one tile with a wall inside it.
        fun set(g: List<List<Int>>, r: Int, c: Int, w: Int) =
            g.mapIndexed { i, row -> if (i != r) row else row.mapIndexed { j, x -> if (j == c) w else x } }
        val h = set(set(set(example.h, 2, 3, 0), 2, 4, 0), 3, 3, 0)
        val v = set(set(set(example.v, 3, 3, 0), 4, 3, 1), 4, 2, 0)
        val d = example.copy(h = h, v = v)
        assertTrue(TilePaintAuthoring.formatProblems(d).any { it.contains("doesn't close off a tile") })
        // A number with no cells to count.
        val runless = TilePaintAuthoring.setNumber(TilePaintAuthoring.toggleClueCell(example, 1, 4), 1, 4, right = true, n = 1)
        assertTrue(TilePaintAuthoring.formatProblems(runless).any { it.contains("has no cells to count") })
        // A clue bigger than its run is only a warning.
        val big = TilePaintAuthoring.setNumber(example, 0, 1, right = false, n = 9)
        assertEquals(emptyList<String>(), TilePaintAuthoring.formatProblems(big))
        assertEquals(listOf("The down clue 9 at R1C2 is more than its 4 cells"), TilePaintAuthoring.problems(big))
    }

    @Test
    fun typeIsListed() {
        assertEquals(AuthoringType.TILE_PAINT, AuthoringType.forPuzzleType(40))
    }
}
