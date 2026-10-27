package com.puzzleplatform.player.puzzle

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [BoardDraft] routes each [AuthoringType] to its own `*Authoring` mapping: a stored
 * question's canon seeds the matching draft, and the draft serializes back to the same
 * canon with the size the API stores beside it.
 */
class BoardDraftTest {

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun sudokuCanonRoundTrips() {
        val hints = List(9) { r -> List(9) { c -> if (r == c) r + 1 else 0 } }
        val canon = json("""{"hints":$hints}""")
        val board = BoardDraft.fromCanon(AuthoringType.SUDOKU, canon)
        assertEquals(9, board.userValues.size)
        assertEquals(CanonBoard(canon, 9, 9), board.toCanon(AuthoringType.SUDOKU))
    }

    @Test
    fun nonogramSizeIsColsByRows() {
        val canon = json("""{"rowClues":[[1],[2],[1,1]],"colClues":[[3],[1]]}""")
        val board = BoardDraft.fromCanon(AuthoringType.NONOGRAM, canon)
        val out = board.toCanon(AuthoringType.NONOGRAM)
        assertEquals(2, out.width)
        assertEquals(3, out.height)
        assertEquals(board, BoardDraft.fromCanon(AuthoringType.NONOGRAM, out.canon))
    }

    @Test
    fun heyawakeRoundTripsWithItsSize() {
        val canon = json(
            """{"width":3,"height":2,"rooms":[{"r":0,"c":0,"w":2,"h":2,"clue":1},{"r":0,"c":2,"w":1,"h":2}]}"""
        )
        val board = BoardDraft.fromCanon(AuthoringType.HEYAWAKE, canon)
        val out = board.toCanon(AuthoringType.HEYAWAKE)
        assertEquals(3 to 2, out.width to out.height)
        assertEquals(board, BoardDraft.fromCanon(AuthoringType.HEYAWAKE, out.canon))
        assertTrue(board.formatProblems(AuthoringType.HEYAWAKE).isEmpty())
    }

    @Test
    fun onlyTheTypesDraftIsSeeded() {
        val board = BoardDraft.fromCanon(AuthoringType.NURIKABE, json("""{"cells":[[1,0],[0,0]]}"""))
        assertEquals(BoardDraft(nurikabe = board.nurikabe), board)
        assertEquals(2 to 2, board.toCanon(AuthoringType.NURIKABE).let { it.width to it.height })
    }

    @Test
    fun shakashakaRoundTripsWithItsSize() {
        val canon = json("""{"cells":[[-1,2,-1],[5,-1,-1]]}""")
        val board = BoardDraft.fromCanon(AuthoringType.SHAKASHAKA, canon)
        assertEquals(CanonBoard(canon, 3, 2), board.toCanon(AuthoringType.SHAKASHAKA))
    }

    @Test
    fun clueGridTypesKeepTheirOwnDraft() {
        val canon = json("""{"cells":[[1,0],[0,1]]}""")
        val link = BoardDraft.fromCanon(AuthoringType.NUMBER_LINK, canon)
        assertEquals(BoardDraft(numberLink = link.numberLink), link)
        assertEquals(CanonBoard(canon, 2, 2), link.toCanon(AuthoringType.NUMBER_LINK))
        val shikaku = BoardDraft.fromCanon(AuthoringType.SHIKAKU, canon)
        assertEquals(BoardDraft(shikaku = shikaku.shikaku), shikaku)
        val fillomino = BoardDraft.fromCanon(AuthoringType.FILLOMINO, canon)
        assertEquals(BoardDraft(fillomino = fillomino.fillomino), fillomino)
        assertEquals(CanonBoard(canon, 2, 2), fillomino.toCanon(AuthoringType.FILLOMINO))
    }

    @Test
    fun sudokuHasNoProblemCheck() {
        assertTrue(BoardDraft().problems(AuthoringType.SUDOKU).isEmpty())
        assertTrue(BoardDraft().formatProblems(AuthoringType.SUDOKU).isEmpty())
    }

    @Test
    fun everyTypeIsEditableFromItsPuzzleTypeId() {
        for (t in AuthoringType.entries) assertEquals(t, AuthoringType.forPuzzleType(t.puzzleType))
        assertNull(AuthoringType.forPuzzleType(-1))
    }
}
