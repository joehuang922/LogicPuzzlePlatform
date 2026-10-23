package com.puzzleplatform.player.data

import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.defaultCollection
import com.puzzleplatform.player.data.model.sortedForDisplay
import org.junit.Assert.assertEquals
import org.junit.Test

class CollectionOrderTest {
    private fun c(id: Int, name: String, publisher: String?, publishAt: String?) =
        Collection(id = id, name = name, publisher = publisher, publishAt = publishAt, puzzleCount = 1)

    @Test
    fun ordersByPublisherThenNameThenNewestDateWithDefaultLast() {
        val input = listOf(
            defaultCollection(5),
            c(1, "Vol 1", null, "2024-01-01"),
            c(2, "Beta", "nikoli", "2023-01-01"),
            c(3, "Alpha", "Nikoli", "2022-01-01"),
            c(4, "Alpha", "Nikoli", "2024-01-01"),
            c(5, "Alpha", "Nikoli", null),
            c(6, "Zeta", "Conceptis", "2020-01-01"),
        )
        assertEquals(listOf(6, 4, 3, 5, 2, 1, 0), input.sortedForDisplay().map { it.id })
    }
}
