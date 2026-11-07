package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The "on track" check (PuzzleEngine.matchesSolution) for every type with a solver
 * besides Nonogram (NonogramEngineTest): the same cases as
 * frontend/src/utils/solutionCheck.test.ts.
 */
class SolutionCheckTest {

    private fun puzzle(type: Int, canon: String, solution: String?) = Puzzle(
        id = "p",
        puzzleType = type,
        puzzleTypeName = "",
        puzzleTypeJpLabel = "",
        difficulty = 1,
        canonRepr = Json.parseToJsonElement(canon).jsonObject,
        solutionRepr = solution?.let { Json.parseToJsonElement(it).jsonObject },
    )

    private fun global(c: Int, r: Int) = (3 * r + r / 3 + c) % 9 + 1

    private fun grid(rows: Int, cols: Int, f: (Int, Int) -> Int) =
        (0 until rows).joinToString(",", "[", "]") { r -> (0 until cols).joinToString(",", "[", "]") { c -> f(c, r).toString() } }

    @Test
    fun `null without a stored solution or when its shape doesn't fit`() {
        assertNull(SudokuEngine.matchesSolution(puzzle(1, """{"hints":[]}""", null), emptyMap()))
        assertNull(SudokuEngine.matchesSolution(puzzle(1, """{"hints":[]}""", """{"hints":[[1,2]]}"""), emptyMap()))
        assertNull(KakuroEngine.matchesSolution(puzzle(12, """{"cells":[[{},{}]]}""", """{"values":[[0]]}"""), emptyMap()))
    }

    @Test
    fun `sudoku digits must match and notes are ignored`() {
        val p = puzzle(1, """{"hints":[]}""", """{"hints":${grid(9, 9, ::global)}}""")
        assertEquals(true, SudokuEngine.matchesSolution(p, emptyMap()))
        assertEquals(true, SudokuEngine.matchesSolution(p, mapOf("3,1" to global(3, 1), "n:0,0:5" to 1)))
        assertEquals(false, SudokuEngine.matchesSolution(p, mapOf("3,1" to global(3, 1) % 9 + 1)))
    }

    @Test
    fun `combo sudoku checks a global cell against the board covering it`() {
        fun board(x: Int, y: Int) = """{"x":$x,"y":$y,"answers":${grid(9, 9) { c, r -> global(3 * x + c, 3 * y + r) }}}"""
        val empty = grid(9, 9) { _, _ -> 0 }
        val canon = """{"subboards":[{"x":0,"y":0,"hints":$empty},{"x":2,"y":2,"hints":$empty}]}"""
        val p = puzzle(2, canon, """{"subboards":[${board(0, 0)},${board(2, 2)}]}""")
        assertEquals(true, ComboSudokuEngine.matchesSolution(p, mapOf("14,14" to global(14, 14), "7,7" to global(7, 7))))
        assertEquals(false, ComboSudokuEngine.matchesSolution(p, mapOf("14,14" to global(14, 14) % 9 + 1)))
        assertNull(ComboSudokuEngine.matchesSolution(puzzle(2, canon, """{"subboards":[${board(0, 0)}]}"""), emptyMap()))
    }

    @Test
    fun `kakuro digits on white cells`() {
        val p = puzzle(12, """{"cells":[[{},{}],[{},{}]]}""", """{"values":[[0,0],[0,7]]}""")
        assertEquals(true, KakuroEngine.matchesSolution(p, mapOf("1,1" to 7)))
        assertEquals(false, KakuroEngine.matchesSolution(p, mapOf("1,1" to 8)))
    }

    @Test
    fun `LITS shaded and marked cells`() {
        // 2 rows x 3 cols: h is 1 x 3, v is 2 x 2.
        val p = puzzle(15, """{"grids":{"h":[[0,0,0]],"v":[[0,0],[0,0]]}}""", """{"shaded":[[1,1,0],[0,1,1]]}""")
        assertEquals(true, LitsEngine.matchesSolution(p, mapOf("c:1,0" to LitsEngine.SHADED, "c:2,0" to LitsEngine.MARKED)))
        assertEquals(false, LitsEngine.matchesSolution(p, mapOf("c:2,0" to LitsEngine.SHADED)))
        assertEquals(false, LitsEngine.matchesSolution(p, mapOf("c:0,0" to LitsEngine.MARKED)))
    }

    @Test
    fun `nurimaze painted rooms black and marked rooms white`() {
        val p = puzzle(3, """{"cells":[[3,0],[0,4]],"grids":{"h":[[1,1]],"v":[[1],[1]]}}""", """{"states":[[2,1],[2,2]]}""")
        assertEquals(true, NurimazeEngine.matchesSolution(p, mapOf("1,0" to 1, "0,1" to 2)))
        assertEquals(false, NurimazeEngine.matchesSolution(p, mapOf("1,0" to 2)))
        assertEquals(false, NurimazeEngine.matchesSolution(p, mapOf("0,1" to 1)))
        assertNull(NurimazeEngine.matchesSolution(puzzle(3, """{"cells":[[3,4]],"grids":{"h":[],"v":[[1]]}}""", null), emptyMap()))
    }

    @Test
    fun `slitherlink lines and crosses on both edge grids`() {
        val p = puzzle(5, """{"cells":[[4]]}""", """{"edges":{"h":[[1],[1]],"v":[[1,1]]}}""")
        assertEquals(true, SlitherlinkEngine.matchesSolution(p, mapOf("h:0,0" to 1, "v:0,1" to 1)))
        assertEquals(false, SlitherlinkEngine.matchesSolution(p, mapOf("v:0,0" to 2)))
    }
}
