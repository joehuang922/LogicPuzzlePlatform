package com.puzzleplatform.player.data

import com.puzzleplatform.player.data.local.CollectionEntity
import com.puzzleplatform.player.data.local.PuzzleTypeEntity
import com.puzzleplatform.player.data.local.toLocalEntity
import com.puzzleplatform.player.data.local.toModel
import com.puzzleplatform.player.data.model.CreatePuzzleRequest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class WriteThroughEntityTest {
    private val json = Json
    private val canon = buildJsonObject { put("hints", JsonPrimitive("1..2")) }
    private val req = CreatePuzzleRequest(
        puzzleType = 3,
        difficulty = 2,
        canonRepr = canon,
        title = "No. 7",
        author = "anon",
        width = 9,
        height = 9,
        srcCollection = 12,
    )

    @Test
    fun buildsRowFromRequestAndCachedLookups() {
        val entity = req.toLocalEntity(
            id = "q-1",
            json = json,
            type = PuzzleTypeEntity(3, "sudoku", "数独", "rule"),
            collection = CollectionEntity(12, "Vol 1", "Nikoli", null, "cover.png", 4),
        )
        assertEquals("sudoku", entity.puzzleTypeName)
        assertEquals("数独", entity.puzzleTypeJpLabel)
        assertEquals("Vol 1", entity.srcCollectionName)
        assertEquals("cover.png", entity.srcCollectionCoverSrc)
        assertFalse(entity.special)
        assertNull(entity.solutionRepr)
        assertNull(entity.updatedAt)
        // Round-trips back into the model the Play screen reads.
        val model = entity.toModel(json)
        assertEquals("q-1", model.id)
        assertEquals(canon, model.canonRepr)
        assertEquals(12, model.srcCollection)
        assertEquals(9, model.width)
    }

    @Test
    fun toleratesMissingLookups() {
        val entity = req.copy(srcCollection = null).toLocalEntity("q-2", json, type = null, collection = null)
        assertEquals("", entity.puzzleTypeName)
        assertNull(entity.srcCollection)
        assertNull(entity.srcCollectionName)
    }
}
