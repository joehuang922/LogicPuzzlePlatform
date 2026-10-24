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
     * A tile is sent on "Create all valid" only when it has a parsed grid, isn't
     * already created, and [hasProblems] is false (the red tiles — the type's
     * `problems()` check found something that can't be right). This is what makes the
     * button re-runnable: created tiles drop out, so a second press sends only the rest.
     * A tile the user doesn't want is removed from the batch outright, so there's no
     * "excluded but present" state.
     *
     * A red tile is held back because not every type has a solver gate behind it, so
     * sending it could store a broken board. The review screen's "Create anyway" sends
     * one on purpose ([canCreateAnyway]) unless the problem is a format problem.
     *
     * CREATE_FAILED is intentionally *not* eligible on its own — editing the tile
     * (which resets it to PARSED, see [afterEdit]) is what re-arms it, so a press that
     * changes nothing doesn't blindly re-POST a board the gate just rejected.
     */
    fun isEligibleToCreate(status: ItemStatus, createdId: String?, hasProblems: Boolean): Boolean =
        status == ItemStatus.PARSED && createdId == null && !hasProblems

    /**
     * A red tile that "Create all valid" skips but the admin may still send by hand —
     * not when [hasFormatProblems] (the grid can't be expressed as its canon, e.g. a
     * non-rectangular heyawake room or a ripple effect wall that closes off nothing),
     * which only fixing the grid clears.
     */
    fun canCreateAnyway(
        status: ItemStatus,
        createdId: String?,
        hasProblems: Boolean,
        hasFormatProblems: Boolean,
    ): Boolean = status == ItemStatus.PARSED && createdId == null && hasProblems && !hasFormatProblems

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

/**
 * The puzzle types the Admin batch flow can author from photos. [puzzleType] is what the
 * parser is asked for and what the created question is stored as.
 */
/**
 * [jpLabel] is the type's Japanese name, as the web admin's type dropdown shows it.
 * Predefined so the dropdown never waits on the network; it must match `jp_label` in
 * `player/api/seed.sql` (checked by `AuthoringTypeTest`).
 */
enum class AuthoringType(val label: String, val jpLabel: String, val puzzleType: Int) {
    SUDOKU("Sudoku", "数独", SudokuAuthoring.PUZZLE_TYPE),
    NONOGRAM("Nonogram", "お絵かきロジック", NonogramAuthoring.PUZZLE_TYPE),
    KAKURO("Kakuro", "カックロ", KakuroAuthoring.PUZZLE_TYPE),
    SLITHERLINK("Slitherlink", "スリザーリンク", SlitherlinkAuthoring.PUZZLE_TYPE),
    NURIKABE("Nurikabe", "ぬりかべ", NurikabeAuthoring.PUZZLE_TYPE),
    HEYAWAKE("Heyawake", "へやわけ", HeyawakeAuthoring.PUZZLE_TYPE),
    PICTO_LINK("Picto Link", "ピクトリンク", PictoLinkAuthoring.PUZZLE_TYPE),
    YAJILIN("Yajilin", "ヤジリン", YajilinAuthoring.PUZZLE_TYPE),
    RIPPLE_EFFECT("Ripple Effect", "波及効果", RippleEffectAuthoring.PUZZLE_TYPE),
}
