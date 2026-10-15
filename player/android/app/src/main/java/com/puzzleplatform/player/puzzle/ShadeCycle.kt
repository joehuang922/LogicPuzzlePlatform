package com.puzzleplatform.player.puzzle

import com.puzzleplatform.player.data.model.Puzzle

/**
 * A puzzle whose player input is "shade or mark cells": each cell is empty, shaded (the
 * rule-bearing fill) or marked (a solver-aid dot). Implementing this opts the puzzle into
 * the shared tap-to-cycle interaction: the board forwards taps to
 * PlayViewModel.tapShadeCell, which applies [ShadeCycle.tap]. No paint modes, no drag.
 *
 * States are stored under [cellKey] using the [ShadeCycle] values (0 empty, 1 shaded,
 * 2 marked), with empty cells dropped from userValues.
 */
interface ShadeMarkEngine : PuzzleEngine {
    /** The userValues key for cell (col, row). */
    fun cellKey(col: Int, row: Int): String

    /**
     * The cells a tap on (col, row) acts on together, or null when the cell takes no input
     * (e.g. a Nurikabe clue). Defaults to just the tapped cell; room-level puzzles like
     * Nurimaze return the whole room.
     */
    fun shadeGroup(puzzle: Puzzle, col: Int, row: Int): ShadeGroup? = ShadeGroup(listOf(col to row))
}

/**
 * The cells (col, row) one tap cycles together. [canShade] is false for a group that may
 * only be marked (e.g. a Nurimaze room holding a symbol): it toggles empty <-> marked.
 */
data class ShadeGroup(val cells: List<Pair<Int, Int>>, val canShade: Boolean = true)

/** The shared tap-to-cycle rule for [ShadeMarkEngine] puzzles. */
object ShadeCycle {
    const val EMPTY = 0
    const val SHADED = 1
    const val MARKED = 2

    /** The state after one tap: empty -> shaded -> marked -> empty, skipping shaded if barred. */
    fun next(current: Int, canShade: Boolean = true): Int = when (current) {
        EMPTY -> if (canShade) SHADED else MARKED
        SHADED -> MARKED
        else -> EMPTY
    }

    /**
     * The userValues changes for a tap on (col, row): every cell of the tapped group moves
     * to the next state after the tapped cell's. Returns key -> state (0 means remove the
     * key), or an empty map when the cell takes no input.
     */
    fun tap(
        engine: ShadeMarkEngine,
        puzzle: Puzzle,
        userValues: Map<String, Int>,
        col: Int,
        row: Int,
    ): Map<String, Int> {
        val group = engine.shadeGroup(puzzle, col, row) ?: return emptyMap()
        val current = userValues[engine.cellKey(col, row)] ?: EMPTY
        val next = next(current, group.canShade)
        return group.cells.associate { (c, r) -> engine.cellKey(c, r) to next }
    }
}
