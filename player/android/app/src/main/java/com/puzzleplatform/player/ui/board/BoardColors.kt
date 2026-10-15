package com.puzzleplatform.player.ui.board

import androidx.compose.ui.graphics.Color

/** Colors shared across board renderers. */
object BoardColors {
    /**
     * Fill for a player-shaded cell on any board whose grid is divided into rooms by thick
     * black borders (LITS, Nuritwin, Nurimaze, and Heyawake/Norinori when they're ported).
     * A near-black fill like #333 swallows those borders wherever two shaded cells meet
     * across a room boundary, so the room layout disappears exactly where the player needs
     * it. A medium gray keeps the shade obvious while the black borders still read through.
     * Every room-bordered board must use this rather than its own dark fill; matches
     * ROOM_SHADE in frontend/src/components/boardColors.ts.
     *
     * Text on top of it (e.g. a clue in a shaded cell) should be black: white, which suited
     * the old dark fill, has poor contrast on this gray.
     */
    val ROOM_SHADE = Color(0xFF9E9E9E)
}
