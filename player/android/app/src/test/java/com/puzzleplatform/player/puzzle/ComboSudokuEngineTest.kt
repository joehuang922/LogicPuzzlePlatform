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

/**
 * Two boards sharing one room: A at rooms (0,0), B at (2,2), so A's bottom-right box
 * (cells 6-8, 6-8) is B's top-left box. [solution] fills the 15x15 shape validly for
 * both boards.
 */
class ComboSudokuEngineTest {

    private fun solution(col: Int, row: Int): Int = (3 * row + row / 3 + col) % 9 + 1

    private val boards = listOf(0 to 0, 2 to 2)

    /** Global cells of both boards. */
    private val cells: Set<Pair<Int, Int>> =
        boards.flatMap { (x, y) -> (0 until 81).map { 3 * x + it % 9 to 3 * y + it / 9 } }.toSet()

    /** Givens: cells where (col + 2*row) % 5 == 0. */
    private fun isGiven(col: Int, row: Int) = (col + 2 * row) % 5 == 0

    private fun canon(givens: (Int, Int) -> Int = { c, r -> if (isGiven(c, r)) solution(c, r) else 0 }): String =
        """{"room_width":3,"room_height":3,"subboards":[""" + boards.joinToString(",") { (x, y) ->
            val hints = (0 until 9).joinToString(",", "[", "]") { r ->
                (0 until 9).joinToString(",", "[", "]") { c -> givens(3 * x + c, 3 * y + r).toString() }
            }
            """{"x":$x,"y":$y,"hints":$hints}"""
        } + "]}"

    private fun puzzle(canon: String = canon()) = Puzzle(
        id = "c1",
        puzzleType = 2,
        puzzleTypeName = "combo-sudoku",
        puzzleTypeJpLabel = "合体数独",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canon).jsonObject,
    )

    private val solved: Map<String, Int> =
        cells.filter { (c, r) -> !isGiven(c, r) }.associate { (c, r) -> "$c,$r" to solution(c, r) }

    @Test
    fun `layout spans both boards and shares one room`() {
        val layout = ComboSudokuEngine.layout(puzzle())
        assertEquals(15, layout.cols)
        assertEquals(15, layout.rows)
        assertEquals(81 + 81 - 9, layout.cells.size)
        // A shared cell's peers come from both boards: A's row 7 and B's row 1.
        val peers = layout.peers.getValue("7,7")
        assertTrue("0,7" in peers)
        assertTrue("14,7" in peers)
        assertFalse("14,14" in peers)
    }

    @Test
    fun `answer has every board's 81 cells, givens merged`() {
        val answer = ComboSudokuEngine.extractAnswer(puzzle(), solved)
        val subs = answer["subboards"]!!.jsonArray
        assertEquals(2, subs.size)
        for ((i, xy) in boards.withIndex()) {
            val sb = subs[i].jsonObject
            assertEquals(xy.first, sb["x"]!!.jsonPrimitive.int)
            assertEquals(xy.second, sb["y"]!!.jsonPrimitive.int)
            val rows = sb["answers"]!!.jsonArray
            for (r in 0 until 9) for (c in 0 until 9) {
                val g = 3 * xy.first + c to 3 * xy.second + r
                assertEquals(solution(g.first, g.second), rows[r].jsonArray[c].jsonPrimitive.int)
            }
        }
    }

    @Test
    fun `progress counts a shared cell once`() {
        val p = puzzle()
        val open = cells.count { (c, r) -> !isGiven(c, r) }
        assertEquals(0.0, ComboSudokuEngine.computeProgress(p, emptyMap()), 1e-9)
        assertEquals(100.0 / open, ComboSudokuEngine.computeProgress(p, mapOf("7,7" to solution(7, 7))), 1e-9)
        assertEquals(100.0, ComboSudokuEngine.computeProgress(p, solved), 1e-9)
    }

    @Test
    fun `answers and notes round trip`() {
        val p = puzzle()
        val partial = solved.entries.take(40).associate { it.key to it.value } +
            mapOf("n:13,13:2" to 1, "n:13,13:7" to 1)
        val restored = ComboSudokuEngine.restoreUserValues(p, ComboSudokuEngine.extractAnswer(p, partial))
        assertEquals(partial.filterKeys { it !in setOf("13,13") }, restored)
    }

    @Test
    fun `restores a web answer without notes`() {
        val p = puzzle()
        val web = Json.parseToJsonElement(
            ComboSudokuEngine.extractAnswer(p, solved).toString().replace(Regex(""","notes":\[.*?]]]"""), ""),
        ).jsonObject
        assertTrue((web["subboards"] as JsonArray).none { "notes" in (it as JsonObject) })
        assertEquals(solved, ComboSudokuEngine.restoreUserValues(p, web))
    }

    @Test
    fun `complete only when every board is a valid sudoku`() {
        val p = puzzle()
        assertTrue(ComboSudokuEngine.isComplete(p, solved))
        assertFalse(ComboSudokuEngine.isComplete(p, solved - solved.keys.first()))
        // Swap two open cells in B's last row (outside A): breaks B's columns only.
        val r = 14
        val a = (6..14).first { !isGiven(it, r) }
        val b = (a + 1..14).first { !isGiven(it, r) && solution(it, r) != solution(a, r) }
        val swapped = solved + mapOf("$a,$r" to solution(b, r), "$b,$r" to solution(a, r))
        assertFalse(ComboSudokuEngine.isComplete(p, swapped))
        assertTrue("$a,$r" in ComboSudokuEngine.findConflicts(p, swapped))
    }

    @Test
    fun `a shared cell conflicts with both boards`() {
        val p = puzzle(canon { _, _ -> 0 })
        // 5 at a shared cell, again in A's row 6 (col 0) and in B's column 6 (row 14).
        val values = mapOf("6,6" to 5, "0,6" to 5, "6,14" to 5)
        assertEquals(setOf("6,6", "0,6", "6,14"), ComboSudokuEngine.findConflicts(p, values))
    }

    @Test
    fun `registered as type 2`() {
        assertEquals(ComboSudokuEngine, PuzzleEngines.forType(2))
    }
}
