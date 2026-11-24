package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class IrregularNonogramAuthoringTest {

    // Unit tests run from the app module directory.
    private fun sample(i: Int): JsonObject = Json.parseToJsonElement(
        File("../../../docs/irregular-nonogram/board-irregular-nonogram-$i.canon.json").readText(),
    ) as JsonObject

    @Test
    fun samples_roundTripThroughTheDraft() {
        for (i in 1..2) {
            val canon = sample(i)
            val board = BoardDraft.fromCanon(AuthoringType.IRREGULAR_NONOGRAM, canon)
            assertEquals(CanonBoard(canon, 35, 40), board.toCanon(AuthoringType.IRREGULAR_NONOGRAM))
            assertEquals(emptyList<String>(), board.problems(AuthoringType.IRREGULAR_NONOGRAM))
            assertEquals(45, IrregularNonogramAuthoring.previewPuzzle(board.irregularNonogram).puzzleType)
        }
    }

    @Test
    fun toggleCell_growsTrimsAndClueFollowsItsPiece() {
        var d = IrregularNonogramAuthoring.empty(2, 2)
        d = IrregularNonogramAuthoring.setPieceClue(d, "row", 0, 0, listOf(2), "start")
        val grown = IrregularNonogramAuthoring.toggleCell(d, -1, 0)
        assertEquals(3, grown.rows)
        assertEquals(listOf(true, false), grown.cells[0])
        assertEquals(IrregularNonogramEngine.Clue("row", 1, 0, "start", listOf(2)), grown.clues.single())
        // Taking the new cell back out trims the box again.
        assertEquals(d, IrregularNonogramAuthoring.toggleCell(grown, 0, 0))
        // Growing a piece at its start: the clue follows the piece.
        var row = IrregularNonogramAuthoring.toggleCell(IrregularNonogramAuthoring.empty(1, 3), 0, 0)
        row = IrregularNonogramAuthoring.setPieceClue(row, "row", 0, 1, listOf(1), "end")
        val longer = IrregularNonogramAuthoring.toggleCell(row, 0, -1)
        assertEquals(IrregularNonogramEngine.Clue("row", 0, 0, "end", listOf(1)), longer.clues.single())
    }

    @Test
    fun clues_setFlipClearAndProblems() {
        var d = IrregularNonogramAuthoring.empty(3, 3)
        d = IrregularNonogramAuthoring.setPieceClue(d, "col", 2, 1, listOf(1, 1), "start")
        assertEquals(IrregularNonogramEngine.Clue("col", 1, 0, "start", listOf(1, 1)), IrregularNonogramAuthoring.pieceClue(d, "col", 0, 1))
        d = IrregularNonogramAuthoring.setPieceClue(d, "col", 0, 1, listOf(4), "end")
        assertTrue(IrregularNonogramAuthoring.formatProblems(d).single().contains("doesn't fit"))
        d = IrregularNonogramAuthoring.setPieceClue(d, "col", 0, 1, emptyList(), "end")
        assertNull(IrregularNonogramAuthoring.pieceClue(d, "col", 0, 1))
        assertTrue("No clues" in IrregularNonogramAuthoring.problems(d))
        assertEquals(listOf(2, 5, 1), IrregularNonogramAuthoring.parseClues(" 2 5,1 "))
        assertNull(IrregularNonogramAuthoring.parseClues("2 x"))
    }
}
