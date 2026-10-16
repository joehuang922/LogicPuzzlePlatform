package com.puzzleplatform.player.puzzle

/**
 * Pure, Android-free rules for the Admin batch-authoring flow, kept out of the
 * ViewModel so they stay JVM-unit-testable.
 *
 * The batch is a list of tiles, each parsed from one image and created on its own
 * through the server's solver gate. [ItemStatus] tracks where a tile is in that
 * lifecycle; [BatchRules] answers "should this tile be sent on the next
 * Create-all-valid press?" and "what difficulty does it resolve to?".
 */
enum class ItemStatus {
    /** Picked, not yet parsed. */
    PENDING,

    /** Parse request in flight. */
    PARSING,

    /** Parsed; grid seeded and editable; eligible to create. */
    PARSED,

    /** Parse failed (OCR/network); re-parse to retry. */
    PARSE_FAILED,

    /** Create request in flight. */
    CREATING,

    /** Created on the server; carries the new id; dropped from the eligible set. */
    CREATED,

    /** The solver gate (or network) rejected the create; fix and retry. */
    CREATE_FAILED,
}

object BatchRules {

    /**
     * A tile is sent on "Create all valid" only when it has a parsed grid and isn't
     * already created. This is what makes the button re-runnable: created tiles drop
     * out, so a second press sends only the rest. A tile the user doesn't want is
     * removed from the batch outright, so there's no "excluded but present" state.
     *
     * CREATE_FAILED is intentionally *not* eligible on its own — editing the tile
     * (which resets it to PARSED, see [afterEdit]) is what re-arms it, so a press that
     * changes nothing doesn't blindly re-POST a board the gate just rejected.
     */
    fun isEligibleToCreate(status: ItemStatus, createdId: String?): Boolean =
        status == ItemStatus.PARSED && createdId == null

    /** A tile's effective difficulty: its own override, else the shared batch default. */
    fun resolveDifficulty(itemDifficulty: Int?, defaultDifficulty: Int): Int =
        itemDifficulty ?: defaultDifficulty

    /**
     * The status an already-parsed tile returns to after the user edits its grid.
     * A CREATE_FAILED tile becomes PARSED again (re-eligible); a CREATED tile is left
     * alone (editing a shipped puzzle shouldn't silently queue a duplicate); anything
     * else keeps its status.
     */
    fun afterEdit(status: ItemStatus): ItemStatus =
        if (status == ItemStatus.CREATE_FAILED) ItemStatus.PARSED else status
}
