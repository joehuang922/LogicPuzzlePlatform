package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Mirrors frontend/src/components/skeletonPuzzleRules.test.ts. */
class SkeletonPuzzleEngineTest {

    // The doc's example: サクラ across row 0, ラッパ down column 2, sharing the ラ.
    private val canon = """{"cells":[[1,1,1],[0,0,1],[0,0,1]],"words":[{"word":"サクラ","hint":"桜"},{"word":"ラッパ"}]}"""
    private val puzzle = Puzzle(
        id = "skel",
        puzzleType = 35,
        puzzleTypeName = "skeleton-puzzle",
        puzzleTypeJpLabel = "スケルトンパズル",
        difficulty = 2,
        canonRepr = Json.parseToJsonElement(canon) as JsonObject,
    )
    private val board = SkeletonPuzzleEngine.parse(puzzle)
    private val slots = SkeletonRules.findSlots(board.cells)

    @Test
    fun numbersSlotsAcrossFirstThenDown() {
        assertEquals(
            listOf(SkeletonRules.Slot(0, 0, 0, SkeletonRules.Dir.ACROSS, 3), SkeletonRules.Slot(1, 0, 2, SkeletonRules.Dir.DOWN, 3)),
            slots,
        )
        assertEquals(listOf(SkeletonRules.Dir.ACROSS, SkeletonRules.Dir.DOWN), SkeletonRules.slotsAt(slots, 0, 2).map { it.dir })
    }

    @Test
    fun writesSmallKanaFullSize() {
        assertEquals(listOf("ラ", "ツ", "パ"), SkeletonRules.boardLetters("ラッパ"))
        assertEquals(listOf("じ", "や", "が", "い", "も"), SkeletonRules.boardLetters("じゃがいも"))
    }

    @Test
    fun offersOnlyUnusedWordsThatFit() {
        assertEquals(listOf(0, 1), SkeletonRules.candidates(board, slots, emptyMap(), slots[0]))
        assertEquals(emptyList<Int>(), SkeletonRules.candidates(board, slots, mapOf(0 to 1), slots[1]))
        assertEquals(listOf(1), SkeletonRules.candidates(board, slots, mapOf(0 to 0), slots[1]))
    }

    @Test
    fun solvesTheExample() {
        val values = mapOf("p:0" to 1, "p:1" to 2)
        assertTrue(SkeletonPuzzleEngine.isComplete(puzzle, values))
        assertEquals(100.0, SkeletonPuzzleEngine.computeProgress(puzzle, values), 1e-9)
        assertEquals(
            listOf(listOf("サ", "ク", "ラ"), listOf("", "", "ツ"), listOf("", "", "パ")),
            SkeletonRules.grid(board, slots, SkeletonRules.placements(values, slots.size, board.words.size)),
        )
    }

    @Test
    fun rejectsAClashOrAMissingWord() {
        assertFalse(SkeletonPuzzleEngine.isComplete(puzzle, mapOf("p:0" to 2, "p:1" to 1)))
        assertFalse(SkeletonPuzzleEngine.isComplete(puzzle, mapOf("p:0" to 1)))
        assertEquals(60.0, SkeletonPuzzleEngine.computeProgress(puzzle, mapOf("p:0" to 1)), 1e-9)
    }

    @Test
    fun answerRoundTrips() {
        val values = mapOf("p:0" to 1, "p:1" to 2)
        val answer = SkeletonPuzzleEngine.extractAnswer(puzzle, values)
        assertEquals(
            """{"placements":[{"word":0,"r":0,"c":0,"dir":"across"},{"word":1,"r":0,"c":2,"dir":"down"}]}""",
            answer.toString(),
        )
        assertEquals(values, SkeletonPuzzleEngine.restoreUserValues(puzzle, answer))
    }

    @Test
    fun listsFormatProblemsAndWarnings() {
        assertEquals(emptyList<String>(), SkeletonRules.formatProblems(board))
        val bad = board.copy(words = listOf(board.words[0], SkeletonRules.Word("ab"), SkeletonRules.Word("ア")))
        assertEquals(
            listOf(
                "Word 2 \"ab\" must be kana (and ー) only",
                "Word 3 \"ア\" is under 2 letters",
                "0 slots of length 1 but 1 word of 1 letter",
                "0 slots of length 2 but 1 word of 2 letters",
                "2 slots of length 3 but 1 word of 3 letters",
            ),
            SkeletonRules.formatProblems(bad),
        )
        assertEquals(
            listOf("Mark A at R2C1 is not on a cell"),
            SkeletonRules.formatProblems(board.copy(marks = listOf(SkeletonRules.Mark(1, 0, "A")))),
        )
        assertEquals(
            listOf("R1C1 is a cell in no slot"),
            SkeletonRules.warnings(SkeletonRules.Board(cells = listOf(listOf(1, 0, 1, 1)))),
        )
    }

    @Test
    fun parsesWordLinesWithHints() {
        assertEquals(
            listOf(SkeletonRules.Word("アイコ", "トマト"), SkeletonRules.Word("コイアジ", "こいあじ／トマト"), SkeletonRules.Word("モギリ")),
            SkeletonRules.parseWordLines("アイコ (トマト)\nコイアジ（こいあじ／トマト）\n\nモギリ"),
        )
        assertEquals("サクラ (桜)\nラッパ", SkeletonRules.wordLines(board.words))
    }
}
