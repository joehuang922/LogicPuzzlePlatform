package com.puzzleplatform.player.puzzle

/**
 * A tiny grid-of-colored-cells preview of a solved puzzle's "picture", produced by
 * [PuzzleEngine.renderThumbnail] and drawn by the shared SolvedThumbnail composable.
 *
 * [cells] is row-major, length [width] * [height]; each entry is a packed ARGB color,
 * with 0 (fully transparent) meaning "blank" and skipped when drawn. This collapses the
 * picture-type puzzles to one common shape: a Nonogram's fills are black-or-blank, and a
 * Tentaishow (once ported) colors each cell by its region's dot.
 *
 * Deliberately free of Android/Compose types so engines stay JVM-unit-testable — the UI
 * layer converts each Int to a Compose Color at draw time.
 */
class PuzzleThumbnail(
    val width: Int,
    val height: Int,
    val cells: IntArray,
)
