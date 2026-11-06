package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Parity with the TS engine (player/solver, nextPlacement on type 2): playing the
 * 5-board staircase docs/combo-sudoku/board_7 from empty, by hints alone, gives the
 * same cells, digits and rungs. The fixture (resources/combo_sudoku_board7_hints.txt)
 * holds the boards ("x,y,81 digits" each) and the TS sequence ("col,row=digit@depth").
 */
class ComboSudokuHinterTest {

    private val fixture = javaClass.classLoader!!.getResource("combo_sudoku_board7_hints.txt")!!.readText().lines()

    private val puzzle: Puzzle = run {
        val boards = fixture[0].split(" ").joinToString(",") { b ->
            val (x, y, digits) = b.split(",")
            val hints = (0 until 9).joinToString(",", "[", "]") { r ->
                digits.substring(r * 9, r * 9 + 9).toList().joinToString(",", "[", "]")
            }
            """{"x":$x,"y":$y,"hints":$hints}"""
        }
        Puzzle(
            id = "c7",
            puzzleType = 2,
            puzzleTypeName = "combo-sudoku",
            puzzleTypeJpLabel = "合体数独",
            difficulty = 3,
            canonRepr = Json.parseToJsonElement("""{"subboards":[$boards]}""").jsonObject,
        )
    }

    @Test
    fun `plays board_7 from empty to solved exactly like the TS engine`() {
        val expected = fixture[2].split(" ")
        val values = mutableMapOf<String, Int>()
        val seen = mutableListOf<String>()
        while (true) {
            val step = ComboSudokuHinter.nextPlacement(puzzle, values) ?: break
            val key = ComboSudokuHinter.geometry(ComboSudokuEngine.layout(puzzle).subboards).key(step.placement!!.cell)
            seen += "$key=${step.placement!!.value}@${step.depth}"
            values[key] = step.placement!!.value
        }
        assertEquals(fixture[1].toInt(), expected.size)
        assertEquals(expected, seen)
        // Every rung of the ladder was needed somewhere.
        assertEquals(setOf(0, 1, 2, 3, 4), seen.map { it.substringAfter("@").toInt() }.toSet())
        assertNull(ComboSudokuHinter.nextCell(puzzle, values)) // solved: nothing left
        assertEquals(true, ComboSudokuEngine.isComplete(puzzle, values))
    }

    @Test
    fun `a shared room is one box and units name their board`() {
        val geo = ComboSudokuHinter.geometry(ComboSudokuEngine.layout(puzzle).subboards)
        assertEquals(ComboSudokuEngine.layout(puzzle).cells.size, geo.size)
        assertEquals(geo.size / 9, geo.kinds.count { it == UnitHinter.Kind.BOX })
        assertEquals("board 1 row 1", geo.unitLabel(0))
    }
}
