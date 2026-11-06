package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ComboSudokuAuthoringTest {

    private val empty = List(9) { List(9) { 0 } }

    /** Parser output for two boards sharing one room, with a 4 in the shared room. */
    private val parsed = Json.parseToJsonElement(
        """{"room_width":3,"room_height":3,"subboards":[
          {"x":0,"y":0,"hints":${grid(8 to 8 to 4, 0 to 0 to 1)}},
          {"x":2,"y":2,"hints":${grid(2 to 2 to 4)}}]}""",
    ).jsonObject

    private fun grid(vararg cells: Pair<Pair<Int, Int>, Int>): String {
        val g = Array(9) { IntArray(9) }
        for ((rc, v) in cells) g[rc.first][rc.second] = v
        return g.joinToString(",", "[", "]") { it.joinToString(",", "[", "]") }
    }

    @Test
    fun `canon round trips through the draft and BoardDraft`() {
        val board = BoardDraft.fromCanon(AuthoringType.COMBO_SUDOKU, parsed)
        val out = board.toCanon(AuthoringType.COMBO_SUDOKU)
        assertEquals(parsed, out.canon)
        assertEquals(15, out.width)
        assertEquals(15, out.height)
        assertTrue(board.problems(AuthoringType.COMBO_SUDOKU).isEmpty())
        assertTrue(board.formatProblems(AuthoringType.COMBO_SUDOKU).isEmpty())
    }

    @Test
    fun `editing a shared cell writes every board covering it`() {
        val draft = ComboSudokuAuthoring.draftFromCanon(parsed).withCell(7, 6, 9)
        assertEquals(9, draft.subboards[0].hints[6][7])
        assertEquals(9, draft.subboards[1].hints[0][1])
        assertEquals(9, ComboSudokuAuthoring.givens(draft)["7,6"])
        val cleared = draft.withCell(8, 8, 0)
        assertEquals(0, cleared.subboards[0].hints[8][8])
        assertEquals(0, cleared.subboards[1].hints[2][2])
    }

    @Test
    fun `moving a board carries its givens and re-anchors at zero`() {
        val draft = ComboSudokuAuthoring.draftFromCanon(parsed)
        val moved = draft.moved(0, -1, 0) // left of the origin: everything shifts right
        assertEquals(listOf(0 to 0, 3 to 2), moved.subboards.map { it.x to it.y })
        assertEquals(1, moved.subboards[0].hints[0][0])
    }

    @Test
    fun `overlaps that disagree are a format problem`() {
        val draft = ComboSudokuAuthoring.draftFromCanon(parsed)
        val bad = draft.copy(
            subboards = listOf(draft.subboards[0], draft.subboards[1].copy(hints = Json.decodeFromString(grid(2 to 2 to 5)))),
        )
        assertEquals(listOf(8 to 8), ComboSudokuAuthoring.disagreements(bad))
        assertEquals(1, ComboSudokuAuthoring.formatProblems(bad).size)
        assertTrue(ComboSudokuAuthoring.formatProblems(bad.withCell(8, 8, 4)).isEmpty())
    }

    @Test
    fun `stacked boards and no boards are format problems`() {
        assertEquals(1, ComboSudokuAuthoring.formatProblems(ComboSudokuDraft()).size)
        val stacked = ComboSudokuDraft(listOf(ComboSudokuEngine.Subboard(0, 0, empty), ComboSudokuEngine.Subboard(0, 0, empty)))
        assertEquals(1, ComboSudokuAuthoring.formatProblems(stacked).size)
    }

    @Test
    fun `a repeated digit is a misread warning naming the board and unit`() {
        val draft = ComboSudokuAuthoring.draftFromCanon(parsed).withCell(14, 8, 4) // B's row 3 already has the 4 (the shared cell)
        val problems = ComboSudokuAuthoring.problems(draft)
        assertEquals(listOf("Board 2: 4 repeated in row 3"), problems)
    }

    @Test
    fun `add and remove boards`() {
        val draft = ComboSudokuAuthoring.draftFromCanon(parsed).withNewBoard()
        assertEquals(5 to 0, draft.subboards.last().let { it.x to it.y })
        assertEquals(listOf(0 to 0, 5 to 0), draft.withoutBoard(1).subboards.map { it.x to it.y })
    }
}
