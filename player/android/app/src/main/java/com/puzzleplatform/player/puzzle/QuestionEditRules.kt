package com.puzzleplatform.player.puzzle

/**
 * Pure rules for the Admin question editor (editing an existing question), kept out
 * of the ViewModel so they stay JVM-unit-testable.
 *
 * A save sends the board only when it changed: an untouched board isn't re-sent, so a
 * metadata-only save never re-runs the server's solver gate (which could time out on a
 * board it already stored as "unknown").
 */
object QuestionEditRules {

    enum class SaveGate {
        /** Nothing stands in the way of saving. */
        READY,

        /** The changed board has misread warnings; saving needs a deliberate "Save anyway". */
        NEEDS_CONFIRM,

        /** The changed board has format problems; it can't be saved until they're fixed. */
        BLOCKED,
    }

    fun saveGate(boardChanged: Boolean, hasProblems: Boolean, hasFormatProblems: Boolean): SaveGate = when {
        !boardChanged -> SaveGate.READY
        hasFormatProblems -> SaveGate.BLOCKED
        hasProblems -> SaveGate.NEEDS_CONFIRM
        else -> SaveGate.READY
    }
}
