package com.puzzleplatform.player.data.model

import kotlinx.serialization.json.JsonArray

/** The size pill a big puzzle carries in Home lists. */
enum class SizeTag(val label: String) { BIG("BIG"), GIANT("GIANT") }

private const val SUDOKU = 1
private const val COMBO_SUDOKU = 2
private const val NONOGRAM = 6

/**
 * BIG / GIANT for an oversized puzzle, null otherwise:
 * - sudoku: 16x16 and up is BIG, 25x25 and up GIANT;
 * - combo sudoku: 10+ subboards BIG, 20+ GIANT;
 * - nonogram: 3000+ cells BIG, 10000+ GIANT;
 * - every other type: 1000+ cells BIG, 2000+ GIANT.
 */
fun Puzzle.sizeTag(): SizeTag? = when (puzzleType) {
    SUDOKU -> tagFor(sudokuSide(), big = 16, giant = 25)
    COMBO_SUDOKU -> tagFor((canonRepr["subboards"] as? JsonArray)?.size ?: 0, big = 10, giant = 20)
    NONOGRAM -> tagFor(cellCount(), big = 3000, giant = 10000)
    else -> tagFor(cellCount(), big = 1000, giant = 2000)
}

private fun tagFor(value: Int, big: Int, giant: Int): SizeTag? = when {
    value >= giant -> SizeTag.GIANT
    value >= big -> SizeTag.BIG
    else -> null
}

private fun Puzzle.cellCount(): Int = (width ?: 0) * (height ?: 0)

/** A sudoku's side: the stored width, else the hints grid's row count. */
private fun Puzzle.sudokuSide(): Int =
    maxOf(width ?: 0, height ?: 0).takeIf { it > 0 }
        ?: (canonRepr["hints"] as? JsonArray)?.size ?: 0

