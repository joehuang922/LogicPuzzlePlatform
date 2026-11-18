package com.puzzleplatform.player.data.model

import com.puzzleplatform.player.data.local.toEntity
import com.puzzleplatform.player.data.local.toModel
import org.junit.Assert.assertEquals
import org.junit.Test

class PuzzleTypeOrderTest {

    private fun t(id: Int, incubating: Boolean = false) = PuzzleType(id, "t$id", "", "", incubating = incubating)

    @Test
    fun incubatingTypesComeLast_eachGroupById() {
        val ordered = listOf(t(37, true), t(2), t(36), t(5, true), t(1)).inTypeOrder()
        assertEquals(listOf(1, 2, 36, 5, 37), ordered.map { it.id })
    }

    @Test
    fun theRoomCacheKeepsTheFlag() {
        assertEquals(true, t(37, true).toEntity().toModel().incubating)
        assertEquals(false, t(1).toEntity().toModel().incubating)
    }
}
