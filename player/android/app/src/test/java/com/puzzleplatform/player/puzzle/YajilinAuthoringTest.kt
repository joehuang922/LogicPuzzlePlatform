package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.puzzle.YajilinEngine.Clue
import com.puzzleplatform.player.puzzle.YajilinEngine.Dir
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure logic behind the Admin yajilin flow: parser canon -> editable draft -> canon
 * round-trips, clue and line edits, and the misread checks.
 */
class YajilinAuthoringTest {

    private val small = YajilinDraft(
        listOf(
            listOf(Clue(Dir.RIGHT, 1), null, null),
            listOf(null, null, Clue(Dir.UP, 0)),
        )
    )

    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test
    fun canonRoundTrips() {
        val canon = YajilinAuthoring.canonFromDraft(small)
        assertEquals(
            json("""{"cells":[[{"dir":"right","num":1},null,null],[null,null,{"dir":"up","num":0}]]}"""),
            canon,
        )
        assertEquals(small, YajilinAuthoring.draftFromCanon(canon))
    }

    @Test
    fun raggedRowsArePaddedAndMalformedCluesDropped() {
        val draft = YajilinAuthoring.draftFromCanon(
            json("""{"cells":[[{"dir":"down","num":2},{"dir":"sideways","num":1}],[null]]}""")
        )
        assertEquals(listOf(listOf(Clue(Dir.DOWN, 2), null), listOf(null, null)), draft.cells)
    }

    @Test
    fun clueEdits() {
        // A direction on an empty cell makes a 0 clue; a later direction keeps the count.
        var d = YajilinAuthoring.setDir(small, col = 1, row = 0, dir = Dir.DOWN)
        assertEquals(Clue(Dir.DOWN, 0), d.cellAt(1, 0))
        d = YajilinAuthoring.setNum(d, col = 1, row = 0, num = 1)
        d = YajilinAuthoring.setDir(d, col = 1, row = 0, dir = Dir.LEFT)
        assertEquals(Clue(Dir.LEFT, 1), d.cellAt(1, 0))
        assertNull(YajilinAuthoring.clear(d, col = 1, row = 0).cellAt(1, 0))
        // Count on an empty cell, negative counts, and off-grid edits are no-ops.
        assertEquals(small, YajilinAuthoring.setNum(small, col = 1, row = 1, num = 2))
        assertEquals(small, YajilinAuthoring.setNum(small, col = 0, row = 0, num = -1))
        assertEquals(small, YajilinAuthoring.setDir(small, col = 5, row = 0, dir = Dir.UP))
    }

    @Test
    fun addAndRemoveLines() {
        val grown = YajilinAuthoring.addCol(YajilinAuthoring.addRow(small))
        assertEquals(3, grown.rows)
        assertEquals(4, grown.cols)
        val shrunk = YajilinAuthoring.removeCol(YajilinAuthoring.removeRow(small, 0), 2)
        assertEquals(listOf(listOf<Clue?>(null, null)), shrunk.cells)
        val one = YajilinDraft(listOf(listOf(Clue(Dir.UP, 0))))
        assertEquals(one, YajilinAuthoring.removeRow(one, 0))
        assertEquals(one, YajilinAuthoring.removeCol(one, 0))
    }

    @Test
    fun maxShadedSkipsClueCells() {
        // Row: clue, 3 free, clue, 2 free -> ceil(3/2) + ceil(2/2) = 3.
        val row = YajilinDraft(listOf(listOf(Clue(Dir.RIGHT, 0), null, null, null, Clue(Dir.UP, 0), null, null)))
        assertEquals(3, YajilinAuthoring.maxShaded(row, 0, 0, Dir.RIGHT))
        assertEquals(0, YajilinAuthoring.maxShaded(row, 0, 0, Dir.LEFT))
    }

    @Test
    fun problems() {
        assertTrue(YajilinAuthoring.problems(small).isEmpty())
        assertEquals(listOf("No cells"), YajilinAuthoring.problems(YajilinDraft()))
        assertEquals(listOf("No clues"), YajilinAuthoring.problems(YajilinDraft(listOf(listOf(null, null)))))
        assertEquals(
            listOf("R1C1 →2 can't fit: at most 1 shaded that way"),
            YajilinAuthoring.problems(YajilinAuthoring.setNum(small, 0, 0, 2)),
        )
        // A clue pointing straight off the grid can only be 0.
        assertEquals(
            listOf("R1C1 ←1 can't fit: at most 0 shaded that way"),
            YajilinAuthoring.problems(YajilinAuthoring.setDir(small, 0, 0, Dir.LEFT)),
        )
    }
}
