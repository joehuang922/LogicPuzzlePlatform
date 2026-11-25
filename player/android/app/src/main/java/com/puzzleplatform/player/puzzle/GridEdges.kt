package com.puzzleplatform.player.puzzle

/**
 * Grow or shrink a row-major grid at one of its edges, for the admin editors' resize
 * controls: a parser can miss or invent a line on any side, so every editor whose board has
 * no special first row / column adds and removes at the top and left as well as the bottom
 * and right. Types with one (Kakuro and Tile Paint's clue lines, Irregular Nonogram and
 * Picturesque Maze's shapes) keep bottom / right only.
 */

/** This grid with a row of [fill] added at the top or bottom, [width] cells wide. */
internal fun <T> List<List<T>>.plusEdgeRow(top: Boolean, width: Int, fill: T): List<List<T>> {
    val line = List(width) { fill }
    return if (top) listOf(line) + this else this + listOf(line)
}

/** This grid with a cell of [fill] added at the left or right of every row. */
internal fun <T> List<List<T>>.plusEdgeCol(left: Boolean, fill: T): List<List<T>> =
    map { if (left) listOf(fill) + it else it + fill }

/** This grid without its top or bottom row. */
internal fun <T> List<List<T>>.minusEdgeRow(top: Boolean): List<List<T>> = if (top) drop(1) else dropLast(1)

/** This grid without its left or right column. */
internal fun <T> List<List<T>>.minusEdgeCol(left: Boolean): List<List<T>> =
    map { if (left) it.drop(1) else it.dropLast(1) }

/**
 * This grid moved by [dr] rows and [dc] columns (each -1, 0 or 1): 1 adds a line of [fill]
 * at the top / left, -1 drops the first one. [width] is the grid's width before the move.
 * A resize-only authoring shifts its board this way, then trims / pads it to the new size.
 */
internal fun <T> List<List<T>>.shifted(dr: Int, dc: Int, width: Int, fill: T): List<List<T>> {
    var g = this
    if (dr > 0) g = g.plusEdgeRow(true, width, fill) else if (dr < 0) g = g.minusEdgeRow(true)
    if (dc > 0) g = g.plusEdgeCol(true, fill) else if (dc < 0) g = g.minusEdgeCol(true)
    return g
}

/** dr / dc for a line added (+1) or removed (-1) at the top / left, 0 at the bottom / right. */
internal fun edgeShift(atStart: Boolean, add: Boolean): Int = if (!atStart) 0 else if (add) 1 else -1
