package com.puzzleplatform.player.data

import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.data.model.SizeTag
import com.puzzleplatform.player.data.model.sizeTag
import com.puzzleplatform.player.ui.screens.groupTypePuzzlesByCollection
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SizeTagTest {
    private fun p(
        type: Int,
        w: Int? = null,
        h: Int? = null,
        canon: JsonObject = JsonObject(emptyMap()),
        title: String? = null,
        collection: String? = null,
    ) = Puzzle(
        id = "$type-$w-$h-$title-$collection",
        puzzleType = type,
        puzzleTypeName = "",
        puzzleTypeJpLabel = "",
        title = title,
        difficulty = 1,
        width = w,
        height = h,
        canonRepr = canon,
        srcCollectionName = collection,
    )

    private fun subboards(n: Int) = JsonObject(mapOf("subboards" to JsonArray(List(n) { JsonObject(emptyMap()) })))
    private fun hints(n: Int) = JsonObject(mapOf("hints" to JsonArray(List(n) { JsonArray(emptyList()) })))

    @Test
    fun sudokuBySide() {
        assertNull(p(1, 9, 9).sizeTag())
        assertNull(p(1, 12, 12).sizeTag())
        assertEquals(SizeTag.BIG, p(1, 16, 16).sizeTag())
        assertEquals(SizeTag.GIANT, p(1, 25, 25).sizeTag())
        assertEquals(SizeTag.GIANT, p(1, 30, 30).sizeTag())
        // No stored size: read the hints grid.
        assertEquals(SizeTag.BIG, p(1, canon = hints(16)).sizeTag())
    }

    @Test
    fun comboSudokuBySubboards() {
        assertNull(p(2, 21, 21, subboards(9)).sizeTag())
        assertEquals(SizeTag.BIG, p(2, 21, 21, subboards(10)).sizeTag())
        assertEquals(SizeTag.GIANT, p(2, 21, 21, subboards(20)).sizeTag())
    }

    @Test
    fun nonogramByCells() {
        assertNull(p(6, 50, 59).sizeTag())
        assertEquals(SizeTag.BIG, p(6, 50, 60).sizeTag())
        assertEquals(SizeTag.GIANT, p(6, 100, 100).sizeTag())
    }

    @Test
    fun otherTypesByCells() {
        assertNull(p(5, 30, 33).sizeTag())
        assertEquals(SizeTag.BIG, p(5, 40, 25).sizeTag())
        assertEquals(SizeTag.GIANT, p(5, 50, 40).sizeTag())
        assertNull(p(5).sizeTag())
    }

    @Test
    fun typePuzzlesGroupByCollectionNameThenTitle() {
        val groups = groupTypePuzzlesByCollection(
            listOf(
                p(5, title = "b", collection = "Vol 2"),
                p(5, title = "z", collection = null),
                p(5, title = "B2", collection = "alpha"),
                p(5, title = "a", collection = "Vol 2"),
                p(5, title = "a1", collection = "alpha"),
            )
        )
        assertEquals(listOf("alpha", "Vol 2", "Uncategorized"), groups.map { it.collectionName })
        assertEquals(listOf("a1", "B2"), groups[0].puzzles.map { it.title })
        assertEquals(listOf("a", "b"), groups[1].puzzles.map { it.title })
    }
}
