package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RippleEffectEngineTest {

    private fun puzzle(canonJson: String): Puzzle = Puzzle(
        id = "r1",
        puzzleType = 25,
        puzzleTypeName = "ripple-effect",
        puzzleTypeJpLabel = "波及効果",
        difficulty = 3,
        canonRepr = Json.parseToJsonElement(canonJson) as JsonObject,
    )

    // 2x3 board, split by a full horizontal border into two size-3 rooms (the top row
    // and the bottom row). Two clues: (r0,c0)=1 and (r1,c1)=3.
    //   1 . .
    //   . 3 .
    // The intended solution fills each room with {1,2,3} and keeps every column's two
    // (adjacent) cells distinct, as the ripple rule requires:
    //   1 2 3
    //   2 3 1
    private val canon2x3 = """{
        "cells":[[1,0,0],[0,3,0]],
        "edges":{"h":[[1,1,1]],"v":[[0,0],[0,0]]}
    }"""

    // The solved input: the four player-entered values, keyed "col,row" like the web board.
    private val solved = mapOf(
        "1,0" to 2, // (r0,c1)
        "2,0" to 3, // (r0,c2)
        "0,1" to 2, // (r1,c0)
        "2,1" to 1, // (r1,c2)
    )

    // -- parseCells / parseEdges -------------------------------------------

    @Test
    fun parseCells_readsClues() {
        val cells = RippleEffectEngine.parseCells(puzzle(canon2x3))
        assertEquals(2, cells.size)
        assertEquals(listOf(1, 0, 0), cells[0])
        assertEquals(listOf(0, 3, 0), cells[1])
    }

    @Test
    fun parseEdges_readsFixedRoomBorders() {
        val e = RippleEffectEngine.parseEdges(puzzle(canon2x3))
        assertEquals(1, e.h.size)       // rows - 1
        assertEquals(3, e.h[0].size)    // cols
        assertEquals(listOf(1, 1, 1), e.h[0].toList())
        assertEquals(2, e.v.size)       // rows
        assertEquals(2, e.v[0].size)    // cols - 1
        assertEquals(listOf(0, 0), e.v[0].toList())
        assertEquals(listOf(0, 0), e.v[1].toList())
    }

    // -- extractAnswer ------------------------------------------------------

    @Test
    fun extractAnswer_mergesCluesAndEntriesIntoFullGrid() {
        val answer = RippleEffectEngine.extractAnswer(puzzle(canon2x3), solved)
        val numbers = (answer["numbers"] as JsonArray).map { it.jsonArray }
        assertEquals(2, numbers.size)
        assertEquals(listOf(1, 2, 3), numbers[0].map { it.jsonPrimitive.int })
        assertEquals(listOf(2, 3, 1), numbers[1].map { it.jsonPrimitive.int })
        // The partition is fixed in the canon, so the answer carries only numbers.
        assertTrue(answer["edges"] == null)
    }

    // -- restoreUserValues (round-trip) ------------------------------------

    @Test
    fun restore_roundTripsThroughExtract() {
        val p = puzzle(canon2x3)
        val answer = RippleEffectEngine.extractAnswer(p, solved)
        // Clue cells are not player input, so they must not reappear as entries.
        assertEquals(solved, RippleEffectEngine.restoreUserValues(p, answer))
    }

    // -- computeProgress ----------------------------------------------------

    @Test
    fun computeProgress_zeroForEmptyBoard() {
        assertEquals(0.0, RippleEffectEngine.computeProgress(puzzle(canon2x3), emptyMap()), 0.0)
    }

    @Test
    fun computeProgress_countsFilledEmptyCellsOnly() {
        // One of the four empty cells filled -> 1/4.
        val partial = mapOf("1,0" to 2)
        assertEquals(25.0, RippleEffectEngine.computeProgress(puzzle(canon2x3), partial), 1e-9)
    }

    @Test
    fun computeProgress_hundredWhenAllEmptyCellsFilled() {
        assertEquals(100.0, RippleEffectEngine.computeProgress(puzzle(canon2x3), solved), 1e-9)
    }

    // -- isComplete ---------------------------------------------------------

    @Test
    fun isComplete_trueForValidSolution() {
        assertTrue(RippleEffectEngine.isComplete(puzzle(canon2x3), solved))
    }

    @Test
    fun isComplete_falseWhenACellIsUnfilled() {
        assertFalse(RippleEffectEngine.isComplete(puzzle(canon2x3), solved - "2,1"))
    }

    @Test
    fun isComplete_falseWhenRoomMissingAValue() {
        // Change (r0,c2) from 3 to 1: the top room reads {1,2,1} -> not {1,2,3}.
        val badRoom = solved + ("2,0" to 1)
        assertFalse(RippleEffectEngine.isComplete(puzzle(canon2x3), badRoom))
    }

    // A 1x5 strip split into a size-2 room {c0,c1} and a size-3 room {c2,c3,c4}, so the
    // ripple spacing rule has to be enforced across the room boundary within the row.
    private val canon1x5 = """{
        "cells":[[0,0,0,0,0]],
        "edges":{"h":[],"v":[[0,1,0,0]]}
    }"""

    @Test
    fun isComplete_trueForValidRippleSpacing() {
        // 2 1 | 3 1 2 : rooms are {1,2} and {1,2,3}; the two 1s are 2 apart (>=K+1=2) and
        // the two 2s are 4 apart (>=K+1=3), so the ripple rule holds.
        val input = mapOf("0,0" to 2, "1,0" to 1, "2,0" to 3, "3,0" to 1, "4,0" to 2)
        assertTrue(RippleEffectEngine.isComplete(puzzle(canon1x5), input))
    }

    @Test
    fun isComplete_falseWhenRippleSpacingViolated() {
        // 1 2 | 1 2 3 : rooms are {1,2} and {1,2,3} (sizes satisfied), but the two 2s sit
        // only 2 cells apart, and K=2 needs them >=3 apart -> invalid.
        val input = mapOf("0,0" to 1, "1,0" to 2, "2,0" to 1, "3,0" to 2, "4,0" to 3)
        assertFalse(RippleEffectEngine.isComplete(puzzle(canon1x5), input))
    }
}
