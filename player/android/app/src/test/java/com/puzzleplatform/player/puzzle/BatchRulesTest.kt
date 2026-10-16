package com.puzzleplatform.player.puzzle

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The pure rules that make the Admin batch "Create all valid" button re-runnable and
 * idempotent at the UI level. These live outside the ViewModel so they're testable
 * without Compose/Android.
 */
class BatchRulesTest {

    @Test
    fun `only a parsed, not-excluded, not-created tile is eligible`() {
        assertTrue(BatchRules.isEligibleToCreate(ItemStatus.PARSED, excluded = false, createdId = null))
    }

    @Test
    fun `excluded tile is never eligible`() {
        assertFalse(BatchRules.isEligibleToCreate(ItemStatus.PARSED, excluded = true, createdId = null))
    }

    @Test
    fun `already-created tile drops out of the eligible set`() {
        // This is the idempotency guarantee: pressing Create again won't re-POST it.
        assertFalse(BatchRules.isEligibleToCreate(ItemStatus.CREATED, excluded = false, createdId = "42"))
    }

    @Test
    fun `non-parsed statuses are not eligible`() {
        for (status in listOf(
            ItemStatus.PENDING,
            ItemStatus.PARSING,
            ItemStatus.PARSE_FAILED,
            ItemStatus.CREATING,
            ItemStatus.CREATE_FAILED,
        )) {
            assertFalse(
                "status $status should not be eligible",
                BatchRules.isEligibleToCreate(status, excluded = false, createdId = null),
            )
        }
    }

    @Test
    fun `a create-failed tile is only re-armed by an edit`() {
        // Pressing Create again changes nothing (gate just rejected it)...
        assertFalse(BatchRules.isEligibleToCreate(ItemStatus.CREATE_FAILED, excluded = false, createdId = null))
        // ...until the user edits the grid, which resets it to PARSED...
        val reArmed = BatchRules.afterEdit(ItemStatus.CREATE_FAILED)
        assertEquals(ItemStatus.PARSED, reArmed)
        // ...and now it's eligible again.
        assertTrue(BatchRules.isEligibleToCreate(reArmed, excluded = false, createdId = null))
    }

    @Test
    fun `editing leaves non-failed statuses untouched`() {
        // A created tile stays created (editing a shipped puzzle must not queue a dup).
        assertEquals(ItemStatus.CREATED, BatchRules.afterEdit(ItemStatus.CREATED))
        assertEquals(ItemStatus.PARSED, BatchRules.afterEdit(ItemStatus.PARSED))
    }

    @Test
    fun `difficulty resolves to the item override when set, else the default`() {
        assertEquals(4, BatchRules.resolveDifficulty(itemDifficulty = 4, defaultDifficulty = 3))
        assertEquals(3, BatchRules.resolveDifficulty(itemDifficulty = null, defaultDifficulty = 3))
    }
}
